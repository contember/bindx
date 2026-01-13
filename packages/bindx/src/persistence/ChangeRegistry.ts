import type { SnapshotStore } from '../store/SnapshotStore.js'

/**
 * Information about a dirty entity
 */
export interface DirtyEntity {
	readonly entityType: string
	readonly entityId: string
	readonly changeType: 'create' | 'update' | 'delete'
	readonly dirtyFields: readonly string[]
	readonly dirtyRelations: readonly string[]
}

/**
 * ChangeRegistry tracks all dirty entities and in-flight persistence operations.
 * It wraps SnapshotStore's dirty tracking methods and adds deduplication and
 * in-flight tracking for batch persistence operations.
 */
export class ChangeRegistry {
	/** Set of entity keys currently being persisted (for batch operations) */
	private readonly inFlight = new Set<string>()

	/** Subscribers to in-flight state changes */
	private readonly subscribers = new Set<() => void>()

	constructor(private readonly store: SnapshotStore) {}

	/**
	 * Gets the entity key for internal tracking.
	 */
	private getKey(entityType: string, entityId: string): string {
		return `${entityType}:${entityId}`
	}

	/**
	 * Gets all dirty entities with their change types and dirty fields/relations.
	 */
	getDirtyEntities(): readonly DirtyEntity[] {
		const rawDirty = this.store.getAllDirtyEntities()

		return rawDirty.map(entity => ({
			entityType: entity.entityType,
			entityId: entity.entityId,
			changeType: entity.changeType,
			dirtyFields: this.store.getDirtyFields(entity.entityType, entity.entityId),
			dirtyRelations: this.store.getDirtyRelations(entity.entityType, entity.entityId),
		}))
	}

	/**
	 * Gets dirty entities that are not currently in-flight.
	 */
	getDirtyEntitiesNotInFlight(): readonly DirtyEntity[] {
		return this.getDirtyEntities().filter(
			entity => !this.isInFlight(entity.entityType, entity.entityId),
		)
	}

	/**
	 * Gets dirty fields for a specific entity.
	 */
	getDirtyFields(entityType: string, entityId: string): readonly string[] {
		return this.store.getDirtyFields(entityType, entityId)
	}

	/**
	 * Gets dirty relations for a specific entity.
	 */
	getDirtyRelations(entityType: string, entityId: string): readonly string[] {
		return this.store.getDirtyRelations(entityType, entityId)
	}

	/**
	 * Checks if an entity is currently being persisted (in a batch operation).
	 */
	isInFlight(entityType: string, entityId: string): boolean {
		const key = this.getKey(entityType, entityId)
		return this.inFlight.has(key) || this.store.isPersisting(entityType, entityId)
	}

	/**
	 * Marks entities as in-flight (being persisted).
	 */
	markInFlight(entities: ReadonlyArray<{ entityType: string; entityId: string }>): void {
		for (const entity of entities) {
			const key = this.getKey(entity.entityType, entity.entityId)
			this.inFlight.add(key)
		}
		this.notifySubscribers()
	}

	/**
	 * Clears in-flight status for entities.
	 */
	clearInFlight(entities: ReadonlyArray<{ entityType: string; entityId: string }>): void {
		for (const entity of entities) {
			const key = this.getKey(entity.entityType, entity.entityId)
			this.inFlight.delete(key)
		}
		this.notifySubscribers()
	}

	/**
	 * Clears all in-flight status.
	 */
	clearAllInFlight(): void {
		this.inFlight.clear()
		this.notifySubscribers()
	}

	/**
	 * Gets the set of all in-flight entity keys.
	 */
	getInFlightEntities(): ReadonlySet<string> {
		return this.inFlight
	}

	/**
	 * Checks if any entity is currently in-flight.
	 */
	hasInFlight(): boolean {
		return this.inFlight.size > 0
	}

	/**
	 * Checks if there are any dirty entities.
	 */
	hasDirtyEntities(): boolean {
		return this.store.getAllDirtyEntities().length > 0
	}

	/**
	 * Subscribe to in-flight state changes.
	 */
	subscribe(callback: () => void): () => void {
		this.subscribers.add(callback)
		return () => {
			this.subscribers.delete(callback)
		}
	}

	/**
	 * Notifies all subscribers of in-flight state changes.
	 */
	private notifySubscribers(): void {
		for (const subscriber of this.subscribers) {
			subscriber()
		}
	}
}
