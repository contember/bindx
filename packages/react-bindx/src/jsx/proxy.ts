import type { SnapshotStore } from '@contember/bindx'
import { SelectionMetaCollector } from './SelectionMeta.js'
import {
	type EntityRef,
	type EntityFields,
	type FieldRef,
	type HasManyRef,
	type HasOneRef,
	FIELD_REF_META,
} from './types.js'
import { deepEqual } from '@contember/bindx'

/**
 * Notify change callback type
 */
type NotifyChange = () => void

/**
 * Creates a collector proxy for the collection phase.
 * This proxy captures field access and builds selection metadata.
 */
export function createCollectorProxy<T>(
	selection: SelectionMetaCollector,
	path: string[] = [],
): EntityRef<T> {
	const fieldsProxy = new Proxy({} as EntityFields<T>, {
		get(_, fieldName: string): FieldRef<unknown> | HasManyRef<unknown> | HasOneRef<unknown> {
			const fieldPath = [...path, fieldName]

			// Register the field access
			selection.addField({
				fieldName,
				alias: fieldName,
				path: fieldPath,
				isArray: false,
				isRelation: false,
			})

			// Return a collector ref that works for all field types
			// The actual type (scalar/hasMany/hasOne) will be determined
			// by how it's used in components
			return createCollectorFieldRef(selection, fieldPath, fieldName)
		},
	})

	const noop = () => () => {}

	return {
		id: '__collector__',
		fields: fieldsProxy,
		data: null,
		isDirty: false,
		persistedId: null,
		isNew: true,
		__entityType: undefined as unknown as T,
		__entityName: '__collector__',
		__availableRoles: [] as readonly string[],
		// Error properties (stubs for collection phase)
		errors: [],
		hasError: false,
		addError: () => {},
		clearErrors: () => {},
		clearAllErrors: () => {},
		// Event methods (stubs for collection phase)
		on: noop,
		intercept: noop,
		onPersisted: noop,
		interceptPersisting: noop,
	}
}

/**
 * Combined ref type for collector that satisfies all ref interfaces
 */
type CollectorRef = FieldRef<unknown> & HasManyRef<unknown> & HasOneRef<unknown>

/**
 * Creates a field reference for collection phase
 */
function createCollectorFieldRef(
	selection: SelectionMetaCollector,
	path: string[],
	fieldName: string,
): CollectorRef {
	// Create nested selection for relations
	const nestedSelection = new SelectionMetaCollector()

	const meta = {
		entityType: '', // Collection phase - no entity
		entityId: '', // Collection phase - no entity
		path,
		fieldName,
		isArray: false as boolean,
		isRelation: false as boolean,
	}

	// Return object that satisfies all ref interfaces
	// Components will use only the parts they need
	return {
		[FIELD_REF_META]: meta,

		// FieldRef properties
		value: null,
		serverValue: null,
		isDirty: false,
		setValue: () => {},
		inputProps: {
			value: null,
			setValue: () => {},
		},
		// Error properties (stubs for collection phase)
		errors: [],
		hasError: false,
		addError: () => {},
		clearErrors: () => {},
		// Event methods (stubs for collection phase - FieldRef)
		onChange: () => () => {},
		onChanging: () => () => {},

		// HasManyRef properties
		length: 0,
		items: [],
		map: <R>(fn: (item: EntityRef<unknown>, index: number) => R): R[] => {
			// Update selection to mark as array relation
			selection.addField({
				fieldName,
				alias: fieldName,
				path,
				isArray: true,
				isRelation: true,
				nested: nestedSelection,
			})

			// Call fn once with collector to gather nested selection
			const nestedCollector = createCollectorProxy<unknown>(nestedSelection, [])
			fn(nestedCollector, 0)

			return []
		},
		add: () => {},
		remove: () => {},
		connect: () => {},
		// HasManyRef event methods (stubs for collection phase)
		onItemConnected: () => () => {},
		onItemDisconnected: () => () => {},
		interceptItemConnecting: () => () => {},
		interceptItemDisconnecting: () => () => {},

		// HasOneRef properties
		id: null,
		fields: new Proxy({} as EntityFields<unknown>, {
			get(_, nestedFieldName: string) {
				// Update selection to mark as has-one relation
				selection.addField({
					fieldName,
					alias: fieldName,
					path,
					isArray: false,
					isRelation: true,
					nested: nestedSelection,
				})

				const nestedPath = [...path, nestedFieldName]
				nestedSelection.addField({
					fieldName: nestedFieldName,
					alias: nestedFieldName,
					path: [nestedFieldName],
					isArray: false,
					isRelation: false,
				})

				return createCollectorFieldRef(nestedSelection, [nestedFieldName], nestedFieldName)
			},
		}),
		get entity(): EntityRef<unknown> {
			// For collection phase, return a collector proxy as EntityRef
			// Update selection to mark as has-one relation
			selection.addField({
				fieldName,
				alias: fieldName,
				path,
				isArray: false,
				isRelation: true,
				nested: nestedSelection,
			})
			return createCollectorProxy<unknown>(nestedSelection, [])
		},
		// HasOneRef methods (connect already added above for HasManyRef)
		disconnect: () => {},
		delete: () => {},
		reset: () => {},
		// HasOneRef event methods (stubs for collection phase)
		onConnect: () => () => {},
		onDisconnect: () => () => {},
		interceptConnect: () => () => {},
		interceptDisconnect: () => () => {},

		// Type brand (phantom property - only exists in type system)
		__entityType: undefined as unknown,
	}
}

/**
 * Creates a runtime accessor with real data from SnapshotStore
 */
export function createRuntimeAccessor<T>(
	entityType: string,
	entityId: string,
	store: SnapshotStore,
	notifyChange: NotifyChange,
	path: string[] = [],
): EntityRef<T> {
	const snapshot = store.getEntitySnapshot(entityType, entityId)

	const fieldsProxy = new Proxy({} as EntityFields<T>, {
		get(_, fieldName: string): FieldRef<unknown> | HasManyRef<unknown> | HasOneRef<unknown> {
			const fieldPath = [...path, fieldName]
			return createRuntimeFieldRef(entityType, entityId, store, notifyChange, fieldPath, fieldName)
		},
	})

	return {
		id: entityId,
		fields: fieldsProxy,
		data: (snapshot?.data ?? null) as T | null,
		get isDirty() {
			const snap = store.getEntitySnapshot(entityType, entityId)
			if (!snap) return false
			return !deepEqual(snap.data, snap.serverData)
		},
		get persistedId() {
			return store.getPersistedId(entityType, entityId)
		},
		get isNew() {
			return store.isNewEntity(entityType, entityId)
		},
		__entityType: undefined as unknown as T,
		__entityName: entityType,
		__availableRoles: [] as readonly string[],
		// Error properties
		get errors() {
			return store.getEntityErrors(entityType, entityId)
		},
		get hasError() {
			return store.hasAnyErrors(entityType, entityId)
		},
		addError: () => {
			// No-op in runtime proxy - use handle directly for mutations
		},
		clearErrors: () => {
			// No-op in runtime proxy - use handle directly for mutations
		},
		clearAllErrors: () => {
			// No-op in runtime proxy - use handle directly for mutations
		},
		// Event methods (stubs for runtime proxy - use handle directly for subscriptions)
		on: () => () => {},
		intercept: () => () => {},
		onPersisted: () => () => {},
		interceptPersisting: () => () => {},
	}
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

	return {
		[FIELD_REF_META]: meta,

		// FieldRef properties
		get value() {
			return getValue() ?? null
		},
		get serverValue() {
			return getServerValue() ?? null
		},
		get isDirty() {
			return !deepEqual(getValue(), getServerValue())
		},
		setValue,
		get inputProps() {
			return {
				value: getValue() ?? null,
				setValue,
			}
		},
		// Error properties
		get errors() {
			return store.getFieldErrors(entityType, entityId, fieldName)
		},
		get hasError() {
			return store.getFieldErrors(entityType, entityId, fieldName).length > 0
		},
		addError: () => {
			// No-op in runtime proxy - use handle directly for mutations
		},
		clearErrors: () => {
			// No-op in runtime proxy - use handle directly for mutations
		},
		// Event methods (stubs for runtime proxy - use handle directly for subscriptions)
		onChange: () => () => {},
		onChanging: () => () => {},

		// HasManyRef properties
		get length() {
			const items = getValue()
			return Array.isArray(items) ? items.length : 0
		},
		get items(): EntityRef<unknown>[] {
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
		},
		map: <R>(fn: (item: EntityRef<unknown>, index: number) => R): R[] => {
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
		},
		add: (data?: Record<string, unknown>) => {
			const items = getValue()
			const currentItems = Array.isArray(items) ? [...items] : []
			const newId = `new_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
			currentItems.push({ id: newId, ...data })
			setValue(currentItems)
		},
		remove: (key: string) => {
			const items = getValue()
			if (!Array.isArray(items)) return
			const filtered = items.filter((item: unknown) => {
				if (typeof item !== 'object' || item === null || !('id' in item)) return true
				return (item as { id: string }).id !== key
			})
			setValue(filtered)
		},
		// HasManyRef event methods (stubs for runtime proxy)
		onItemConnected: () => () => {},
		onItemDisconnected: () => () => {},
		interceptItemConnecting: () => () => {},
		interceptItemDisconnecting: () => () => {},

		// HasOneRef properties
		get id() {
			const value = getValue()
			if (typeof value === 'object' && value !== null && 'id' in value) {
				return (value as { id: string }).id
			}
			return null
		},
		get fields() {
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
			return relatedAccessor.fields
		},
		get entity(): EntityRef<unknown> {
			const value = getValue()
			if (typeof value !== 'object' || value === null || !('id' in value)) {
				// Return placeholder accessor with id=null
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
		},
		connect: (id: string) => {
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
		},
		disconnect: (itemId?: string | null) => {
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
		},
		delete: () => {
			// For HasOneRef - mark relation for deletion
			// In real implementation, this would update relation state
			setValue(null)
		},
		reset: () => {
			// Reset to server value
			const serverValue = getServerValue()
			setValue(serverValue)
		},
		// HasOneRef event methods (stubs for runtime proxy)
		onConnect: () => () => {},
		onDisconnect: () => () => {},
		interceptConnect: () => () => {},
		interceptDisconnect: () => () => {},

		// Type brand (phantom property - only exists in type system)
		__entityType: undefined as unknown,
	}
}

/**
 * Creates a null field ref for disconnected relations
 */
function createNullFieldRef(path: string[], fieldName: string): FieldRef<unknown> {
	return {
		[FIELD_REF_META]: {
			entityType: '', // Null ref - no entity
			entityId: '', // Null ref - no entity
			path,
			fieldName,
			isArray: false,
			isRelation: false,
		},
		value: null,
		serverValue: null,
		isDirty: false,
		setValue: () => {},
		inputProps: {
			value: null,
			setValue: () => {},
		},
		// Error properties (stubs for null field ref)
		errors: [],
		hasError: false,
		addError: () => {},
		clearErrors: () => {},
		// Event methods (stubs for null field ref)
		onChange: () => () => {},
		onChanging: () => () => {},
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
 * Returns an EntityRef with id=null and empty fields.
 */
function createPlaceholderAccessor<T>(): EntityRef<T> {
	const fieldsProxy = new Proxy({} as EntityFields<T>, {
		get(_, fieldName: string) {
			return {
				[FIELD_REF_META]: {
					entityType: '', // Placeholder - no entity
					entityId: '', // Placeholder - no entity
					path: [fieldName as string],
					fieldName: fieldName as string,
					isArray: false,
					isRelation: false,
				},
				value: null,
				serverValue: null,
				isDirty: false,
				setValue: () => {},
				inputProps: {
					value: null,
					setValue: () => {},
					onChange: () => {},
				},
				path: [fieldName],
				fieldName,
				// Error properties (stubs for placeholder fields)
				errors: [],
				hasError: false,
				addError: () => {},
				clearErrors: () => {},
				// Event methods (stubs for placeholder fields)
				onChange: () => () => {},
				onChanging: () => () => {},
			}
		},
	})

	return {
		id: null,
		fields: fieldsProxy,
		data: null,
		isDirty: false,
		persistedId: null,
		isNew: false,
		__entityType: undefined as unknown as T,
		__entityName: '__placeholder__',
		__availableRoles: [] as readonly string[],
		// Error properties (stubs for placeholder)
		errors: [],
		hasError: false,
		addError: () => {},
		clearErrors: () => {},
		clearAllErrors: () => {},
		// Event methods (stubs for placeholder)
		on: () => () => {},
		intercept: () => () => {},
		onPersisted: () => () => {},
		interceptPersisting: () => () => {},
	}
}

