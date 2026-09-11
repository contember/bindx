import type { RekeyContext, Rekeyable } from './RekeyOrchestrator.js'

type Subscriber = () => void

/** Rejects async callbacks at compile time: a notification batch would end at the first `await`. */
export type SynchronousResult<T> = T extends PromiseLike<unknown> ? never : T

/**
 * Callback interface for SubscriptionManager to request snapshot version bumps.
 * This decouples notification logic from entity snapshot storage.
 */
export interface SnapshotVersionBumper {
	bumpEntitySnapshotVersion(key: string): void
}

/**
 * Resolves the parent entity keys that currently have a LIVE relation edge to a
 * child, so a child-field change can propagate up to its parents. Implemented by
 * the relation store (the single source of truth for relation membership); this
 * interface keeps {@link SubscriptionManager} decoupled from its concrete type.
 */
export interface ParentKeyLookup {
	getParentKeysForChild(childId: string): Set<string>
	/** Increases on every relation write, so an unchanged value proves the edges are unchanged. */
	getMutationVersion(): number
}

/**
 * Manages subscriptions for entity and relation changes.
 *
 * Provides:
 * - Entity-level subscriptions
 * - Relation-level subscriptions
 * - Global subscriptions (any change)
 * - Parent-child change propagation (derived from live relation edges)
 * - Global version tracking for change detection
 */
export class SubscriptionManager implements Rekeyable {
	/** Subscribers per entity key */
	private readonly entitySubscribers = new Map<string, Set<Subscriber>>()

	/** Subscribers per relation key */
	private readonly relationSubscribers = new Map<string, Set<Subscriber>>()

	/** Global subscribers (notified on any change) */
	private readonly globalSubscribers = new Set<Subscriber>()

	/** Maps old keys → new keys after rekey, so unsubscribe closures can find migrated callbacks */
	private readonly rekeyedKeys = new Map<string, string>()

	/** Global version number for change detection */
	private globalVersion = 0
	private notificationBatchDepth = 0
	private pendingEntities = new Set<string>()
	private pendingRelations = new Set<string>()
	private pendingGlobal = false
	/** Keys the current batch has already walked; valid only while the relation edges are unchanged. */
	private readonly batchWalkedKeys = new Set<string>()
	private batchWalkedEdgeVersion = -1

	/** Versions advance immediately; callbacks observe the completed synchronous batch. */
	batchNotifications<T>(fn: () => SynchronousResult<T>): T {
		this.notificationBatchDepth++
		let completed = false
		try {
			const result = fn()
			completed = true
			return result
		} finally {
			if (--this.notificationBatchDepth === 0) this.flushNotifications(completed)
		}
	}

	private flushNotifications(callbackCompleted: boolean): void {
		const entities = this.pendingEntities
		const relations = this.pendingRelations
		const global = this.pendingGlobal
		this.pendingEntities = new Set()
		this.pendingRelations = new Set()
		this.pendingGlobal = false
		this.batchWalkedKeys.clear()
		const notified = new Set<Subscriber>()
		const errors: unknown[] = []
		const deliver = (subscribers: Set<Subscriber> | undefined): void => {
			for (const sub of subscribers ?? []) {
				if (notified.has(sub)) continue
				notified.add(sub)
				try {
					sub()
				} catch (error) {
					errors.push(error)
				}
			}
		}
		for (const key of entities) deliver(this.entitySubscribers.get(key))
		for (const key of relations) deliver(this.relationSubscribers.get(key))
		if (global) deliver(this.globalSubscribers)
		throwSubscriberErrors(errors, callbackCompleted)
	}

	private notifyGlobalSubscribers(): void {
		if (this.notificationBatchDepth > 0) {
			this.pendingGlobal = true
			return
		}
		for (const sub of this.globalSubscribers) sub()
	}

	/**
	 * Resolves a child's parents from live relation edges. Injected after
	 * construction (the relation store and this manager are siblings under
	 * SnapshotStore) via {@link setParentKeyLookup}.
	 */
	private parentKeyLookup: ParentKeyLookup | undefined

	/**
	 * Resolves a key through the rekey redirect chain.
	 * The rekey() method collapses chains (A→C instead of A→B→C), so this should
	 * always resolve in one hop. The loop with depth limit is a safety net in case
	 * chain collapsing has a bug — prevents infinite loops instead of silently hanging.
	 */
	private resolveKey(key: string): string {
		let resolved = key
		for (let depth = 0; depth < 10; depth++) {
			const next = this.rekeyedKeys.get(resolved)
			if (!next || next === resolved) return resolved
			resolved = next
		}
		return resolved
	}

	/**
	 * Subscribe to changes on a specific entity.
	 * Returns unsubscribe function.
	 */
	subscribeToEntity(key: string, callback: Subscriber): () => void {
		if (!this.entitySubscribers.has(key)) {
			this.entitySubscribers.set(key, new Set())
		}

		this.entitySubscribers.get(key)!.add(callback)

		return () => {
			const resolvedKey = this.resolveKey(key)
			this.entitySubscribers.get(resolvedKey)?.delete(callback)
		}
	}

	/**
	 * Subscribe to changes on a specific relation.
	 * Returns unsubscribe function.
	 */
	subscribeToRelation(key: string, callback: Subscriber): () => void {
		if (!this.relationSubscribers.has(key)) {
			this.relationSubscribers.set(key, new Set())
		}

		this.relationSubscribers.get(key)!.add(callback)

		return () => {
			const resolvedKey = this.resolveKey(key)
			this.relationSubscribers.get(resolvedKey)?.delete(callback)
		}
	}

	/**
	 * Subscribe to all changes (global).
	 * Returns unsubscribe function.
	 */
	subscribe(callback: Subscriber): () => void {
		this.globalSubscribers.add(callback)
		return () => {
			this.globalSubscribers.delete(callback)
		}
	}

	/**
	 * Gets the global version number for change detection.
	 */
	getVersion(): number {
		return this.globalVersion
	}

	/**
	 * Triggers a global notification to all subscribers.
	 * Use when external state changes need to trigger re-renders.
	 */
	notify(): void {
		this.globalVersion++
		this.notifyGlobalSubscribers()
	}

	/**
	 * Notifies every registered subscriber — entity, relation and global.
	 *
	 * For store-wide events such as clear(), where every subscription's data is gone at once and
	 * there is no per-key change to notify from. Registrations are left intact: the subscribers
	 * belong to mounted components that must learn their entity is no longer there.
	 */
	notifyAll(): void {
		this.globalVersion++

		// Iterate the live sets, as the per-key paths do: a subscriber that unsubscribes a
		// not-yet-visited sibling removes it from the iteration, whereas a copied array would
		// still invoke it after its unsubscribe() returned.
		for (const key of this.entitySubscribers.keys()) this.notifyEntityDirect(key)
		for (const key of this.relationSubscribers.keys()) this.notifyRelationDirect(key)
		this.notifyGlobalSubscribers()
	}

	// ==================== Parent-Child Relationships ====================

	/**
	 * Wires the live-edge parent lookup. Parent re-render propagation is derived
	 * from the relation store's edges rather than a separate registry, so there is
	 * one source of truth for the parent-child graph.
	 */
	setParentKeyLookup(lookup: ParentKeyLookup): void {
		this.parentKeyLookup = lookup
	}

	/**
	 * Derives the parent entity keys for a child entity key by reading the live
	 * relation edges via the injected lookup. The child's bare id is the part of
	 * the key after the first ':' ("entityType:id").
	 *
	 * The child's TYPE is intentionally dropped — {@link ParentKeyLookup} matches on
	 * the bare id, relying on the store-wide global-id-uniqueness invariant (see
	 * {@link RelationStore.getParentKeysForChild}).
	 */
	private getParentKeys(childKey: string): Set<string> {
		if (!this.parentKeyLookup) return new Set()
		const separator = childKey.indexOf(':')
		if (separator === -1) return new Set()
		const childId = childKey.slice(separator + 1)
		return this.parentKeyLookup.getParentKeysForChild(childId)
	}

	// ==================== Notification ====================

	/**
	 * Notifies entity subscribers and propagates changes to parents.
	 * The bumper callback is used to bump parent entity snapshot versions.
	 */
	notifyEntitySubscribers(
		key: string,
		bumper: SnapshotVersionBumper,
	): void {
		this.globalVersion++
		this.notifyEntityAndParentSubscribers(key, bumper, this.getWalkedKeys())
		this.notifyGlobalSubscribers()
	}

	/** A batch shares one walked set, so rows under a common hub walk it once instead of once per row. */
	private getWalkedKeys(): Set<string> {
		if (this.notificationBatchDepth === 0) return new Set()
		const edgeVersion = this.parentKeyLookup?.getMutationVersion() ?? 0
		if (edgeVersion !== this.batchWalkedEdgeVersion) {
			this.batchWalkedKeys.clear()
			this.batchWalkedEdgeVersion = edgeVersion
		}
		return this.batchWalkedKeys
	}

	/**
	 * Walks the entity and its live ancestors. The global version is bumped once by the
	 * caller, before the first subscriber runs — a subscriber reading getVersion() from
	 * inside its callback must already see the new value.
	 *
	 * The walk is a transitive closure over live edges, so an entity many rows point at
	 * (a shared lookup entity whose own has-many is loaded) acts as a hub: a write in one
	 * row reaches every other row through it. That is the price of not knowing which part
	 * of the hub each row presents; a selection-aware edge index would be the fix.
	 */
	private notifyEntityAndParentSubscribers(
		key: string,
		bumper: SnapshotVersionBumper,
		walkedKeys: Set<string>,
	): void {
		if (walkedKeys.has(key)) return
		walkedKeys.add(key)

		this.notifyEntityDirect(key)

		// Parents are derived from the relation store's LIVE edges, so a
		// disconnected child no longer reaches its former parent.
		for (const parentKey of this.getParentKeys(key)) {
			// An ancestor reachable through several edges is bumped and walked once.
			if (walkedKeys.has(parentKey)) continue
			// Bump parent snapshot version so useSyncExternalStore detects a change
			bumper.bumpEntitySnapshotVersion(parentKey)
			this.notifyEntityAndParentSubscribers(parentKey, bumper, walkedKeys)
		}
	}

	/**
	 * Notifies relation subscribers, the owning entity, and its ancestors.
	 * The bumper callback is used to bump entity snapshot versions.
	 * The entityKey is the parent entity key derived from the relation key.
	 */
	notifyRelationSubscribers(
		key: string,
		entityKey: string,
		bumper: SnapshotVersionBumper,
	): void {
		this.globalVersion++

		// Notify relation-specific subscribers
		this.notifyRelationDirect(key)

		// Bump entity snapshot version so isEqual detects a change
		bumper.bumpEntitySnapshotVersion(entityKey)

		this.notifyEntityAndParentSubscribers(entityKey, bumper, this.getWalkedKeys())
		this.notifyGlobalSubscribers()
	}

	/**
	 * Notifies entity subscribers without propagation.
	 * Used during batch imports (e.g., undo/redo).
	 */
	notifyEntityDirect(key: string): void {
		if (this.notificationBatchDepth > 0) {
			this.pendingEntities.add(key)
			return
		}
		const subs = this.entitySubscribers.get(key)
		if (subs) {
			for (const sub of subs) {
				sub()
			}
		}
	}

	/**
	 * Notifies relation subscribers without propagation.
	 * Used during batch imports (e.g., undo/redo).
	 */
	notifyRelationDirect(key: string): void {
		if (this.notificationBatchDepth > 0) {
			this.pendingRelations.add(key)
			return
		}
		const subs = this.relationSubscribers.get(key)
		if (subs) {
			for (const sub of subs) {
				sub()
			}
		}
	}

	/**
	 * Moves entity and relation subscriptions from oldKey to newKey.
	 * Also rekeys relation subscribers under oldKeyPrefix to newKeyPrefix.
	 * Registers redirects so unsubscribe closures can find migrated callbacks.
	 *
	 * Parent-child links are NOT migrated here — they are derived from the
	 * relation store's live edges, which migrate their own id references on rekey.
	 */
	rekey(ctx: RekeyContext): void {
		const { oldKey, newKey, oldKeyPrefix, newKeyPrefix } = ctx
		// Register redirect for entity key (update existing chains first)
		for (const [fromKey, toKey] of this.rekeyedKeys) {
			if (toKey === oldKey) {
				this.rekeyedKeys.set(fromKey, newKey)
			}
		}
		this.rekeyedKeys.set(oldKey, newKey)
		this.movePendingNotifications(ctx)

		// Move entity subscribers, merging into anything already subscribed under the new key
		this.moveSubscribers(this.entitySubscribers, oldKey, newKey)

		// Move relation subscribers by prefix (e.g. "Entity:tempId:" → "Entity:persistedId:")
		const toMoveRelations: string[] = []
		for (const key of this.relationSubscribers.keys()) {
			if (key.startsWith(oldKeyPrefix)) {
				toMoveRelations.push(key)
			}
		}
		for (const oldRelKey of toMoveRelations) {
			const newRelKey = newKeyPrefix + oldRelKey.slice(oldKeyPrefix.length)

			// Register redirect for relation key (update existing chains first)
			for (const [fromKey, toKey] of this.rekeyedKeys) {
				if (toKey === oldRelKey) {
					this.rekeyedKeys.set(fromKey, newRelKey)
				}
			}
			this.rekeyedKeys.set(oldRelKey, newRelKey)

			this.moveSubscribers(this.relationSubscribers, oldRelKey, newRelKey)
		}
	}

	/** Queued keys follow their subscribers, so a flush never reads the long-lived redirect map. */
	private movePendingNotifications({ oldKey, newKey, oldKeyPrefix, newKeyPrefix }: RekeyContext): void {
		if (this.pendingEntities.delete(oldKey)) this.pendingEntities.add(newKey)
		for (const key of [...this.pendingRelations]) {
			if (!key.startsWith(oldKeyPrefix)) continue
			this.pendingRelations.delete(key)
			this.pendingRelations.add(newKeyPrefix + key.slice(oldKeyPrefix.length))
		}
	}

	/**
	 * Re-homes a subscriber set under a new key. The destination may already hold
	 * subscribers (a component mounted on the persisted id before the draft was rekeyed
	 * onto it); replacing the set would silently orphan them, so the two are merged.
	 */
	private moveSubscribers(map: Map<string, Set<Subscriber>>, oldKey: string, newKey: string): void {
		const moved = map.get(oldKey)
		if (!moved) return
		map.delete(oldKey)

		const existing = map.get(newKey)
		if (!existing) {
			map.set(newKey, moved)
			return
		}
		for (const sub of moved) existing.add(sub)
	}
}

/** The first subscriber error propagates, as it would unbatched, and the rest are logged; a failed callback's own error wins. */
function throwSubscriberErrors(errors: readonly unknown[], callbackCompleted: boolean): void {
	const [first, ...rest] = errors
	for (const error of callbackCompleted ? rest : errors) {
		console.error('[Bindx SubscriptionManager] Subscriber error:', error)
	}
	if (callbackCompleted && errors.length > 0) throw first
}
