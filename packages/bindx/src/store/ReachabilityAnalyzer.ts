import type { EntitySnapshotStore } from './EntitySnapshotStore.js'
import type { EntityMetaStore } from './EntityMetaStore.js'
import type { RelationStore } from './RelationStore.js'
import type { RootRegistry } from './RootRegistry.js'

/**
 * Computes which never-persisted (created) entities are "live" — i.e. reachable
 * from a root through live relations.
 *
 * This is the single invariant behind create detection: a created entity is a
 * `create` to be sent to the server iff it is reachable from a root. Roots are
 * server entities plus explicitly-registered top-level creates (see
 * {@link RootRegistry}). A created entity that has been detached from every
 * relation is simply unreachable and produces no mutation — no eager purge of
 * its snapshot is required for correctness; memory cleanup is a separate
 * concern handled by a lazy sweep.
 *
 * The graph is read from {@link RelationStore} (the source of truth for live
 * relation membership), never from the subscription parent-child registry,
 * which is append-mostly for notifications and does not reflect disconnects.
 */
export class ReachabilityAnalyzer {
	constructor(
		private readonly entitySnapshots: EntitySnapshotStore,
		private readonly meta: EntityMetaStore,
		private readonly relations: RelationStore,
		private readonly roots: RootRegistry,
	) {}

	/**
	 * Returns the set of entity keys ("entityType:id") for created
	 * (never-persisted) entities reachable from a root through live relations.
	 */
	computeReachableCreated(): Set<string> {
		const reachableCreated = new Set<string>()
		const visited = new Set<string>()
		const stack: string[] = []

		// Seed roots and, in the same pass, detect whether any never-persisted
		// (created) snapshot exists at all. Every server entity is a root, and so is
		// every in-flight (persisting) entity — the latter keeps a created entity
		// live while it is mid-persist (e.g. pessimistic mode temporarily resets an
		// update parent to its server view, which would otherwise make a freshly
		// created child look unreachable during the async transaction window).
		let hasCreated = false
		for (const key of this.entitySnapshots.keys()) {
			const onServer = this.meta.existsOnServer(key)
			if (!onServer) hasCreated = true
			if (onServer || this.meta.isPersisting(key)) {
				stack.push(key)
			}
		}

		// Fast path: with no created snapshot anywhere, nothing can be a reachable
		// create. Skip the O(V·(R+H)) graph walk entirely — the common update-only
		// form/grid pays only the single existsOnServer scan above (which the seed
		// loop performs regardless) instead of walking every server entity's edges
		// on every dirty check (this runs on each store notification, ≈ keystroke).
		if (!hasCreated) return reachableCreated

		// Seed: explicitly-registered top-level creates (no persisted parent).
		for (const key of this.roots.keys()) {
			if (this.entitySnapshots.has(key)) {
				stack.push(key)
			}
		}

		while (stack.length > 0) {
			const key = stack.pop()!
			if (visited.has(key)) continue
			visited.add(key)

			// A created entity reached from a root is a live create. Server roots
			// are not creates; they fall through to update/delete detection.
			if (!this.meta.existsOnServer(key)) {
				reachableCreated.add(key)
			}

			// Walk through this entity's live child edges. The traversal continues
			// through created entities too, so a created chain (created child of a
			// created child of a root) is fully covered.
			for (const childId of this.relations.getLiveChildIds(`${key}:`)) {
				const childKey = this.entitySnapshots.keyForId(childId)
				if (childKey && !visited.has(childKey)) {
					stack.push(childKey)
				}
			}
		}

		return reachableCreated
	}
}
