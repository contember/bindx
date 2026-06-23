import type { RekeyContext, Rekeyable } from './RekeyOrchestrator.js'

type Subscriber = () => void

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
		for (const sub of this.globalSubscribers) {
			sub()
		}
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
		notifiedKeys: Set<string> = new Set(),
	): void {
		// Prevent infinite recursion
		if (notifiedKeys.has(key)) return
		notifiedKeys.add(key)

		this.globalVersion++

		// Notify entity-specific subscribers
		const entitySubs = this.entitySubscribers.get(key)
		if (entitySubs) {
			for (const sub of entitySubs) {
				sub()
			}
		}

		// Notify parent entity subscribers (propagate change up the tree).
		// Parents are derived from the relation store's LIVE edges, so a
		// disconnected child no longer reaches its former parent.
		const parents = this.getParentKeys(key)
		for (const parentKey of parents) {
			// Bump parent snapshot version so useSyncExternalStore detects a change
			bumper.bumpEntitySnapshotVersion(parentKey)
			this.notifyEntitySubscribers(parentKey, bumper, notifiedKeys)
		}

		// Notify global subscribers (only once, not for each parent)
		if (notifiedKeys.size === 1) {
			for (const sub of this.globalSubscribers) {
				sub()
			}
		}
	}

	/**
	 * Notifies relation subscribers and the parent entity's subscribers.
	 * The bumper callback is used to bump the parent entity snapshot version.
	 * The entityKey is the parent entity key derived from the relation key.
	 */
	notifyRelationSubscribers(
		key: string,
		entityKey: string,
		bumper: SnapshotVersionBumper,
	): void {
		this.globalVersion++

		// Notify relation-specific subscribers
		const relationSubs = this.relationSubscribers.get(key)
		if (relationSubs) {
			for (const sub of relationSubs) {
				sub()
			}
		}

		// Bump entity snapshot version so isEqual detects a change
		bumper.bumpEntitySnapshotVersion(entityKey)

		// Notify entity subscribers
		const entitySubs = this.entitySubscribers.get(entityKey)
		if (entitySubs) {
			for (const sub of entitySubs) {
				sub()
			}
		}

		// Notify global subscribers
		for (const sub of this.globalSubscribers) {
			sub()
		}
	}

	/**
	 * Notifies entity subscribers without propagation.
	 * Used during batch imports (e.g., undo/redo).
	 */
	notifyEntityDirect(key: string): void {
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
		const subs = this.relationSubscribers.get(key)
		if (subs) {
			for (const sub of subs) {
				sub()
			}
		}
	}

	/**
	 * Bumps global version and notifies global subscribers.
	 */
	notifyGlobal(): void {
		this.globalVersion++
		for (const sub of this.globalSubscribers) {
			sub()
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

		// Move entity subscribers
		const entitySubs = this.entitySubscribers.get(oldKey)
		if (entitySubs) {
			this.entitySubscribers.delete(oldKey)
			this.entitySubscribers.set(newKey, entitySubs)
		}

		// Move relation subscribers by prefix (e.g. "Entity:tempId:" → "Entity:persistedId:")
		const toMoveRelations: [string, Set<Subscriber>][] = []
		for (const [key, subs] of this.relationSubscribers) {
			if (key.startsWith(oldKeyPrefix)) {
				toMoveRelations.push([key, subs])
			}
		}
		for (const [oldRelKey, subs] of toMoveRelations) {
			const newRelKey = newKeyPrefix + oldRelKey.slice(oldKeyPrefix.length)

			// Register redirect for relation key (update existing chains first)
			for (const [fromKey, toKey] of this.rekeyedKeys) {
				if (toKey === oldRelKey) {
					this.rekeyedKeys.set(fromKey, newRelKey)
				}
			}
			this.rekeyedKeys.set(oldRelKey, newRelKey)

			this.relationSubscribers.delete(oldRelKey)
			this.relationSubscribers.set(newRelKey, subs)
		}
	}
}
