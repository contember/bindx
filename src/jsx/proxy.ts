import type { SnapshotStore } from '../store/SnapshotStore.js'
import { SelectionMetaCollector, createEmptySelection } from './SelectionMeta.js'
import {
	type EntityRef,
	type EntityFields,
	type FieldRef,
	type HasManyRef,
	type HasOneRef,
	FIELD_REF_META,
} from './types.js'

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

	return {
		id: '__collector__',
		fields: fieldsProxy,
		data: null,
		isDirty: false,
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

		// HasManyRef properties
		length: 0,
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
		connect: () => {},
		disconnect: () => {},
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

		// HasManyRef properties
		get length() {
			const items = getValue()
			return Array.isArray(items) ? items.length : 0
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
		connect: (id: string) => {
			// In real implementation, this would update relation state
			setValue({ id })
		},
		disconnect: () => {
			setValue(null)
		},
	}
}

/**
 * Creates a null field ref for disconnected relations
 */
function createNullFieldRef(path: string[], fieldName: string): FieldRef<unknown> {
	return {
		[FIELD_REF_META]: {
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
 * Deep equality check for values.
 */
function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true
	if (a === null || b === null) return false
	if (typeof a !== 'object' || typeof b !== 'object') return false

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false
		for (let i = 0; i < a.length; i++) {
			if (!deepEqual(a[i], b[i])) return false
		}
		return true
	}

	if (Array.isArray(a) || Array.isArray(b)) return false

	const keysA = Object.keys(a)
	const keysB = Object.keys(b)

	if (keysA.length !== keysB.length) return false

	for (const key of keysA) {
		if (!keysB.includes(key)) return false
		if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
			return false
		}
	}

	return true
}
