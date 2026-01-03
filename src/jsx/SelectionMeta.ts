import type { JsxSelectionMeta, JsxSelectionFieldMeta } from './types.js'

/**
 * Class for collecting field selection metadata during collection phase
 */
export class SelectionMetaCollector implements JsxSelectionMeta {
	readonly fields = new Map<string, JsxSelectionFieldMeta>()

	/**
	 * Add a field to the selection
	 */
	addField(fieldMeta: JsxSelectionFieldMeta): void {
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
	getRootFields(): JsxSelectionFieldMeta[] {
		const result: JsxSelectionFieldMeta[] = []
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
	toJSON(): JsxSelectionMeta {
		return {
			fields: new Map(this.fields),
		}
	}
}

/**
 * Merge two selections together
 */
export function mergeSelections(target: JsxSelectionMeta, source: JsxSelectionMeta): void {
	for (const [key, field] of source.fields) {
		const existing = target.fields.get(key)
		if (existing) {
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
export function createEmptySelection(): JsxSelectionMeta {
	return { fields: new Map() }
}
