import type { ActionDispatcher } from '../core/ActionDispatcher.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'

/**
 * Base class for all handles.
 *
 * Handles are stateless live views over the store:
 * - Have stable identity (same instance across renders)
 * - Provide subscribe/getVersion for useSyncExternalStore
 * - Dispatch actions for mutations
 *
 * They own no resources — the only subscriptions a handle creates are returned
 * from `subscribe()` and owned by `useSyncExternalStore`, not stored on the
 * handle. There is therefore intentionally no dispose lifecycle: a handle is
 * reclaimed by GC once unreferenced, and a superseded handle (one replaced by a
 * fresh instance on a data change) stays fully usable for late reads/writes.
 */
export abstract class BaseHandle {
	constructor(
		protected readonly store: SnapshotStore,
		protected readonly dispatcher: ActionDispatcher,
	) {}

	/**
	 * Subscribe to changes. Used by useSyncExternalStore.
	 */
	abstract subscribe(callback: () => void): () => void

	/**
	 * Get current version for change detection.
	 */
	abstract getVersion(): number
}

/**
 * Base class for entity-related handles.
 * Provides common entity subscription logic.
 */
export abstract class EntityRelatedHandle extends BaseHandle {
	constructor(
		protected readonly entityType: string,
		protected readonly entityId: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
	) {
		super(store, dispatcher)
	}

	/**
	 * Subscribe to entity changes.
	 */
	subscribe(callback: () => void): () => void {
		return this.store.subscribeToEntity(this.entityType, this.entityId, callback)
	}

	/**
	 * Get entity snapshot version.
	 */
	getVersion(): number {
		const snapshot = this.store.getEntitySnapshot(this.entityType, this.entityId)
		return snapshot?.version ?? 0
	}

	/**
	 * Get the CANONICAL entity data — the live, possibly-dirty values. Use this
	 * for dirty tracking and any logic that must reflect the user's edits, even
	 * while a pessimistic persist is in-flight. For values to DISPLAY, use
	 * {@link getPresentationData}.
	 */
	protected getEntityData(): Record<string, unknown> | undefined {
		const snapshot = this.store.getEntitySnapshot(this.entityType, this.entityId)
		return snapshot?.data as Record<string, unknown> | undefined
	}

	/**
	 * Get the entity data a consumer should DISPLAY. Equals {@link getEntityData}
	 * except while the entity is pessimistically in-flight, when it returns the
	 * server baseline (the canonical data stays dirty underneath).
	 */
	protected getPresentationData(): Record<string, unknown> | undefined {
		return this.store.getPresentationSnapshot<Record<string, unknown>>(this.entityType, this.entityId)?.data
	}

	/**
	 * Get entity server data.
	 */
	protected getServerData(): Record<string, unknown> | undefined {
		const snapshot = this.store.getEntitySnapshot(this.entityType, this.entityId)
		return snapshot?.serverData as Record<string, unknown> | undefined
	}
}

/**
 * Shallow comparison of embedded data keys against existing snapshot data.
 * Returns true if all keys in embedded data match the snapshot.
 */
export function embeddedDataMatchesSnapshot(
	embedded: Record<string, unknown>,
	snapshot: Record<string, unknown>,
): boolean {
	for (const key of Object.keys(embedded)) {
		if (embedded[key] !== snapshot[key]) {
			return false
		}
	}
	return true
}
