import type { EntityAccessor } from '@contember/bindx'
import { EntityHandle } from '@contember/bindx'

/**
 * Per-id cache of the accessors `useEntityList` hands out.
 *
 * An EntityHandle is a stateless live view over the store, so one handle — and one proxy over it —
 * serves an id for the whole life of the list. Identity therefore means identity and nothing else:
 * it is stable across every change to the entity, which is what lets identity-keyed consumers
 * (`React.memo` rows, `useMemo`) skip work. Change delivery is the subscription's job — a memoized
 * consumer must subscribe via `<Field>` / `useField` / `useAccessor` to observe changes.
 *
 * Relation and field notifications propagate through live parent edges, so subscribers on a root
 * item still update when one of its descendants changes.
 *
 * The cache belongs to one hook instance and is thrown away whenever a handle construction input
 * changes; handles validate field access against the selection they were built with.
 */
export class ItemAccessorCache {
	private readonly entries = new Map<string, EntityAccessor<object>>()

	/**
	 * @param createHandle builds the handle for a canonical id
	 * @param resolveId maps an id to its canonical form — a temp id follows its
	 *   temp→persisted rekey, so the handle (and the `id` it reports) is minted under the
	 *   server id and the dead temp key is evicted. Mirrors HasManyListHandle.resolveItemKey.
	 */
	constructor(
		private readonly createHandle: (id: string) => EntityHandle<object>,
		private readonly resolveId: (id: string) => string,
	) {}

	/** Rebuilds the accessor array; ids no longer listed are evicted so the cache stays bounded. */
	build(items: ReadonlyArray<{ id: string }>): Array<EntityAccessor<object>> {
		const accessors: Array<EntityAccessor<object>> = []
		const liveIds = new Set<string>()
		this.canonicalizeEntries()

		for (const item of items) {
			const id = this.resolveId(item.id)
			accessors.push(this.resolve(id))
			liveIds.add(id)
		}

		for (const id of this.entries.keys()) {
			if (!liveIds.has(id)) {
				this.entries.delete(id)
			}
		}

		return accessors
	}

	private canonicalizeEntries(): void {
		for (const [id, accessor] of [...this.entries]) {
			const canonicalId = this.resolveId(id)
			if (canonicalId === id) continue
			if (!this.entries.has(canonicalId)) this.entries.set(canonicalId, accessor)
			this.entries.delete(id)
		}
	}

	private resolve(id: string): EntityAccessor<object> {
		let accessor = this.entries.get(id)
		if (!accessor) {
			accessor = EntityHandle.wrapProxy(this.createHandle(id))
			this.entries.set(id, accessor)
		}
		return accessor
	}
}
