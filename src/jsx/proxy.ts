import type { IdentityMap } from '../store/IdentityMap.js'
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
					path,
					isArray: false,
					isRelation: true,
					nested: nestedSelection,
				})

				const nestedPath = [...path, nestedFieldName]
				nestedSelection.addField({
					fieldName: nestedFieldName,
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
 * Creates a runtime accessor with real data from IdentityMap
 */
export function createRuntimeAccessor<T>(
	entityType: string,
	entityId: string,
	identityMap: IdentityMap,
	notifyChange: () => void,
	path: string[] = [],
): EntityRef<T> {
	const record = identityMap.get(entityType, entityId)

	const fieldsProxy = new Proxy({} as EntityFields<T>, {
		get(_, fieldName: string): FieldRef<unknown> | HasManyRef<unknown> | HasOneRef<unknown> {
			const fieldPath = [...path, fieldName]
			return createRuntimeFieldRef(entityType, entityId, identityMap, notifyChange, fieldPath, fieldName)
		},
	})

	return {
		id: entityId,
		fields: fieldsProxy,
		data: record?.data as T | null,
		get isDirty() {
			const rec = identityMap.get(entityType, entityId)
			if (!rec) return false
			return JSON.stringify(rec.data) !== JSON.stringify(rec.serverData)
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
	identityMap: IdentityMap,
	notifyChange: () => void,
	path: string[],
	fieldName: string,
): RuntimeRef {
	const meta = {
		path,
		fieldName,
		isArray: false as boolean,
		isRelation: false as boolean,
	}

	const getValue = () => identityMap.getValue(entityType, entityId, path)
	const getServerValue = () => identityMap.getServerValue(entityType, entityId, path)

	const setValue = (value: unknown) => {
		identityMap.setFieldValue(entityType, entityId, path, value)
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
			return getValue() !== getServerValue()
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

				// Ensure the item is in identity map
				identityMap.getOrCreate(nestedEntityType, itemId, item as Record<string, unknown>)

				const accessor = createRuntimeAccessor<unknown>(
					nestedEntityType,
					itemId,
					identityMap,
					notifyChange,
				)
				return fn(accessor, index)
			})
		},
		add: (data?: Record<string, unknown>) => {
			const items = getValue()
			const currentItems = Array.isArray(items) ? [...items] : []
			const newId = `new_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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

			// Ensure related entity is in identity map
			identityMap.getOrCreate(nestedEntityType, relatedId, value as Record<string, unknown>)

			const relatedAccessor = createRuntimeAccessor<unknown>(
				nestedEntityType,
				relatedId,
				identityMap,
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
