/**
 * Refcounted multiset of entity ids whose row a parent relation plans to delete
 * through its own mutation ({@link HasManyStore} `plannedRemovals` of type `delete`,
 * {@link HasOneStore} state `deleted`).
 *
 * Refcounted because more than one relation may plan the same child's deletion, so
 * the id stays planned until the last of them drops it. Like {@link RelationEdgeIndex},
 * the index knows nothing about the rules: turning relation state into a planned-delete
 * id is the owning sub-store's job, done once per write in its chokepoint by diffing
 * the previous state against the next.
 */
export class PlannedDeleteIndex {
	private readonly counts = new Map<string, number>()

	retain(childId: string): void {
		this.counts.set(childId, (this.counts.get(childId) ?? 0) + 1)
	}

	release(childId: string): void {
		const count = this.counts.get(childId)
		if (count === undefined) return
		if (count > 1) this.counts.set(childId, count - 1)
		else this.counts.delete(childId)
	}

	has(childId: string): boolean {
		return this.counts.has(childId)
	}

	clear(): void {
		this.counts.clear()
	}
}
