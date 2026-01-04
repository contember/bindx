import type { SelectionMeta, SelectionFieldMeta } from '../selection/types.js'

/**
 * Class for collecting field selection metadata during collection phase
 */
export class SelectionMetaCollector implements SelectionMeta {
	readonly fields = new Map<string, SelectionFieldMeta>()

	/**
	 * Add a field to the selection
	 */
	addField(fieldMeta: SelectionFieldMeta): void {
		const key = fieldMeta.path.join('.')
		const existing = this.fields.get(key)

		if (existing) {
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

/**
 * @deprecated Types are now unified - this is an identity function
 * Converts JsxSelectionMeta to SelectionMeta (now the same type).
 */
export function toSelectionMeta(meta: SelectionMeta): SelectionMeta {
	return meta
}

/**
 * @deprecated Types are now unified - this is an identity function
 * Converts SelectionMeta to JsxSelectionMeta (now the same type).
 */
export function fromSelectionMeta(meta: SelectionMeta): SelectionMeta {
	return meta
}
