import type { JsxSelectionMeta, JsxSelectionFieldMeta } from './types.js'
import type { SelectionMeta, SelectionFieldMeta } from '../selection/types.js'

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

/**
 * Converts JsxSelectionMeta to SelectionMeta (standard selection format).
 * This allows JSX-collected selection to be used with the standard query building pipeline.
 */
export function toSelectionMeta(jsxMeta: JsxSelectionMeta): SelectionMeta {
	const fields = new Map<string, SelectionFieldMeta>()

	for (const [key, jsxField] of jsxMeta.fields) {
		// Only include root-level fields (path length 1)
		if (jsxField.path.length !== 1) continue

		const field: SelectionFieldMeta = {
			fieldName: jsxField.fieldName,
			alias: jsxField.fieldName, // Use field name as alias
			isArray: jsxField.isArray,
			...(jsxField.nested && { nested: toSelectionMeta(jsxField.nested) }),
			...(jsxField.hasManyParams && { hasManyParams: jsxField.hasManyParams }),
		}

		fields.set(jsxField.fieldName, field)
	}

	return { fields }
}

/**
 * Converts SelectionMeta to JsxSelectionMeta.
 * Used for interoperability between systems.
 */
export function fromSelectionMeta(meta: SelectionMeta, basePath: string[] = []): JsxSelectionMeta {
	const fields = new Map<string, JsxSelectionFieldMeta>()

	for (const [alias, field] of meta.fields) {
		const path = [...basePath, field.fieldName]
		const isRelation = !!field.nested

		const jsxField: JsxSelectionFieldMeta = {
			fieldName: field.fieldName,
			path,
			isArray: field.isArray,
			isRelation,
			...(field.nested && { nested: fromSelectionMeta(field.nested, path) }),
			...(field.hasManyParams && { hasManyParams: field.hasManyParams }),
		}

		fields.set(path.join('.'), jsxField)
	}

	return { fields }
}
