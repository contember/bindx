/**
 * Bidirectional index of LIVE relation edges between a parent entity
 * ("parentType:parentId") and a child entity id (a bare id).
 *
 * Both directions are updated together by {@link addEdge}/{@link removeEdge}, so
 * the forward query ({@link collectChildren}) and the reverse query
 * ({@link collectParents}) can never disagree — that was the failure mode of the
 * old append-only `childToParents` map, which was updated on connect but not on
 * disconnect. Both queries are O(degree), not O(total edges).
 *
 * Edges are reference-counted: one parent entity may reach the same child through
 * more than one relation field (e.g. `author` and `coauthor`, or two has-many
 * fields), so an edge survives until the last field that contributes it drops it.
 *
 * The index stores only the LIVE edge set; turning relation state (server ids,
 * planned additions/removals, has-one state) into that set is the owning
 * sub-store's job, done once per write by diffing the previous against the next
 * live set (see {@link HasOneStore}/{@link HasManyStore}). The index itself knows
 * nothing about liveness rules.
 */
export class RelationEdgeIndex {
	/** parentKey ("parentType:parentId") → childId → refcount */
	private readonly forward = new Map<string, Map<string, number>>()
	/** childId → parentKey → refcount */
	private readonly reverse = new Map<string, Map<string, number>>()

	addEdge(parentKey: string, childId: string): void {
		increment(this.forward, parentKey, childId)
		increment(this.reverse, childId, parentKey)
	}

	removeEdge(parentKey: string, childId: string): void {
		decrement(this.forward, parentKey, childId)
		decrement(this.reverse, childId, parentKey)
	}

	/** Adds the live child ids of {@link parentKey} to {@link out}. */
	collectChildren(parentKey: string, out: Set<string>): void {
		const children = this.forward.get(parentKey)
		if (children) {
			for (const childId of children.keys()) out.add(childId)
		}
	}

	/** Adds the parent keys that hold a live edge to {@link childId} to {@link out}. */
	collectParents(childId: string, out: Set<string>): void {
		const parents = this.reverse.get(childId)
		if (parents) {
			for (const parentKey of parents.keys()) out.add(parentKey)
		}
	}

	clear(): void {
		this.forward.clear()
		this.reverse.clear()
	}
}

function increment(map: Map<string, Map<string, number>>, outer: string, inner: string): void {
	let counts = map.get(outer)
	if (!counts) {
		counts = new Map()
		map.set(outer, counts)
	}
	counts.set(inner, (counts.get(inner) ?? 0) + 1)
}

function decrement(map: Map<string, Map<string, number>>, outer: string, inner: string): void {
	const counts = map.get(outer)
	if (!counts) return
	const count = counts.get(inner)
	if (count === undefined) return
	if (count > 1) {
		counts.set(inner, count - 1)
		return
	}
	counts.delete(inner)
	if (counts.size === 0) map.delete(outer)
}
