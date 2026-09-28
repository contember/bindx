import type { SelectionFieldMeta, SelectionMeta } from '../selection/types.js'

/**
 * Merges a server read of an entity's embedded relation data into what the store
 * already holds for it.
 *
 * One query can reach the same entity through several paths, each with its own
 * sub-selection of a relation, and each path refreshes the entity's snapshot.
 * Assigning the incoming relation value wholesale would let a narrower
 * occurrence drop fields a wider one fetched. The server read still decides
 * everything it carries: has-many membership and order, which entity a has-one
 * points to, and every value it contains. Only keys it did not select survive,
 * and only on the same related entity.
 *
 * The selection tells relations from scalars: a JSON column can hold an object
 * with an `id` too, and it must be replaced, never merged. Without a selection,
 * the incoming value replaces the stored one.
 */
export function mergeEmbeddedRelationFields(
	existing: Record<string, unknown>,
	incoming: Record<string, unknown>,
	selection: SelectionMeta | undefined,
): Record<string, unknown> {
	const merged: Record<string, unknown> = {}
	for (const key of Object.keys(incoming)) {
		const fieldMeta = selection ? findFieldByDataKey(selection, key) : undefined
		merged[key] = fieldMeta ? mergeFieldValue(existing[key], incoming[key], fieldMeta) : incoming[key]
	}
	return merged
}

// A fluent selection marks `isArray` only for a has-many given params, so the
// relation kind is read from the value: a has-many embeds an array, a has-one an object.
function mergeFieldValue(existing: unknown, incoming: unknown, fieldMeta: SelectionFieldMeta): unknown {
	if (!fieldMeta.isRelation || !fieldMeta.nested) {
		return incoming
	}
	if (Array.isArray(existing) && Array.isArray(incoming)) {
		return mergeHasManyItems(existing, incoming, fieldMeta.nested)
	}
	return mergeHasOneEntity(existing, incoming, fieldMeta.nested)
}

function mergeHasManyItems(existing: readonly unknown[], incoming: readonly unknown[], itemSelection: SelectionMeta): unknown[] {
	const existingById = new Map<unknown, Record<string, unknown>>()
	for (const item of existing) {
		if (isRecord(item) && item['id'] !== undefined) {
			existingById.set(item['id'], item)
		}
	}
	return incoming.map(item => mergeHasOneEntity(isRecord(item) ? existingById.get(item['id']) : undefined, item, itemSelection))
}

function mergeHasOneEntity(existing: unknown, incoming: unknown, selection: SelectionMeta): unknown {
	if (!isRecord(existing) || !isRecord(incoming) || incoming['id'] === undefined || existing['id'] !== incoming['id']) {
		return incoming
	}
	return { ...existing, ...mergeEmbeddedRelationFields(existing, incoming, selection) }
}

function findFieldByDataKey(selection: SelectionMeta, dataKey: string): SelectionFieldMeta | undefined {
	const byKey = selection.fields.get(dataKey)
	if (byKey?.alias === dataKey) {
		return byKey
	}
	for (const fieldMeta of selection.fields.values()) {
		if (fieldMeta.alias === dataKey) {
			return fieldMeta
		}
	}
	return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
