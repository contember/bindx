import type { Disposable, DisposableGroup } from '../core/Disposable.js'
import type { ActionDispatcher } from '../core/ActionDispatcher.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'

/**
 * Base class for all handles.
 * Provides common functionality for subscription and disposal.
 *
 * Handles are stable objects that:
 * - Have stable identity (same instance across renders)
 * - Provide subscribe/getSnapshot for useSyncExternalStore
 * - Dispatch actions for mutations
 */
export abstract class BaseHandle implements Disposable {
	protected _disposed = false

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

	/**
	 * Dispose resources (unsubscribe, cleanup).
	 */
	dispose(): void {
		this._disposed = true
	}

	/**
	 * Check if the handle has been disposed.
	 */
	get isDisposed(): boolean {
		return this._disposed
	}

	/**
	 * Throws if the handle has been disposed.
	 */
	protected assertNotDisposed(): void {
		if (this._disposed) {
			throw new Error('Handle has been disposed')
		}
	}
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
	 * Get entity data.
	 */
	protected getEntityData(): Record<string, unknown> | undefined {
		const snapshot = this.store.getEntitySnapshot(this.entityType, this.entityId)
		return snapshot?.data as Record<string, unknown> | undefined
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
