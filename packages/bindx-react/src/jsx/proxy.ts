import type { SnapshotStore, FieldError } from '@contember/bindx'
import { SelectionScope, generatePlaceholderId } from '@contember/bindx'
import {
	type EntityRef,
	type EntityAccessor,
	type EntityFields,
	type FieldRef,
	type HasManyRef,
	type HasOneRef,
	FIELD_REF_META,
	SCOPE_REF,
} from './types.js'
import { deepEqual } from '@contember/bindx'

// Re-export SCOPE_REF for use in other modules
export { SCOPE_REF }

/**
 * Notify change callback type
 */
type NotifyChange = () => void

/**
 * Known properties on entity accessor that should NOT be treated as field access.
 * Properties are accessed with $ prefix for consistency with EntityHandle.
 * Used by both collector and runtime proxies.
 */
const ENTITY_ACCESSOR_PROPERTIES = new Set([
	'id',
	'$fields', '$data', '$isDirty', '$persistedId', '$isNew',
	'$errors', '$hasError', '$addError', '$clearErrors', '$clearAllErrors',
	'$on', '$intercept', '$onPersisted', '$interceptPersisting',
	'__entityType', '__entityName', '__availableRoles',
])

/**
 * Wraps an EntityRef in a Proxy that supports direct field access.
 * - `entity.fieldName` is equivalent to `entity.$fields.fieldName`
 * - Known accessor properties pass through to the target
 */
function wrapEntityRefWithFieldAccessProxy<T>(ref: EntityRef<T>): EntityAccessor<T> {
	return new Proxy(ref, {
		get(target, prop) {
			// Symbols - pass through
			if (typeof prop !== 'string') {
				return Reflect.get(target, prop)
			}

			// Known accessor properties - pass through
			if (ENTITY_ACCESSOR_PROPERTIES.has(prop)) {
				return Reflect.get(target, prop)
			}

			// Otherwise, treat as field access
			return target.$fields[prop as keyof EntityFields<T>]
		},
	}) as EntityAccessor<T>
}

/**
 * Creates a collector proxy for the collection phase.
 * This proxy captures field access and builds selection metadata using SelectionScope.
 * Supports direct field access: `entity.fieldName` is equivalent to `entity.$fields.fieldName`.
 *
 * @param scope - The SelectionScope to collect fields into
 */
export function createCollectorProxy<T>(
	scope: SelectionScope,
): EntityAccessor<T> {
	const fieldsProxy = new Proxy({} as EntityFields<T>, {
		get(_, fieldName: string): FieldRef<unknown> | HasManyRef<unknown> | HasOneRef<unknown> {
			// Return a collector ref that works for all field types
			// The actual type (scalar/hasMany/hasOne) will be determined
			// by how it's used in components
			return createCollectorFieldRef(scope, fieldName)
		},
	})

	const noop = () => () => {}

	const ref: EntityRef<T> = {
		id: '__collector__',
		$fields: fieldsProxy,
		$data: null,
		$isDirty: false,
		$persistedId: null,
		$isNew: true,
		__entityType: undefined as unknown as T,
		__entityName: '__collector__',
		__availableRoles: [] as readonly string[],
		__schema: {} as Record<string, object>,
		// Error properties (stubs for collection phase)
		$errors: [],
		$hasError: false,
		$addError: () => {},
		$clearErrors: () => {},
		$clearAllErrors: () => {},
		// Event methods (stubs for collection phase)
		$on: noop,
		$intercept: noop,
		$onPersisted: noop,
		$interceptPersisting: noop,
	}

	// Add scope reference for nested component merging
	// This is an internal implementation detail, not part of public EntityRef interface
	;(ref as unknown as Record<symbol, unknown>)[SCOPE_REF] = scope

	// Wrap in Proxy to support direct field access
	return wrapEntityRefWithFieldAccessProxy(ref)
}

/**
 * Combined ref type for collector that satisfies all ref interfaces
 */
type CollectorRef = FieldRef<unknown> & HasManyRef<unknown> & HasOneRef<unknown>

/**
 * Creates a field reference for collection phase using SelectionScope.
 *
 * Key design:
 * - Initially marks field as scalar
 * - Lazily creates child scope when relation access happens (.fields, .entity, .map)
 * - Child scope creation automatically upgrades from scalar to relation
 *
 * @param parentScope - The parent SelectionScope
 * @param fieldName - The field being accessed
 */
function createCollectorFieldRef(
	parentScope: SelectionScope,
	fieldName: string,
): CollectorRef {
	// Initially add as scalar (will be upgraded to relation if .fields/.entity/.map is accessed)
	parentScope.addScalar(fieldName)

	// Lazy child scope - created only when relation access happens
	let childScope: SelectionScope | null = null

	const getChildScope = (): SelectionScope => {
		if (!childScope) {
			// This automatically removes from scalars and creates relation
			childScope = parentScope.child(fieldName)
		}
		return childScope
	}

	const meta = {
		entityType: '', // Collection phase - no entity
		entityId: '', // Collection phase - no entity
		path: [fieldName],
		fieldName,
		isArray: false as boolean,
		isRelation: false as boolean,
	}

	const noop = () => () => {}
	const placeholderId = generatePlaceholderId()

	const hasOneFieldsProxy = new Proxy({} as EntityFields<unknown>, {
		get(_, nestedFieldName: string) {
			// Get child scope (upgrades to relation)
			const scope = getChildScope()
			// Create nested field ref in the child scope
			return createCollectorFieldRef(scope, nestedFieldName)
		},
	})

	const mapFn = <R>(fn: (item: EntityAccessor<unknown>, index: number) => R): R[] => {
		// Get child scope and mark as array relation
		const scope = getChildScope()
		parentScope.markAsArray(fieldName)
		// Call fn once with collector to gather nested selection
		fn(createCollectorProxy<unknown>(scope), 0)
		return []
	}

	// Return object that satisfies all ref interfaces
	// Components will use only the parts they need
	return {
		[FIELD_REF_META]: meta,

		// FieldRef properties (non-$ versions)
		value: null,
		serverValue: null,
		isDirty: false,
		isTouched: false,
		touch: () => {},
		setValue: () => {},
		inputProps: { value: null, setValue: () => {} },
		errors: [],
		hasError: false,
		addError: () => {},
		clearErrors: () => {},
		onChange: noop,
		onChanging: noop,

		// HasManyRef properties (non-$ versions)
		length: 0,
		items: [],
		map: mapFn,
		add: () => '',
		remove: () => {},
		move: () => {},
		connect: () => {},
		disconnect: () => {},
		reset: () => {},
		onItemConnected: noop,
		onItemDisconnected: noop,
		interceptItemConnecting: noop,
		interceptItemDisconnecting: noop,

		// HasOneRef properties ($ prefix only - for collision safety)
		$state: 'disconnected' as const,
		$id: placeholderId,
		$isDirty: false,
		$fields: hasOneFieldsProxy,
		get $entity(): EntityAccessor<unknown> {
			// Get child scope (upgrades to relation) and return proxy with scope
			const scope = getChildScope()
			return createCollectorProxy<unknown>(scope)
		},
		$delete: () => {},
		$errors: [],
		$hasError: false,
		$addError: () => {},
		$clearErrors: () => {},
		$connect: () => {},
		$disconnect: () => {},
		$reset: () => {},
		$onConnect: noop,
		$onDisconnect: noop,
		$interceptConnect: noop,
		$interceptDisconnect: noop,

		// EntityRef-compatible properties (for HasOneAccessor = EntityAccessor compatibility)
		id: placeholderId,
		$data: null,
		$isNew: false,
		$persistedId: null,
		__entityName: '',
		__availableRoles: [] as readonly string[],
		__schema: {} as Record<string, object>,
		$clearAllErrors: () => {},
		$on: noop,
		$intercept: noop,
		$onPersisted: noop,
		$interceptPersisting: noop,

		// Type brand (phantom property - only exists in type system)
		__entityType: undefined as unknown,
	}
}


/**
 * Creates a runtime accessor with real data from SnapshotStore.
 * Supports direct field access: `entity.fieldName` is equivalent to `entity.$fields.fieldName`.
 */
export function createRuntimeAccessor<T>(
	entityType: string,
	entityId: string,
	store: SnapshotStore,
	notifyChange: NotifyChange,
	path: string[] = [],
): EntityAccessor<T> {
	const snapshot = store.getEntitySnapshot(entityType, entityId)

	const fieldsProxy = new Proxy({} as EntityFields<T>, {
		get(_, fieldName: string): FieldRef<unknown> | HasManyRef<unknown> | HasOneRef<unknown> {
			const fieldPath = [...path, fieldName]
			return createRuntimeFieldRef(entityType, entityId, store, notifyChange, fieldPath, fieldName)
		},
	})

	const noop = () => () => {}

	const ref: EntityRef<T> = {
		id: entityId,
		$fields: fieldsProxy,
		$data: (snapshot?.data ?? null) as T | null,
		get $isDirty() {
			const snap = store.getEntitySnapshot(entityType, entityId)
			if (!snap) return false
			return !deepEqual(snap.data, snap.serverData)
		},
		get $persistedId() {
			return store.getPersistedId(entityType, entityId)
		},
		get $isNew() {
			return store.isNewEntity(entityType, entityId)
		},
		__entityType: undefined as unknown as T,
		__entityName: entityType,
		__availableRoles: [] as readonly string[],
		__schema: {} as Record<string, object>,
		// Error properties
		get $errors() {
			return store.getEntityErrors(entityType, entityId)
		},
		get $hasError() {
			return store.hasAnyErrors(entityType, entityId)
		},
		$addError: () => {
			// No-op in runtime proxy - use handle directly for mutations
		},
		$clearErrors: () => {
			// No-op in runtime proxy - use handle directly for mutations
		},
		$clearAllErrors: () => {
			// No-op in runtime proxy - use handle directly for mutations
		},
		// Event methods (stubs for runtime proxy - use handle directly for subscriptions)
		$on: noop,
		$intercept: noop,
		$onPersisted: noop,
		$interceptPersisting: noop,
	}

	// Wrap in Proxy to support direct field access
	return wrapEntityRefWithFieldAccessProxy(ref)
}

/**
 * Combined ref type for runtime that satisfies all ref interfaces
 */
type RuntimeRef = FieldRef<unknown> & HasManyRef<unknown> & HasOneRef<unknown>

/**
 * Creates a field reference for runtime phase with real data access
 */
function createRuntimeFieldRef(
	entityType: string,
	entityId: string,
	store: SnapshotStore,
	notifyChange: NotifyChange,
	path: string[],
	fieldName: string,
): RuntimeRef {
	const meta = {
		entityType,
		entityId,
		path,
		fieldName,
		isArray: false as boolean,
		isRelation: false as boolean,
	}

	const getValue = (): unknown => {
		const snapshot = store.getEntitySnapshot(entityType, entityId)
		if (!snapshot) return null
		return getNestedValue(snapshot.data, path)
	}

	const getServerValue = (): unknown => {
		const snapshot = store.getEntitySnapshot(entityType, entityId)
		if (!snapshot) return null
		return getNestedValue(snapshot.serverData, path)
	}

	const setValue = (value: unknown) => {
		store.setFieldValue(entityType, entityId, path, value)
		notifyChange()
	}

	const noop = () => () => {}

	const getItems = (): EntityAccessor<unknown>[] => {
		const items = getValue()
		if (!Array.isArray(items)) return []

		return items.map((item: unknown) => {
			if (typeof item !== 'object' || item === null || !('id' in item)) {
				throw new Error(`HasMany items must have an 'id' property`)
			}
			const itemId = (item as { id: string }).id
			const nestedEntityType = `${entityType}_${fieldName}`

			if (!store.hasEntity(nestedEntityType, itemId)) {
				store.setEntityData(nestedEntityType, itemId, item as Record<string, unknown>, true)
			}

			return createRuntimeAccessor<unknown>(
				nestedEntityType,
				itemId,
				store,
				notifyChange,
			)
		})
	}

	const mapFn = <R>(fn: (item: EntityAccessor<unknown>, index: number) => R): R[] => {
		const items = getValue()
		if (!Array.isArray(items)) return []

		return items.map((item: unknown, index: number) => {
			if (typeof item !== 'object' || item === null || !('id' in item)) {
				throw new Error(`HasMany items must have an 'id' property`)
			}
			const itemId = (item as { id: string }).id

			// Determine the entity type for nested items
			// In a real implementation, this would be provided by schema metadata
			const nestedEntityType = `${entityType}_${fieldName}`

			// Ensure the item is in store
			if (!store.hasEntity(nestedEntityType, itemId)) {
				store.setEntityData(nestedEntityType, itemId, item as Record<string, unknown>, true)
			}

			const accessor = createRuntimeAccessor<unknown>(
				nestedEntityType,
				itemId,
				store,
				notifyChange,
			)
			return fn(accessor, index)
		})
	}

	const addFn = (data?: Record<string, unknown>): string => {
		const items = getValue()
		const currentItems = Array.isArray(items) ? [...items] : []
		const newId = `new_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
		currentItems.push({ id: newId, ...data })
		setValue(currentItems)
		return newId
	}

	const removeFn = (key: string): void => {
		const items = getValue()
		if (!Array.isArray(items)) return
		const filtered = items.filter((item: unknown) => {
			if (typeof item !== 'object' || item === null || !('id' in item)) return true
			return (item as { id: string }).id !== key
		})
		setValue(filtered)
	}

	const moveFn = (fromIndex: number, toIndex: number): void => {
		const items = getValue()
		if (!Array.isArray(items)) return
		if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
			return
		}
		if (fromIndex === toIndex) return
		const newItems = [...items]
		const [removed] = newItems.splice(fromIndex, 1)
		if (removed !== undefined) {
			newItems.splice(toIndex, 0, removed)
			setValue(newItems)
		}
	}

	const connectFn = (id: string): void => {
		// Check if this is a HasMany (array) or HasOne (object) relation
		const currentValue = getValue()
		if (Array.isArray(currentValue)) {
			// HasManyRef.connect - add item to list
			const items = [...currentValue]
			if (!items.some((item: unknown) => (item as { id: string }).id === id)) {
				items.push({ id })
			}
			setValue(items)
		} else {
			// HasOneRef.connect - set the related entity
			setValue({ id })
		}
	}

	const disconnectFn = (itemId?: string | null): void => {
		const currentValue = getValue()
		if (Array.isArray(currentValue) && itemId) {
			// HasManyRef.disconnect - remove item from list
			const filtered = currentValue.filter((item: unknown) => {
				if (typeof item !== 'object' || item === null || !('id' in item)) return true
				return (item as { id: string }).id !== itemId
			})
			setValue(filtered)
		} else if (!itemId) {
			// HasOneRef.disconnect - clear the relation
			setValue(null)
		}
		// If itemId is null for HasMany, it's a no-op
	}

	const deleteFn = (): void => {
		// For HasOneRef - mark relation for deletion
		// In real implementation, this would update relation state
		setValue(null)
	}

	const resetFn = (): void => {
		// Reset to server value
		const serverValue = getServerValue()
		setValue(serverValue)
	}

	const getFieldsProxy = (): EntityFields<unknown> => {
		const value = getValue()
		if (typeof value !== 'object' || value === null || !('id' in value)) {
			// Return a proxy that returns null values
			return new Proxy({} as EntityFields<unknown>, {
				get(_, nestedFieldName: string) {
					return createNullFieldRef([...path, nestedFieldName], nestedFieldName)
				},
			})
		}

		const relatedId = (value as { id: string }).id
		const nestedEntityType = `${entityType}_${fieldName}`

		// Ensure related entity is in store
		if (!store.hasEntity(nestedEntityType, relatedId)) {
			store.setEntityData(nestedEntityType, relatedId, value as Record<string, unknown>, true)
		}

		const relatedAccessor = createRuntimeAccessor<unknown>(
			nestedEntityType,
			relatedId,
			store,
			notifyChange,
		)
		return relatedAccessor.$fields
	}

	const getEntity = (): EntityAccessor<unknown> => {
		const value = getValue()
		if (typeof value !== 'object' || value === null || !('id' in value)) {
			// Return placeholder accessor with placeholder ID
			return createPlaceholderAccessor<unknown>()
		}
		const relatedId = (value as { id: string }).id
		const nestedEntityType = `${entityType}_${fieldName}`

		// Ensure related entity is in store
		if (!store.hasEntity(nestedEntityType, relatedId)) {
			store.setEntityData(nestedEntityType, relatedId, value as Record<string, unknown>, true)
		}

		return createRuntimeAccessor<unknown>(
			nestedEntityType,
			relatedId,
			store,
			notifyChange,
		)
	}

	const getHasOneId = (): string => {
		const value = getValue()
		if (typeof value === 'object' && value !== null && 'id' in value) {
			return (value as { id: string }).id
		}
		// Return placeholder ID when disconnected
		return getEntity().id
	}

	const getState = (): 'connected' | 'disconnected' => {
		const value = getValue()
		return (typeof value === 'object' && value !== null && 'id' in value) ? 'connected' : 'disconnected'
	}

	const getLength = (): number => {
		const items = getValue()
		return Array.isArray(items) ? items.length : 0
	}

	const getValueOrNull = (): unknown => getValue() ?? null
	const getServerValueOrNull = (): unknown => getServerValue() ?? null
	const getIsDirty = (): boolean => !deepEqual(getValue(), getServerValue())
	const getInputProps = (): { value: unknown; setValue: (value: unknown) => void } => ({
		value: getValue() ?? null,
		setValue,
	})
	const getErrors = (): readonly FieldError[] => store.getFieldErrors(entityType, entityId, fieldName)
	const getHasError = (): boolean => store.getFieldErrors(entityType, entityId, fieldName).length > 0
	const addErrorFn = (): void => {
		// No-op in runtime proxy - use handle directly for mutations
	}
	const clearErrorsFn = (): void => {
		// No-op in runtime proxy - use handle directly for mutations
	}

	return {
		[FIELD_REF_META]: meta,

		// FieldRef properties (non-$ versions)
		get value() {
			return getValueOrNull()
		},
		get serverValue() {
			return getServerValueOrNull()
		},
		get isDirty() {
			return getIsDirty()
		},
		get isTouched() {
			return store.isFieldTouched(entityType, entityId, fieldName)
		},
		touch() {
			store.setFieldTouched(entityType, entityId, fieldName, true)
		},
		setValue,
		get inputProps() {
			return getInputProps()
		},
		get errors() {
			return getErrors()
		},
		get hasError() {
			return getHasError()
		},
		addError: addErrorFn,
		clearErrors: clearErrorsFn,
		onChange: noop,
		onChanging: noop,

		// HasManyRef properties (non-$ versions)
		get length() {
			return getLength()
		},
		get items() {
			return getItems()
		},
		map: mapFn,
		add: addFn,
		remove: removeFn,
		move: moveFn,
		connect: connectFn,
		disconnect: disconnectFn,
		reset: resetFn,
		onItemConnected: noop,
		onItemDisconnected: noop,
		interceptItemConnecting: noop,
		interceptItemDisconnecting: noop,

		// HasOneRef properties ($ prefix only - for collision safety)
		get $id() {
			return getHasOneId()
		},
		get $isDirty() {
			return getIsDirty()
		},
		get $fields() {
			return getFieldsProxy()
		},
		get $entity() {
			return getEntity()
		},
		get $state() {
			return getState()
		},
		$delete: deleteFn,
		$errors: [],
		$hasError: false,
		$addError: addErrorFn,
		$clearErrors: clearErrorsFn,
		$connect: connectFn,
		$disconnect: disconnectFn,
		$reset: resetFn,
		$onConnect: noop,
		$onDisconnect: noop,
		$interceptConnect: noop,
		$interceptDisconnect: noop,

		// EntityRef-compatible properties (for HasOneAccessor = EntityAccessor compatibility)
		get id() {
			return getHasOneId()
		},
		get $data() {
			return getEntity().$data
		},
		get $isNew() {
			return getEntity().$isNew
		},
		get $persistedId() {
			return getEntity().$persistedId
		},
		__entityName: '',
		__availableRoles: [] as readonly string[],
		__schema: {} as Record<string, object>,
		$clearAllErrors: () => {},
		$on: noop,
		$intercept: noop,
		$onPersisted: noop,
		$interceptPersisting: noop,

		// Type brand (phantom property - only exists in type system)
		__entityType: undefined as unknown,
	}
}

/**
 * Creates a null field ref for disconnected relations
 */
function createNullFieldRef(path: string[], fieldName: string): FieldRef<unknown> {
	const noop = () => () => {}
	const noopFn = (): void => {}
	const setValueFn = (): void => {}
	const inputPropsValue = {
		value: null,
		setValue: setValueFn,
	}

	return {
		[FIELD_REF_META]: {
			entityType: '', // Null ref - no entity
			entityId: '', // Null ref - no entity
			path,
			fieldName,
			isArray: false,
			isRelation: false,
		},
		// FieldRef properties (non-$ versions)
		value: null,
		serverValue: null,
		isDirty: false,
		isTouched: false,
		touch: noopFn,
		setValue: setValueFn,
		inputProps: inputPropsValue,
		errors: [],
		hasError: false,
		addError: noopFn,
		clearErrors: noopFn,
		onChange: noop,
		onChanging: noop,
	}
}

// ==================== Helper Functions ====================

/**
 * Gets a nested value from an object using a path array.
 */
function getNestedValue(obj: unknown, path: string[]): unknown {
	if (path.length === 0) return obj
	if (obj === null || typeof obj !== 'object') return undefined

	let current: unknown = obj
	for (const key of path) {
		if (current === null || typeof current !== 'object') return undefined
		current = (current as Record<string, unknown>)[key]
	}
	return current
}

/**
 * Creates a placeholder accessor for disconnected hasOne relations.
 * Returns an EntityAccessor with placeholder ID and empty fields.
 * Supports direct field access: entity.fieldName -> entity.$fields.fieldName
 */
function createPlaceholderAccessor<T>(): EntityAccessor<T> {
	const noop = () => () => {}
	const inputProps = { value: null, setValue: () => {} }

	const fieldsProxy = new Proxy({} as EntityFields<T>, {
		get(_, fieldName: string): FieldRef<unknown> {
			return {
				[FIELD_REF_META]: {
					entityType: '',
					entityId: '',
					path: [fieldName],
					fieldName,
					isArray: false,
					isRelation: false,
				},
				// FieldRef properties (non-$ versions)
				value: null,
				serverValue: null,
				isDirty: false,
				isTouched: false,
				touch: () => {},
				setValue: () => {},
				inputProps,
				errors: [] as FieldError[],
				hasError: false,
				addError: () => {},
				clearErrors: () => {},
				onChange: noop,
				onChanging: noop,
			}
		},
	})

	const ref: EntityRef<T> = {
		id: generatePlaceholderId(),
		$fields: fieldsProxy,
		$data: null,
		$isDirty: false,
		$persistedId: null,
		$isNew: true,
		__entityType: undefined as unknown as T,
		__entityName: '__placeholder__',
		__availableRoles: [] as readonly string[],
		__schema: {} as Record<string, object>,
		$errors: [] as FieldError[],
		$hasError: false,
		$addError: () => {},
		$clearErrors: () => {},
		$clearAllErrors: () => {},
		$on: noop,
		$intercept: noop,
		$onPersisted: noop,
		$interceptPersisting: noop,
	}

	// Wrap in Proxy to support direct field access
	return wrapEntityRefWithFieldAccessProxy(ref)
}

