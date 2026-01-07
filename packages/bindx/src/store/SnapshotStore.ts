import type { HasOneRelationState } from '../accessors/types.js'
import {
	createEntitySnapshot,
	type EntitySnapshot,
	type HasManySnapshot,
	type HasOneRelationSnapshot,
	type LoadStatus,
} from './snapshots.js'

type Subscriber = () => void

/**
 * Entity load state tracking
 */
interface EntityLoadState {
	status: LoadStatus
	error?: Error
}

/**
 * Entity metadata for mutation generation
 */
export interface EntityMeta {
	/** Whether the entity exists on the server */
	existsOnServer: boolean
	/** Whether the entity is scheduled for deletion */
	isScheduledForDeletion: boolean
}

/**
 * Removal type for has-many items
 */
export type HasManyRemovalType = 'disconnect' | 'delete'

/**
 * Has-many list state stored in SnapshotStore
 */
export interface StoredHasManyState {
	/** IDs of items from server */
	serverIds: Set<string>
	/** Planned removals (disconnect or delete) keyed by entity ID */
	plannedRemovals: Map<string, HasManyRemovalType>
	/** Planned connections (IDs to add to the list) */
	plannedConnections: Set<string>
	version: number
}

/**
 * Relation state stored in SnapshotStore
 */
export interface StoredRelationState {
	currentId: string | null
	serverId: string | null
	state: HasOneRelationState
	serverState: HasOneRelationState
	placeholderData: Record<string, unknown>
	version: number
}

/**
 * SnapshotStore manages immutable snapshots for React integration.
 *
 * Key design principles:
 * - All data is stored as immutable, frozen objects
 * - Changes create new snapshot instances (new references)
 * - Provides subscribe/getSnapshot interface for useSyncExternalStore
 * - Entity-level subscriptions for fine-grained reactivity
 */
export class SnapshotStore {
	/** Entity snapshots keyed by "entityType:id" */
	private readonly entitySnapshots = new Map<string, EntitySnapshot>()

	/** Load states keyed by "entityType:id" */
	private readonly loadStates = new Map<string, EntityLoadState>()

	/** Entity metadata keyed by "entityType:id" */
	private readonly entityMetas = new Map<string, EntityMeta>()

	/** Relation states keyed by "parentType:parentId:fieldName" */
	private readonly relationStates = new Map<string, StoredRelationState>()

	/** Has-many list states keyed by "parentType:parentId:fieldName" */
	private readonly hasManyStates = new Map<string, StoredHasManyState>()

	/** Persisting status keyed by "entityType:id" */
	private readonly persistingEntities = new Set<string>()

	/** Global version number for change detection */
	private globalVersion = 0

	/** Subscribers per entity key */
	private readonly entitySubscribers = new Map<string, Set<Subscriber>>()

	/** Subscribers per relation key */
	private readonly relationSubscribers = new Map<string, Set<Subscriber>>()

	/** Global subscribers (notified on any change) */
	private readonly globalSubscribers = new Set<Subscriber>()

	/** Parent-child relationships: childKey -> Set of parentKeys */
	private readonly childToParents = new Map<string, Set<string>>()

	// ==================== Key Generation ====================

	private getEntityKey(entityType: string, id: string): string {
		return `${entityType}:${id}`
	}

	private getRelationKey(parentType: string, parentId: string, fieldName: string): string {
		return `${parentType}:${parentId}:${fieldName}`
	}

	// ==================== Entity Snapshots ====================

	/**
	 * Gets the current snapshot for an entity.
	 * Returns undefined if entity not loaded.
	 */
	getEntitySnapshot<T extends object>(entityType: string, id: string): EntitySnapshot<T> | undefined {
		const key = this.getEntityKey(entityType, id)
		return this.entitySnapshots.get(key) as EntitySnapshot<T> | undefined
	}

	/**
	 * Checks if an entity exists in the store.
	 */
	hasEntity(entityType: string, id: string): boolean {
		const key = this.getEntityKey(entityType, id)
		return this.entitySnapshots.has(key)
	}

	/**
	 * Sets entity data, creating a new immutable snapshot.
	 * If isServerData is true, both data and serverData are set.
	 * If skipNotify is true, subscribers are not notified (use when normalizing embedded data during render).
	 * New data is merged with existing data to preserve fields from previous fetches with different selections.
	 */
	setEntityData<T extends object>(
		entityType: string,
		id: string,
		data: T,
		isServerData: boolean = false,
		skipNotify: boolean = false,
	): EntitySnapshot<T> {
		const key = this.getEntityKey(entityType, id)
		const existing = this.entitySnapshots.get(key)

		// Merge new data with existing data to preserve fields from previous fetches
		const mergedData = existing?.data
			? { ...existing.data, ...data } as T
			: data

		const serverData = isServerData
			? (existing?.serverData ? { ...existing.serverData, ...data } as T : data)
			: (existing?.serverData as T) ?? mergedData

		const newSnapshot = createEntitySnapshot(
			id,
			entityType,
			mergedData,
			serverData,
			(existing?.version ?? 0) + 1,
		)

		this.entitySnapshots.set(key, newSnapshot)
		if (!skipNotify) {
			this.notifyEntitySubscribers(key)
		}

		return newSnapshot
	}

	/**
	 * Updates specific fields on an entity, creating a new snapshot.
	 */
	updateEntityFields<T extends object>(
		entityType: string,
		id: string,
		updates: Partial<T>,
	): EntitySnapshot<T> | undefined {
		const key = this.getEntityKey(entityType, id)
		const existing = this.entitySnapshots.get(key)

		if (!existing) return undefined

		const newData = { ...existing.data, ...updates } as T
		const newSnapshot = createEntitySnapshot(
			id,
			entityType,
			newData,
			existing.serverData as T,
			existing.version + 1,
		)

		this.entitySnapshots.set(key, newSnapshot)
		this.notifyEntitySubscribers(key)

		return newSnapshot
	}

	/**
	 * Sets a single field value on an entity.
	 */
	setFieldValue(
		entityType: string,
		id: string,
		fieldPath: string[],
		value: unknown,
	): void {
		const key = this.getEntityKey(entityType, id)
		const existing = this.entitySnapshots.get(key)

		if (!existing) return

		// Create new data object with updated field
		const newData = setNestedValue({ ...existing.data }, fieldPath, value)

		const newSnapshot = createEntitySnapshot(
			id,
			entityType,
			newData,
			existing.serverData,
			existing.version + 1,
		)

		this.entitySnapshots.set(key, newSnapshot)
		this.notifyEntitySubscribers(key)
	}

	/**
	 * Commits entity changes (serverData = data).
	 */
	commitEntity(entityType: string, id: string): void {
		const key = this.getEntityKey(entityType, id)
		const existing = this.entitySnapshots.get(key)

		if (!existing) return

		const newSnapshot = createEntitySnapshot(
			id,
			entityType,
			existing.data,
			existing.data, // serverData now matches data
			existing.version + 1,
		)

		this.entitySnapshots.set(key, newSnapshot)
		this.notifyEntitySubscribers(key)
	}

	/**
	 * Resets entity to server data.
	 */
	resetEntity(entityType: string, id: string): void {
		const key = this.getEntityKey(entityType, id)
		const existing = this.entitySnapshots.get(key)

		if (!existing) return

		const newSnapshot = createEntitySnapshot(
			id,
			entityType,
			existing.serverData, // data now matches serverData
			existing.serverData,
			existing.version + 1,
		)

		this.entitySnapshots.set(key, newSnapshot)
		this.notifyEntitySubscribers(key)
	}

	/**
	 * Removes an entity from the store.
	 */
	removeEntity(entityType: string, id: string): void {
		const key = this.getEntityKey(entityType, id)
		this.entitySnapshots.delete(key)
		this.loadStates.delete(key)
		this.notifyEntitySubscribers(key)
	}

	// ==================== Load State ====================

	/**
	 * Gets the load state for an entity.
	 */
	getLoadState(entityType: string, id: string): EntityLoadState | undefined {
		const key = this.getEntityKey(entityType, id)
		return this.loadStates.get(key)
	}

	/**
	 * Sets the load state for an entity.
	 */
	setLoadState(entityType: string, id: string, status: LoadStatus, error?: Error): void {
		const key = this.getEntityKey(entityType, id)
		this.loadStates.set(key, { status, error })
		this.notifyEntitySubscribers(key)
	}

	// ==================== Entity Meta ====================

	/**
	 * Gets entity metadata.
	 */
	getEntityMeta(entityType: string, id: string): EntityMeta | undefined {
		const key = this.getEntityKey(entityType, id)
		return this.entityMetas.get(key)
	}

	/**
	 * Sets whether an entity exists on the server.
	 */
	setExistsOnServer(entityType: string, id: string, existsOnServer: boolean): void {
		const key = this.getEntityKey(entityType, id)
		const existing = this.entityMetas.get(key) ?? { existsOnServer: false, isScheduledForDeletion: false }
		this.entityMetas.set(key, { ...existing, existsOnServer })
		this.notifyEntitySubscribers(key)
	}

	/**
	 * Checks if an entity exists on the server.
	 */
	existsOnServer(entityType: string, id: string): boolean {
		const key = this.getEntityKey(entityType, id)
		return this.entityMetas.get(key)?.existsOnServer ?? false
	}

	/**
	 * Schedules an entity for deletion.
	 */
	scheduleForDeletion(entityType: string, id: string): void {
		const key = this.getEntityKey(entityType, id)
		const existing = this.entityMetas.get(key) ?? { existsOnServer: false, isScheduledForDeletion: false }
		this.entityMetas.set(key, { ...existing, isScheduledForDeletion: true })
		this.notifyEntitySubscribers(key)
	}

	/**
	 * Unschedules an entity from deletion.
	 */
	unscheduleForDeletion(entityType: string, id: string): void {
		const key = this.getEntityKey(entityType, id)
		const existing = this.entityMetas.get(key) ?? { existsOnServer: false, isScheduledForDeletion: false }
		this.entityMetas.set(key, { ...existing, isScheduledForDeletion: false })
		this.notifyEntitySubscribers(key)
	}

	/**
	 * Checks if an entity is scheduled for deletion.
	 */
	isScheduledForDeletion(entityType: string, id: string): boolean {
		const key = this.getEntityKey(entityType, id)
		return this.entityMetas.get(key)?.isScheduledForDeletion ?? false
	}

	// ==================== Has-Many State ====================

	/**
	 * Gets or creates has-many list state.
	 */
	getOrCreateHasMany(
		parentType: string,
		parentId: string,
		fieldName: string,
		serverIds?: string[],
	): StoredHasManyState {
		const key = this.getRelationKey(parentType, parentId, fieldName)

		if (!this.hasManyStates.has(key)) {
			this.hasManyStates.set(key, {
				serverIds: new Set(serverIds ?? []),
				plannedRemovals: new Map(),
				plannedConnections: new Set(),
				version: 0,
			})
		}

		return this.hasManyStates.get(key)!
	}

	/**
	 * Gets has-many list state.
	 */
	getHasMany(
		parentType: string,
		parentId: string,
		fieldName: string,
	): StoredHasManyState | undefined {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		return this.hasManyStates.get(key)
	}

	/**
	 * Sets server IDs for a has-many relation.
	 */
	setHasManyServerIds(
		parentType: string,
		parentId: string,
		fieldName: string,
		serverIds: string[],
	): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		const existing = this.hasManyStates.get(key)

		if (!existing) {
			this.hasManyStates.set(key, {
				serverIds: new Set(serverIds),
				plannedRemovals: new Map(),
				plannedConnections: new Set(),
				version: 0,
			})
		} else {
			this.hasManyStates.set(key, {
				...existing,
				serverIds: new Set(serverIds),
				version: existing.version + 1,
			})
		}

		this.notifyRelationSubscribers(key)
	}

	/**
	 * Plans a removal for a has-many item.
	 */
	planHasManyRemoval(
		parentType: string,
		parentId: string,
		fieldName: string,
		itemId: string,
		type: HasManyRemovalType,
	): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		const existing = this.hasManyStates.get(key)

		if (!existing) {
			this.hasManyStates.set(key, {
				serverIds: new Set(),
				plannedRemovals: new Map([[itemId, type]]),
				plannedConnections: new Set(),
				version: 0,
			})
		} else {
			const newPlannedRemovals = new Map(existing.plannedRemovals)
			newPlannedRemovals.set(itemId, type)
			// If it was planned for connection, cancel that
			const newPlannedConnections = new Set(existing.plannedConnections)
			newPlannedConnections.delete(itemId)
			this.hasManyStates.set(key, {
				...existing,
				plannedRemovals: newPlannedRemovals,
				plannedConnections: newPlannedConnections,
				version: existing.version + 1,
			})
		}

		this.notifyRelationSubscribers(key)
	}

	/**
	 * Cancels a planned removal for a has-many item.
	 */
	cancelHasManyRemoval(
		parentType: string,
		parentId: string,
		fieldName: string,
		itemId: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		const existing = this.hasManyStates.get(key)

		if (!existing) return

		const newPlannedRemovals = new Map(existing.plannedRemovals)
		newPlannedRemovals.delete(itemId)
		this.hasManyStates.set(key, {
			...existing,
			plannedRemovals: newPlannedRemovals,
			version: existing.version + 1,
		})

		this.notifyRelationSubscribers(key)
	}

	/**
	 * Gets planned removals for a has-many relation.
	 */
	getHasManyPlannedRemovals(
		parentType: string,
		parentId: string,
		fieldName: string,
	): Map<string, HasManyRemovalType> | undefined {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		return this.hasManyStates.get(key)?.plannedRemovals
	}

	/**
	 * Plans a connection for a has-many item.
	 */
	planHasManyConnection(
		parentType: string,
		parentId: string,
		fieldName: string,
		itemId: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		const existing = this.hasManyStates.get(key)

		if (!existing) {
			this.hasManyStates.set(key, {
				serverIds: new Set(),
				plannedRemovals: new Map(),
				plannedConnections: new Set([itemId]),
				version: 0,
			})
		} else {
			const newPlannedConnections = new Set(existing.plannedConnections)
			newPlannedConnections.add(itemId)
			// If it was planned for removal, cancel that
			const newPlannedRemovals = new Map(existing.plannedRemovals)
			newPlannedRemovals.delete(itemId)
			this.hasManyStates.set(key, {
				...existing,
				plannedConnections: newPlannedConnections,
				plannedRemovals: newPlannedRemovals,
				version: existing.version + 1,
			})
		}

		this.notifyRelationSubscribers(key)
	}

	/**
	 * Cancels a planned connection for a has-many item.
	 */
	cancelHasManyConnection(
		parentType: string,
		parentId: string,
		fieldName: string,
		itemId: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		const existing = this.hasManyStates.get(key)

		if (!existing) return

		const newPlannedConnections = new Set(existing.plannedConnections)
		newPlannedConnections.delete(itemId)
		this.hasManyStates.set(key, {
			...existing,
			plannedConnections: newPlannedConnections,
			version: existing.version + 1,
		})

		this.notifyRelationSubscribers(key)
	}

	/**
	 * Gets planned connections for a has-many relation.
	 */
	getHasManyPlannedConnections(
		parentType: string,
		parentId: string,
		fieldName: string,
	): Set<string> | undefined {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		return this.hasManyStates.get(key)?.plannedConnections
	}

	/**
	 * Commits has-many state after successful persist.
	 */
	commitHasMany(
		parentType: string,
		parentId: string,
		fieldName: string,
		newServerIds: string[],
	): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		const existing = this.hasManyStates.get(key)

		this.hasManyStates.set(key, {
			serverIds: new Set(newServerIds),
			plannedRemovals: new Map(),
			plannedConnections: new Set(),
			version: (existing?.version ?? 0) + 1,
		})

		this.notifyRelationSubscribers(key)
	}

	/**
	 * Resets has-many state to server state (clears planned operations).
	 */
	resetHasMany(
		parentType: string,
		parentId: string,
		fieldName: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		const existing = this.hasManyStates.get(key)

		if (!existing) return

		this.hasManyStates.set(key, {
			serverIds: existing.serverIds,
			plannedRemovals: new Map(),
			plannedConnections: new Set(),
			version: existing.version + 1,
		})

		this.notifyRelationSubscribers(key)
	}

	// ==================== Persisting State ====================

	/**
	 * Checks if an entity is currently being persisted.
	 */
	isPersisting(entityType: string, id: string): boolean {
		const key = this.getEntityKey(entityType, id)
		return this.persistingEntities.has(key)
	}

	/**
	 * Sets the persisting state for an entity.
	 */
	setPersisting(entityType: string, id: string, isPersisting: boolean): void {
		const key = this.getEntityKey(entityType, id)
		if (isPersisting) {
			this.persistingEntities.add(key)
		} else {
			this.persistingEntities.delete(key)
		}
		this.notifyEntitySubscribers(key)
	}

	// ==================== Relation State ====================

	/**
	 * Gets or creates relation state.
	 */
	getOrCreateRelation(
		parentType: string,
		parentId: string,
		fieldName: string,
		initial: Omit<StoredRelationState, 'version'>,
	): StoredRelationState {
		const key = this.getRelationKey(parentType, parentId, fieldName)

		if (!this.relationStates.has(key)) {
			this.relationStates.set(key, { ...initial, version: 0 })
		}

		return this.relationStates.get(key)!
	}

	/**
	 * Gets relation state.
	 */
	getRelation(
		parentType: string,
		parentId: string,
		fieldName: string,
	): StoredRelationState | undefined {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		return this.relationStates.get(key)
	}

	/**
	 * Updates relation state.
	 * If the relation state doesn't exist, creates it with the provided updates.
	 */
	setRelation(
		parentType: string,
		parentId: string,
		fieldName: string,
		updates: Partial<Omit<StoredRelationState, 'version'>>,
	): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		const existing = this.relationStates.get(key)

		if (!existing) {
			// Initialize relation state with server data from entity snapshot
			const entityKey = this.getEntityKey(parentType, parentId)
			const entitySnapshot = this.entitySnapshots.get(entityKey)
			let serverId: string | null = null
			let serverState: HasOneRelationState = 'disconnected'

			if (entitySnapshot?.serverData) {
				const relatedData = (entitySnapshot.serverData as Record<string, unknown>)[fieldName]
				if (relatedData && typeof relatedData === 'object' && 'id' in relatedData) {
					serverId = (relatedData as { id: string }).id
					serverState = 'connected'
				}
			}

			this.relationStates.set(key, {
				// Use 'in' check to distinguish between explicit null and undefined
				currentId: 'currentId' in updates ? updates.currentId! : serverId,
				serverId,
				state: 'state' in updates ? updates.state! : serverState,
				serverState,
				placeholderData: updates.placeholderData ?? {},
				version: 0,
			})
		} else {
			this.relationStates.set(key, {
				...existing,
				...updates,
				version: existing.version + 1,
			})
		}

		this.notifyRelationSubscribers(key)
	}

	/**
	 * Commits relation state (server = current).
	 */
	commitRelation(parentType: string, parentId: string, fieldName: string): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		const existing = this.relationStates.get(key)

		if (!existing) return

		this.relationStates.set(key, {
			...existing,
			serverId: existing.currentId,
			serverState: existing.state === 'creating' ? 'connected' : existing.state,
			placeholderData: {},
			version: existing.version + 1,
		})

		this.notifyRelationSubscribers(key)
	}

	/**
	 * Resets relation to server state.
	 */
	resetRelation(parentType: string, parentId: string, fieldName: string): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		const existing = this.relationStates.get(key)

		if (!existing) return

		this.relationStates.set(key, {
			...existing,
			currentId: existing.serverId,
			state: existing.serverState,
			placeholderData: {},
			version: existing.version + 1,
		})

		this.notifyRelationSubscribers(key)
	}

	/**
	 * Commits all relations (hasOne and hasMany) for an entity.
	 * Called after successful persist to update server state.
	 */
	commitAllRelations(entityType: string, entityId: string): void {
		const keyPrefix = `${entityType}:${entityId}:`

		// Commit all hasOne relations
		for (const [key, state] of this.relationStates) {
			if (key.startsWith(keyPrefix)) {
				const fieldName = key.slice(keyPrefix.length)
				this.commitRelation(entityType, entityId, fieldName)
			}
		}

		// Commit all hasMany relations
		for (const [key, state] of this.hasManyStates) {
			if (key.startsWith(keyPrefix)) {
				// Compute new server IDs: serverIds - removals + connections
				const newServerIds = new Set(state.serverIds)
				for (const removedId of state.plannedRemovals.keys()) {
					newServerIds.delete(removedId)
				}
				for (const connectedId of state.plannedConnections) {
					newServerIds.add(connectedId)
				}

				const fieldName = key.slice(keyPrefix.length)
				this.commitHasMany(entityType, entityId, fieldName, Array.from(newServerIds))
			}
		}
	}

	// ==================== Subscriptions ====================

	/**
	 * Subscribe to changes on a specific entity.
	 * Returns unsubscribe function.
	 */
	subscribeToEntity(entityType: string, id: string, callback: Subscriber): () => void {
		const key = this.getEntityKey(entityType, id)

		if (!this.entitySubscribers.has(key)) {
			this.entitySubscribers.set(key, new Set())
		}

		this.entitySubscribers.get(key)!.add(callback)

		return () => {
			this.entitySubscribers.get(key)?.delete(callback)
		}
	}

	/**
	 * Subscribe to changes on a specific relation.
	 * Returns unsubscribe function.
	 */
	subscribeToRelation(
		parentType: string,
		parentId: string,
		fieldName: string,
		callback: Subscriber,
	): () => void {
		const key = this.getRelationKey(parentType, parentId, fieldName)

		if (!this.relationSubscribers.has(key)) {
			this.relationSubscribers.set(key, new Set())
		}

		this.relationSubscribers.get(key)!.add(callback)

		return () => {
			this.relationSubscribers.get(key)?.delete(callback)
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
	 * Registers a parent-child relationship for change propagation.
	 * When the child entity changes, parent entity subscribers will be notified.
	 */
	registerParentChild(parentType: string, parentId: string, childType: string, childId: string): void {
		const parentKey = this.getEntityKey(parentType, parentId)
		const childKey = this.getEntityKey(childType, childId)

		let parents = this.childToParents.get(childKey)
		if (!parents) {
			parents = new Set()
			this.childToParents.set(childKey, parents)
		}
		parents.add(parentKey)
	}

	/**
	 * Unregisters a parent-child relationship.
	 */
	unregisterParentChild(parentType: string, parentId: string, childType: string, childId: string): void {
		const parentKey = this.getEntityKey(parentType, parentId)
		const childKey = this.getEntityKey(childType, childId)

		const parents = this.childToParents.get(childKey)
		if (parents) {
			parents.delete(parentKey)
			if (parents.size === 0) {
				this.childToParents.delete(childKey)
			}
		}
	}

	// ==================== Notification ====================

	private notifyEntitySubscribers(key: string, notifiedKeys: Set<string> = new Set()): void {
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

		// Notify parent entity subscribers (propagate change up the tree)
		const parents = this.childToParents.get(key)
		if (parents) {
			for (const parentKey of parents) {
				// Bump parent snapshot version so useSyncExternalStore detects a change
				const parentSnapshot = this.entitySnapshots.get(parentKey)
				if (parentSnapshot) {
					const newSnapshot = createEntitySnapshot(
						parentSnapshot.id,
						parentSnapshot.entityType,
						parentSnapshot.data,
						parentSnapshot.serverData,
						parentSnapshot.version + 1,
					)
					this.entitySnapshots.set(parentKey, newSnapshot)
				}
				this.notifyEntitySubscribers(parentKey, notifiedKeys)
			}
		}

		// Notify global subscribers (only once, not for each parent)
		if (notifiedKeys.size === 1) {
			for (const sub of this.globalSubscribers) {
				sub()
			}
		}
	}

	private notifyRelationSubscribers(key: string): void {
		this.globalVersion++

		// Notify relation-specific subscribers
		const relationSubs = this.relationSubscribers.get(key)
		if (relationSubs) {
			for (const sub of relationSubs) {
				sub()
			}
		}

		// Also notify the parent entity's subscribers and update entity snapshot version
		// key format is "parentType:parentId:fieldName", entity key is "parentType:parentId"
		const parts = key.split(':')
		if (parts.length >= 2) {
			const entityKey = `${parts[0]}:${parts[1]}`

			// Bump entity snapshot version so isEqual detects a change
			const existingSnapshot = this.entitySnapshots.get(entityKey)
			if (existingSnapshot) {
				const newSnapshot = createEntitySnapshot(
					existingSnapshot.id,
					existingSnapshot.entityType,
					existingSnapshot.data,
					existingSnapshot.serverData,
					existingSnapshot.version + 1,
				)
				this.entitySnapshots.set(entityKey, newSnapshot)
			}

			const entitySubs = this.entitySubscribers.get(entityKey)
			if (entitySubs) {
				for (const sub of entitySubs) {
					sub()
				}
			}
		}

		// Notify global subscribers
		for (const sub of this.globalSubscribers) {
			sub()
		}
	}

	// ==================== Partial Snapshot Export/Import ====================

	/**
	 * Exports a partial snapshot containing only the specified keys.
	 * Used by UndoManager to capture state before actions.
	 */
	exportPartialSnapshot(keys: {
		entityKeys: string[]
		relationKeys: string[]
		hasManyKeys: string[]
	}): {
		entitySnapshots: Map<string, EntitySnapshot>
		relationStates: Map<string, StoredRelationState>
		hasManyStates: Map<string, StoredHasManyState>
		entityMetas: Map<string, EntityMeta>
	} {
		const entitySnapshots = new Map<string, EntitySnapshot>()
		const relationStates = new Map<string, StoredRelationState>()
		const hasManyStates = new Map<string, StoredHasManyState>()
		const entityMetas = new Map<string, EntityMeta>()

		// Export entity snapshots
		for (const key of keys.entityKeys) {
			const snapshot = this.entitySnapshots.get(key)
			if (snapshot) {
				entitySnapshots.set(key, snapshot)
			}
			const meta = this.entityMetas.get(key)
			if (meta) {
				entityMetas.set(key, { ...meta })
			}
		}

		// Export relation states (deep clone Sets/Maps)
		for (const key of keys.relationKeys) {
			const state = this.relationStates.get(key)
			if (state) {
				relationStates.set(key, {
					...state,
					placeholderData: { ...state.placeholderData },
				})
			}
		}

		// Export has-many states (deep clone Sets/Maps)
		for (const key of keys.hasManyKeys) {
			const state = this.hasManyStates.get(key)
			if (state) {
				hasManyStates.set(key, {
					serverIds: new Set(state.serverIds),
					plannedRemovals: new Map(state.plannedRemovals),
					plannedConnections: new Set(state.plannedConnections),
					version: state.version,
				})
			}
		}

		return { entitySnapshots, relationStates, hasManyStates, entityMetas }
	}

	/**
	 * Imports a partial snapshot, restoring the specified state.
	 * Used by UndoManager to restore state on undo/redo.
	 */
	importPartialSnapshot(snapshot: {
		entitySnapshots: Map<string, EntitySnapshot>
		relationStates: Map<string, StoredRelationState>
		hasManyStates: Map<string, StoredHasManyState>
		entityMetas: Map<string, EntityMeta>
	}): void {
		const notifiedEntityKeys = new Set<string>()
		const notifiedRelationKeys = new Set<string>()

		// Restore entity snapshots
		for (const [key, entitySnapshot] of snapshot.entitySnapshots) {
			this.entitySnapshots.set(key, entitySnapshot)
			notifiedEntityKeys.add(key)
		}

		// Restore entity metas
		for (const [key, meta] of snapshot.entityMetas) {
			this.entityMetas.set(key, { ...meta })
		}

		// Restore relation states
		for (const [key, state] of snapshot.relationStates) {
			this.relationStates.set(key, {
				...state,
				placeholderData: { ...state.placeholderData },
			})
			notifiedRelationKeys.add(key)
		}

		// Restore has-many states
		for (const [key, state] of snapshot.hasManyStates) {
			this.hasManyStates.set(key, {
				serverIds: new Set(state.serverIds),
				plannedRemovals: new Map(state.plannedRemovals),
				plannedConnections: new Set(state.plannedConnections),
				version: state.version + 1, // Bump version to trigger re-render
			})
			notifiedRelationKeys.add(key)
		}

		// Notify subscribers
		this.globalVersion++

		for (const key of notifiedEntityKeys) {
			const subs = this.entitySubscribers.get(key)
			if (subs) {
				for (const sub of subs) {
					sub()
				}
			}
		}

		for (const key of notifiedRelationKeys) {
			const subs = this.relationSubscribers.get(key)
			if (subs) {
				for (const sub of subs) {
					sub()
				}
			}
		}

		// Notify global subscribers
		for (const sub of this.globalSubscribers) {
			sub()
		}
	}

	// ==================== Utility ====================

	/**
	 * Clears all data from the store.
	 */
	clear(): void {
		this.entitySnapshots.clear()
		this.loadStates.clear()
		this.entityMetas.clear()
		this.relationStates.clear()
		this.hasManyStates.clear()
		this.persistingEntities.clear()
		this.globalVersion++

		// Notify all subscribers
		for (const sub of this.globalSubscribers) {
			sub()
		}
	}
}

// ==================== Helper Functions ====================

/**
 * Sets a nested value in an object, returning a new object.
 */
function setNestedValue<T extends Record<string, unknown>>(
	obj: T,
	path: string[],
	value: unknown,
): T {
	if (path.length === 0) return obj

	const result = { ...obj }
	let current: Record<string, unknown> = result

	for (let i = 0; i < path.length - 1; i++) {
		const key = path[i]!
		const nextValue = current[key]

		if (typeof nextValue === 'object' && nextValue !== null) {
			current[key] = { ...nextValue as Record<string, unknown> }
		} else {
			current[key] = {}
		}

		current = current[key] as Record<string, unknown>
	}

	const lastKey = path[path.length - 1]!
	current[lastKey] = value

	return result
}
