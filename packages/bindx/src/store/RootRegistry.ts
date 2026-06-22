/**
 * Tracks explicitly-created top-level entities ("roots").
 *
 * Reachability-based create detection treats a created entity as a `create`
 * only when it is reachable from a root through live relations. Roots are:
 *   - every entity that exists on the server (tracked via EntityMetaStore), and
 *   - explicitly-created top-level entities that have no persisted parent.
 *
 * The first set is derivable from metadata. The second set is NOT derivable
 * from the relation graph — a top-level `<Entity create>` or a `useEntityList`
 * add has no parent relation anchoring it, so it must be registered here when
 * created and unregistered when removed.
 *
 * Keys use the same composite format as the rest of the store: "entityType:id".
 */
import type { RekeyContext, Rekeyable } from './RekeyOrchestrator.js'

export class RootRegistry implements Rekeyable {
	private readonly roots = new Set<string>()

	/**
	 * Monotonic counter bumped whenever the root set actually changes. Used by
	 * {@link ReachabilityAnalyzer} to memoize the reachability walk. Bumps happen
	 * only on a real change so the per-render `registerParentChild` → `unregister`
	 * call (almost always a no-op for an already-anchored child) does not
	 * needlessly invalidate the cache.
	 */
	private mutationVersion = 0

	register(key: string): void {
		if (!this.roots.has(key)) {
			this.roots.add(key)
			this.mutationVersion++
		}
	}

	unregister(key: string): void {
		if (this.roots.delete(key)) {
			this.mutationVersion++
		}
	}

	keys(): IterableIterator<string> {
		return this.roots.keys()
	}

	/**
	 * Moves a root entry from the temp key to the persisted key (used after
	 * persist rekeys a temp id to a server-assigned id).
	 */
	rekey(ctx: RekeyContext): void {
		if (this.roots.delete(ctx.oldKey)) {
			this.roots.add(ctx.newKey)
			this.mutationVersion++
		}
	}

	clear(): void {
		this.roots.clear()
		this.mutationVersion++
	}

	getMutationVersion(): number {
		return this.mutationVersion
	}
}
