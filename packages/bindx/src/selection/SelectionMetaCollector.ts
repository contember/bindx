import type { SelectionMeta, SelectionFieldMeta } from './types.js'
import { generateHasManyAlias } from '../utils/aliasGenerator.js'

/**
 * Class for collecting field selection metadata during collection phase
 */
export class SelectionMetaCollector implements SelectionMeta {
	readonly fields = new Map<string, SelectionFieldMeta>()

	/**
	 * Add a field to the selection.
	 *
	 * For has-many fields with parameters (filter, orderBy, limit, offset),
	 * uses alias as the key to allow multiple instances of the same field
	 * with different parameters.
	 */
	addField(fieldMeta: SelectionFieldMeta): void {
		let key: string

		// For has-many fields with parameters, use alias as the key
		// This allows multiple HasMany for the same field with different params
		if (fieldMeta.isArray && fieldMeta.hasManyParams) {
			const hasParams = fieldMeta.hasManyParams.filter !== undefined ||
				fieldMeta.hasManyParams.orderBy !== undefined ||
				fieldMeta.hasManyParams.limit !== undefined ||
				fieldMeta.hasManyParams.offset !== undefined

			if (hasParams) {
				// Generate auto-alias if alias equals fieldName
				if (fieldMeta.alias === fieldMeta.fieldName) {
					fieldMeta.alias = generateHasManyAlias(fieldMeta.fieldName, fieldMeta.hasManyParams)
				}
				// Use alias-based key for has-many with params
				const pathWithAlias = [...fieldMeta.path.slice(0, -1), fieldMeta.alias]
				key = pathWithAlias.join('.')
			} else {
				key = fieldMeta.path.join('.')
			}
		} else {
			key = fieldMeta.path.join('.')
		}

		const existing = this.fields.get(key)

		if (existing) {
			// Update relation/array flags if source has more specific info
			if (fieldMeta.isRelation && !existing.isRelation) {
				existing.isRelation = true
			}
			if (fieldMeta.isArray && !existing.isArray) {
				existing.isArray = true
			}
			// Merge nested selections if both have them
			if (fieldMeta.nested && existing.nested) {
				mergeSelections(existing.nested, fieldMeta.nested)
			} else if (fieldMeta.nested) {
				existing.nested = fieldMeta.nested
			}
		} else {
			this.fields.set(key, { ...fieldMeta })
		}
	}

	/**
	 * Get all root-level fields (not nested)
	 */
	getRootFields(): SelectionFieldMeta[] {
		const result: SelectionFieldMeta[] = []
		for (const field of this.fields.values()) {
			if (field.path.length === 1) {
				result.push(field)
			}
		}
		return result
	}

	/**
	 * Convert to plain object for serialization
	 */
	toJSON(): SelectionMeta {
		return {
			fields: new Map(this.fields),
		}
	}
}

/**
 * Merge two selections together
 */
export function mergeSelections(target: SelectionMeta, source: SelectionMeta): void {
	for (const [key, field] of source.fields) {
		const existing = target.fields.get(key)
		if (existing) {
			// Update relation/array flags if source has more specific info
			if (field.isRelation && !existing.isRelation) {
				existing.isRelation = true
			}
			if (field.isArray && !existing.isArray) {
				existing.isArray = true
			}
			// Merge hasManyParams if source has them
			if (field.hasManyParams && !existing.hasManyParams) {
				existing.hasManyParams = field.hasManyParams
			}
			// Merge nested selections
			if (field.nested && existing.nested) {
				mergeSelections(existing.nested, field.nested)
			} else if (field.nested) {
				existing.nested = field.nested
			}
		} else {
			target.fields.set(key, { ...field })
		}
	}
}

/**
 * Create empty selection metadata
 */
export function createEmptySelection(): SelectionMeta {
	return { fields: new Map() }
}
