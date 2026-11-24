import type { FieldRefMeta, SelectionFieldMeta } from './types.js'
import { FIELD_REF_META } from './types.js'
import { type Condition, collectConditionFields, isCondition } from './conditions.js'

/**
 * Anything carrying field ref metadata: a FieldRef, HasOneRef or HasManyRef.
 */
export interface FieldRefLike {
	readonly [FIELD_REF_META]: FieldRefMeta
}

export function isFieldRefLike(value: unknown): value is FieldRefLike {
	return typeof value === 'object' && value !== null && FIELD_REF_META in value
}

/**
 * Selection entry a component contributes for a field ref it receives as a prop.
 *
 * A collection-phase ref (empty `entityId`) returns null: the collector proxy already recorded
 * it in the scope tree when it was read, and its `path` is relative to its own entity, so a
 * flat entry for `article.author.email` would add a stray `email` to the root selection.
 */
export function fieldRefSelection(ref: FieldRefLike | null | undefined): SelectionFieldMeta | null {
	const meta = ref?.[FIELD_REF_META]
	if (!meta || meta.entityId === '') {
		return null
	}
	return {
		fieldName: meta.fieldName,
		alias: meta.fieldName,
		path: meta.path,
		isArray: meta.isArray,
		isRelation: meta.isRelation,
	}
}

/**
 * Selection entries for the field refs an `<If>` / `<Case if>` condition reads.
 */
export function conditionSelection(condition: Condition | FieldRefLike | boolean): SelectionFieldMeta[] {
	if (typeof condition === 'boolean') {
		return []
	}
	const refs: readonly unknown[] = isCondition(condition) ? collectConditionFields(condition) : [condition]
	const result: SelectionFieldMeta[] = []
	for (const ref of refs) {
		const fieldSelection = isFieldRefLike(ref) ? fieldRefSelection(ref) : null
		if (fieldSelection !== null) {
			result.push(fieldSelection)
		}
	}
	return result
}
