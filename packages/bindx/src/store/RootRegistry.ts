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
export class RootRegistry {
	private readonly roots = new Set<string>()

	register(key: string): void {
		this.roots.add(key)
	}

	unregister(key: string): void {
		this.roots.delete(key)
	}

	has(key: string): boolean {
		return this.roots.has(key)
	}

	keys(): IterableIterator<string> {
		return this.roots.keys()
	}

	/**
	 * Moves a root entry from oldKey to newKey (used after persist rekeys a temp
	 * id to a server-assigned id).
	 */
	rekey(oldKey: string, newKey: string): void {
		if (this.roots.delete(oldKey)) {
			this.roots.add(newKey)
		}
	}

	clear(): void {
		this.roots.clear()
	}
}
