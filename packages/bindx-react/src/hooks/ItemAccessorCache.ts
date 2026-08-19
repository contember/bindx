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
 * Subscribe to the entity that OWNS the changed relation, not merely to the row's own entity:
 * `notifyRelationSubscribers` notifies the relation key and its owning entity but — unlike
 * `notifyEntitySubscribers` — does not walk up the parent chain, so a membership change on a
 * descendant relation never reaches a subscriber on the root item. A memoized row rendering
 * `item.profile.tags` subscribes with `useAccessor(item.profile.tags)`, not `useField(item.name)`.
 * Beware `useAccessor(item.profile)`: a has-one ref reports its OWNER, so that subscribes to the
 * row itself rather than the target — reach through to the nested relation or `.$entity`. The
 * composed primitives (`<HasMany>` / `<HasOne>`) already resolve the right key.
 *
 * The cache belongs to one hook instance and is thrown away whenever a handle construction input
 * changes; handles validate field access against the selection they were built with.
 */
export class ItemAccessorCache {
	private readonly entries = new Map<string, EntityAccessor<object>>()

	constructor(
		private readonly createHandle: (id: string) => EntityHandle<object>,
	) {}

	/** Rebuilds the accessor array; ids no longer listed are evicted so the cache stays bounded. */
	build(items: ReadonlyArray<{ id: string }>): Array<EntityAccessor<object>> {
		const accessors: Array<EntityAccessor<object>> = []
		const liveIds = new Set<string>()

		for (const item of items) {
			accessors.push(this.resolve(item.id))
			liveIds.add(item.id)
		}

		for (const id of this.entries.keys()) {
			if (!liveIds.has(id)) {
				this.entries.delete(id)
			}
		}

		return accessors
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
