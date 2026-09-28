import type { SelectionMeta } from '../selection/types.js'

/** The server baseline the store holds for an entity of this id, if it has a snapshot of it. */
export type StoredServerDataLookup = (id: string) => Readonly<Record<string, unknown>> | undefined

/**
 * Merges a server read of an entity's embedded relation data into what the store
 * already holds for it.
 *
 * One query can reach the same entity through several paths, each with its own
 * sub-selection of a relation, and each path refreshes the entity's snapshot.
 * Assigning the incoming relation value wholesale would let a narrower
 * occurrence drop fields a wider one fetched. The server read still decides
 * everything it carries: has-many membership and order, which entity a has-one
 * points to, and every value it contains.
 *
 * A key the read did not select is kept only on the same related entity, and
 * its value comes from that entity's own snapshot when the store has one. The
 * embedded copy is written only when its parent is read, so after a persist or
 * a read through another path it lags behind the snapshot; it is the fallback
 * for an entity nothing has materialized yet.
 *
 * The selection tells relations from scalars: a JSON column can hold an object
 * with an `id` too, and it must be replaced, never merged. Without a selection,
 * the incoming value replaces the stored one.
 *
 * Returns `incoming` itself when there is nothing to keep, so the common case
 * allocates nothing.
 */
export function mergeEmbeddedRelationFields(
	existing: Readonly<Record<string, unknown>>,
	incoming: Record<string, unknown>,
	selection: SelectionMeta | undefined,
	lookup: StoredServerDataLookup,
): Record<string, unknown> {
	if (!selection) {
		return incoming
	}
	let merged: Record<string, unknown> | undefined
	for (const fieldMeta of selection.fields.values()) {
		const key = fieldMeta.alias
		if (!fieldMeta.isRelation || !fieldMeta.nested || !Object.hasOwn(incoming, key)) {
			continue
		}
		const value = mergeRelationValue(existing[key], incoming[key], fieldMeta.nested, lookup)
		if (value !== incoming[key]) {
			merged ??= { ...incoming }
			merged[key] = value
		}
	}
	return merged ?? incoming
}

// A fluent selection marks `isArray` only for a has-many given params, so the
// relation kind is read from the value: a has-many embeds an array (or a
// connection), a has-one an object.
function mergeRelationValue(existing: unknown, incoming: unknown, nested: SelectionMeta, lookup: StoredServerDataLookup): unknown {
	if (Array.isArray(existing) && Array.isArray(incoming)) {
		return mergeItems(existing, incoming, nested, lookup)
	}
	if (isConnection(existing) && isConnection(incoming)) {
		return mergeConnection(existing, incoming, nested, lookup)
	}
	return mergeRelatedEntity(existing, incoming, nested, lookup)
}

function mergeItems(existing: readonly unknown[], incoming: unknown[], itemSelection: SelectionMeta, lookup: StoredServerDataLookup): unknown[] {
	let existingById: Map<unknown, Record<string, unknown>> | undefined
	const findExisting = (item: unknown, index: number): Record<string, unknown> | undefined => {
		if (!isRecord(item)) return undefined
		// A re-read usually keeps the order, so the item at the same position is checked before building an index.
		const atIndex = existing[index]
		if (isRecord(atIndex) && atIndex['id'] === item['id']) return atIndex
		existingById ??= indexById(existing)
		return existingById.get(item['id'])
	}
	let merged: unknown[] | undefined
	incoming.forEach((item, index) => {
		const value = mergeRelatedEntity(findExisting(item, index), item, itemSelection, lookup)
		if (value !== item) {
			merged ??= [...incoming]
			merged[index] = value
		}
	})
	if (!merged) {
		return incoming
	}
	copyTotalCount(incoming, merged)
	return merged
}

interface Connection extends Record<string, unknown> {
	readonly edges: readonly unknown[]
}

function mergeConnection(existing: Connection, incoming: Connection, nodeSelection: SelectionMeta, lookup: StoredServerDataLookup): Connection {
	const existingNodes = existing.edges.map(edge => (isRecord(edge) ? edge['node'] : undefined))
	const incomingNodes = incoming.edges.map(edge => (isRecord(edge) ? edge['node'] : undefined))
	const mergedNodes = mergeItems(existingNodes, incomingNodes, nodeSelection, lookup)
	if (mergedNodes === incomingNodes) {
		return incoming
	}
	const edges = incoming.edges.map((edge, index) => (isRecord(edge) ? { ...edge, node: mergedNodes[index] } : edge))
	return { ...incoming, edges }
}

function mergeRelatedEntity(existing: unknown, incoming: unknown, selection: SelectionMeta, lookup: StoredServerDataLookup): unknown {
	if (existing === incoming || !isRecord(existing) || !isRecord(incoming)) {
		return incoming
	}
	const id = incoming['id']
	if (id === undefined || existing['id'] !== id) {
		return incoming
	}
	const withRelations = mergeEmbeddedRelationFields(existing, incoming, selection, lookup)
	let merged: Record<string, unknown> | undefined
	let stored: Readonly<Record<string, unknown>> | undefined
	for (const key of Object.keys(existing)) {
		if (Object.hasOwn(incoming, key)) {
			continue
		}
		if (!merged) {
			merged = { ...withRelations }
			stored = typeof id === 'string' ? lookup(id) : undefined
		}
		merged[key] = stored && Object.hasOwn(stored, key) ? stored[key] : existing[key]
	}
	return merged ?? withRelations
}

function indexById(items: readonly unknown[]): Map<unknown, Record<string, unknown>> {
	const byId = new Map<unknown, Record<string, unknown>>()
	for (const item of items) {
		if (isRecord(item) && item['id'] !== undefined) {
			byId.set(item['id'], item)
		}
	}
	return byId
}

// A paginated has-many carries its total count as a non-enumerable property of the item array.
function copyTotalCount(from: readonly unknown[], to: unknown[]): void {
	const descriptor = Object.getOwnPropertyDescriptor(from, 'totalCount')
	if (descriptor) {
		Object.defineProperty(to, 'totalCount', descriptor)
	}
}

function isConnection(value: unknown): value is Connection {
	return isRecord(value) && Array.isArray(value['edges'])
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
