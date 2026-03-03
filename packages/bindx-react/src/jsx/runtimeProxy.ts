import type { SnapshotStore, FieldError, SelectionMeta } from '@contember/bindx'
import { UnfetchedFieldError } from '@contember/bindx'
import {
	type EntityRef,
	type EntityAccessor,
	type EntityFields,
	type FieldRef,
	type HasManyRef,
	type HasOneRef,
	FIELD_REF_META,
} from './types.js'
import { deepEqual } from '@contember/bindx'
import {
	type NotifyChange,
	type RuntimeRef,
	NON_FIELD_PROPERTIES,
	wrapEntityRefWithFieldAccessProxy,
	getNestedValue,
	createNullFieldRef,
	createPlaceholderAccessor,
} from './proxyShared.js'
import { createInlineFieldsProxy, createInlineAccessor } from './inlineProxy.js'

/**
 * Creates a runtime accessor with real data from SnapshotStore.
 * Supports direct field access: `entity.fieldName` is equivalent to `entity.$fields.fieldName`.
 *
 * @param selection - Optional selection metadata. When provided, accessing fields not in the selection will throw UnfetchedFieldError.
 */
export function createRuntimeAccessor<T>(
	entityType: string,
	entityId: string,
	store: SnapshotStore,
	notifyChange: NotifyChange,
	path: string[] = [],
	selection?: SelectionMeta,
): EntityAccessor<T> {
	const snapshot = store.getEntitySnapshot(entityType, entityId)

	// Cache field refs to maintain stable references across renders
	const fieldRefCache = new Map<string, FieldRef<unknown> | HasManyRef<unknown> | HasOneRef<unknown>>()

	const fieldsProxy = new Proxy({} as EntityFields<T>, {
		get(_, fieldName: string): FieldRef<unknown> | HasManyRef<unknown> | HasOneRef<unknown> {
			// Return cached ref if available
			const cached = fieldRefCache.get(fieldName)
			if (cached) {
				return cached
			}

			const fieldPath = [...path, fieldName]
			// Get the field's selection metadata (if selection is provided)
			const fieldSelection = selection?.fields.get(fieldName)
			const ref = createRuntimeFieldRef(entityType, entityId, store, notifyChange, fieldPath, fieldName, selection, fieldSelection?.nested)
			fieldRefCache.set(fieldName, ref)
			return ref
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
 * Creates a field reference for runtime phase with real data access
 *
 * @param selection - The parent entity's selection metadata (for checking if field was selected)
 * @param nestedSelection - The nested selection for this field (if it's a relation)
 */
function createRuntimeFieldRef(
	entityType: string,
	entityId: string,
	store: SnapshotStore,
	notifyChange: NotifyChange,
	path: string[],
	fieldName: string,
	selection?: SelectionMeta,
	nestedSelection?: SelectionMeta,
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

		// Check if this field was included in the selection
		// Only check when selection is provided (JSX pattern with selection tracking)
		if (selection && !selection.fields.has(fieldName)) {
			throw new UnfetchedFieldError(entityType, entityId, path)
		}

		return getNestedValue(snapshot.data, path)
	}

	const getServerValue = (): unknown => {
		const snapshot = store.getEntitySnapshot(entityType, entityId)
		if (!snapshot) return null
		return getNestedValue(snapshot.serverData, path)
	}

	const setValue = (value: unknown): void => {
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
				[],
				nestedSelection,
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
				[],
				nestedSelection,
			)
			return fn(accessor, index)
		})
	}

	const addFn = (data?: Record<string, unknown>): string => {
		const items = getValue()
		const currentItems = Array.isArray(items) ? [...items] : []
		const newId = `__temp_${crypto.randomUUID()}`
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

		// Create inline fields proxy that reads directly from nested data
		// This avoids modifying the store during render
		return createInlineFieldsProxy(value as Record<string, unknown>, [...path], store, notifyChange, nestedSelection)
	}

	const getEntity = (): EntityAccessor<unknown> => {
		const value = getValue()
		if (typeof value !== 'object' || value === null || !('id' in value)) {
			// Return placeholder accessor with placeholder ID
			return createPlaceholderAccessor<unknown>()
		}

		// Create inline accessor that reads directly from nested data
		// This avoids modifying the store during render
		return createInlineAccessor(value as Record<string, unknown>, [...path], store, notifyChange, nestedSelection)
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
	const getInputProps = (): { value: unknown; setValue: (value: unknown) => void; onChange: (value: unknown) => void } => ({
		value: getValue() ?? null,
		setValue,
		onChange: setValue,
	})
	const getErrors = (): readonly FieldError[] => store.getFieldErrors(entityType, entityId, fieldName)
	const getHasError = (): boolean => store.getFieldErrors(entityType, entityId, fieldName).length > 0
	const addErrorFn = (): void => {
		// No-op in runtime proxy - use handle directly for mutations
	}
	const clearErrorsFn = (): void => {
		// No-op in runtime proxy - use handle directly for mutations
	}

	const refObject = {
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

	// Always wrap in field access proxy to support direct field access on has-one relations.
	// This works for all cases:
	// - Scalar fields: Accessing ref.value works (exists on target, passes through)
	// - Has-many fields: Accessing ref.items/length works (exists on target, passes through)
	// - Has-one connected: Accessing ref.fieldName proxies to ref.$fields.fieldName
	// - Has-one disconnected: Accessing ref.fieldName proxies to ref.$fields.fieldName (returns null field ref)
	// The getFieldsProxy handles null values gracefully by returning null field refs.
	return wrapRuntimeRefWithFieldAccessProxy(refObject, getFieldsProxy)
}

/**
 * Wraps a runtime ref in a Proxy that supports direct field access for hasOne relations.
 * - `ref.fieldName` is equivalent to `ref.$fields.fieldName`
 * - Known ref properties pass through to the target
 */
function wrapRuntimeRefWithFieldAccessProxy(
	ref: RuntimeRef,
	getFieldsProxy: () => EntityFields<unknown>,
): RuntimeRef {
	// Cache the fields proxy to avoid creating new objects on each access
	let cachedFieldsProxy: EntityFields<unknown> | null = null

	return new Proxy(ref, {
		get(target, prop) {
			// Symbols - pass through
			if (typeof prop !== 'string') {
				return Reflect.get(target, prop)
			}

			// Check if property exists on target - if so, pass through
			if (prop in target) {
				return Reflect.get(target, prop)
			}

			// Skip known non-field properties (React internals, Promise checks, etc.)
			if (NON_FIELD_PROPERTIES.has(prop) || prop.startsWith('@@') || prop.startsWith('_')) {
				return undefined
			}

			// Cache and reuse the fields proxy
			if (!cachedFieldsProxy) {
				cachedFieldsProxy = getFieldsProxy()
			}

			// Treat as field access on the related entity
			return cachedFieldsProxy[prop as keyof EntityFields<unknown>]
		},
	}) as RuntimeRef
}
