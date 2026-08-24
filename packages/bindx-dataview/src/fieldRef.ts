/**
 * Field-ref introspection helpers shared by column definitions and DataView state.
 *
 * Kept in a leaf module so state hooks can derive field keys without pulling in
 * the whole column/JSX stack.
 */

import { FIELD_REF_META } from '@contember/bindx'

interface FieldRefMetaCarrier {
	readonly [FIELD_REF_META]: {
		readonly entityType: string
		readonly fieldName: string
		readonly fullPath?: readonly string[]
		readonly isArray: boolean
		readonly isRelation: boolean
		readonly enumName?: string
	}
}

/** Type guard: checks if a value carries FIELD_REF_META symbol. */
export function hasFieldRefMeta(ref: unknown): ref is FieldRefMetaCarrier {
	return ref != null && typeof ref === 'object' && FIELD_REF_META in ref
}

/**
 * Extract the dotted field path from a field ref (works in both collector and
 * runtime proxies). For fields reached through has-one relations
 * (e.g. `it.author.name`) this is the full dotted path (`"author.name"`) so the
 * DataGrid can build correct nested where/orderBy clauses; for top-level fields
 * it is simply the field name (`"title"`).
 *
 * This is the canonical sorting/filtering key for a column — anything that keys
 * state by a field ref must go through here, or nested columns silently miss.
 */
export function extractFieldName(ref: unknown): string | null {
	if (!hasFieldRefMeta(ref)) return null
	const meta = ref[FIELD_REF_META]
	const fullPath = meta.fullPath
	return fullPath && fullPath.length > 0 ? fullPath.join('.') : meta.fieldName
}

/** Extract enum name from a field ref (if field is an enum). */
export function extractEnumName(ref: unknown): string | undefined {
	return hasFieldRefMeta(ref) ? ref[FIELD_REF_META].enumName : undefined
}

/** Extract related entity type name from a relation field ref. */
export function extractRelatedEntityName(ref: unknown): string | null {
	if (!hasFieldRefMeta(ref)) return null
	const meta = ref[FIELD_REF_META]
	return meta.entityType || null
}
