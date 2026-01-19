import type { HasOneRelationState } from '../handles/types.js'
import {
	createEntitySnapshot,
	type EntitySnapshot,
	type HasManySnapshot,
	type HasOneRelationSnapshot,
	type LoadStatus,
} from './snapshots.js'
import type { ErrorState, FieldError } from '../errors/types.js'
import { filterStickyErrors } from '../errors/types.js'
import { deepEqual } from '../utils/deepEqual.js'

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
	/** Explicit ordered list of item IDs, null means use default order (serverIds + plannedConnections) */
	orderedIds: string[] | null
	/** Planned removals (disconnect or delete) keyed by entity ID */
	plannedRemovals: Map<string, HasManyRemovalType>
	/** Planned connections (IDs to add to the list) */
	plannedConnections: Set<string>
	/** Entity IDs created via add() - tracked for proper remove() semantics and mutation generation */
	createdEntities: Set<string>
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

// ==================== ID Type Detection ====================

/**
 * Checks if an ID is a temporary ID (created locally, not yet persisted).
 */
export function isTempId(id: string): boolean {
	return id.startsWith('__temp_')
}

/**
 * Checks if an ID is a placeholder ID (disconnected relation placeholder).
 */
export function isPlaceholderId(id: string): boolean {
	return id.startsWith('__placeholder_')
}

/**
 * Checks if an ID is a persisted/real ID from the server.
 */
export function isPersistedId(id: string): boolean {
	return !isTempId(id) && !isPlaceholderId(id)
}

/**
 * Generates a new placeholder ID.
 */
export function generatePlaceholderId(): string {
	return `__placeholder_${crypto.randomUUID()}`
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

	/** Field errors keyed by "entityType:id:fieldName" */
	private readonly fieldErrors = new Map<string, ErrorState>()

	/** Entity-level errors keyed by "entityType:id" */
	private readonly entityErrors = new Map<string, ErrorState>()

	/** Relation errors keyed by "entityType:id:relationName" */
	private readonly relationErrors = new Map<string, ErrorState>()

	/** Touched state keyed by "entityType:id:fieldName" */
	private readonly touchedFields = new Map<string, boolean>()

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

	/** Mapping from temp ID to persisted ID (keyed by "entityType:tempId") */
	private readonly tempToPersistedId = new Map<string, string>()

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

		// When setting server data, mark entity as existing on server
		if (isServerData) {
			const existingMeta = this.entityMetas.get(key) ?? { existsOnServer: false, isScheduledForDeletion: false }
			this.entityMetas.set(key, { ...existingMeta, existsOnServer: true })
		}

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

	// ==================== Create Mode (Temp ID Management) ====================

	/**
	 * Creates a new entity with a temporary ID for create mode.
	 * The entity is initialized with `existsOnServer: false`.
	 *
	 * @param entityType - The entity type name
	 * @param initialData - Optional initial data for the entity
	 * @returns The generated temporary ID
	 */
	createEntity(entityType: string, initialData?: Record<string, unknown>): string {
		const tempId = `__temp_${crypto.randomUUID()}`
		const data = { id: tempId, ...initialData }

		// Create snapshot with initial data (not server data)
		this.setEntityData(entityType, tempId, data, false)

		// Mark as not existing on server
		this.setExistsOnServer(entityType, tempId, false)

		return tempId
	}

	/**
	 * Maps a temporary ID to its persisted (server-assigned) ID after successful creation.
	 * Also updates `existsOnServer` to true.
	 *
	 * @param entityType - The entity type name
	 * @param tempId - The temporary ID
	 * @param persistedId - The server-assigned ID
	 */
	mapTempIdToPersistedId(entityType: string, tempId: string, persistedId: string): void {
		const key = this.getEntityKey(entityType, tempId)
		this.tempToPersistedId.set(key, persistedId)

		// Update existsOnServer flag
		this.setExistsOnServer(entityType, tempId, true)

		// Notify subscribers about the change
		this.notifyEntitySubscribers(key)
	}

	/**
	 * Gets the persisted ID for an entity.
	 * Returns the ID itself if it's already a real ID, null if it's a temp/placeholder ID without mapping.
	 *
	 * @param entityType - The entity type name
	 * @param id - The entity ID (can be temp, placeholder, or real)
	 * @returns The persisted ID or null if not yet persisted
	 */
	getPersistedId(entityType: string, id: string): string | null {
		// Placeholder IDs are never persisted
		if (isPlaceholderId(id)) {
			return null
		}

		// Real IDs are already persisted
		if (isPersistedId(id)) {
			return id
		}

		// Temp IDs may have a mapping to persisted ID
		const key = this.getEntityKey(entityType, id)
		return this.tempToPersistedId.get(key) ?? null
	}

	/**
	 * Checks if an entity is new (created locally, not yet persisted to server).
	 *
	 * @param entityType - The entity type name
	 * @param id - The entity ID
	 * @returns true if the entity is new (has temp ID and no persisted mapping)
	 */
	isNewEntity(entityType: string, id: string): boolean {
		// Placeholder IDs are considered "new" (not yet on server)
		if (isPlaceholderId(id)) {
			return true
		}

		// Real IDs are not new
		if (isPersistedId(id)) {
			return false
		}

		// Temp IDs are new if they don't have a persisted mapping
		const key = this.getEntityKey(entityType, id)
		return !this.tempToPersistedId.has(key)
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
				orderedIds: null,
				plannedRemovals: new Map(),
				plannedConnections: new Set(),
				createdEntities: new Set(),
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
				orderedIds: null,
				plannedRemovals: new Map(),
				plannedConnections: new Set(),
				createdEntities: new Set(),
				version: 0,
			})
		} else {
			this.hasManyStates.set(key, {
				...existing,
				serverIds: new Set(serverIds),
				orderedIds: null,
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
				orderedIds: null,
				plannedRemovals: new Map([[itemId, type]]),
				plannedConnections: new Set(),
				createdEntities: new Set(),
				version: 0,
			})
		} else {
			const newPlannedRemovals = new Map(existing.plannedRemovals)
			newPlannedRemovals.set(itemId, type)
			// If it was planned for connection, cancel that
			const newPlannedConnections = new Set(existing.plannedConnections)
			newPlannedConnections.delete(itemId)
			// Remove from orderedIds if we have explicit ordering
			let newOrderedIds = existing.orderedIds
			if (newOrderedIds !== null) {
				newOrderedIds = newOrderedIds.filter(id => id !== itemId)
			}
			// Also remove from createdEntities if it was created via add()
			const newCreatedEntities = new Set(existing.createdEntities)
			newCreatedEntities.delete(itemId)
			this.hasManyStates.set(key, {
				...existing,
				orderedIds: newOrderedIds,
				plannedRemovals: newPlannedRemovals,
				plannedConnections: newPlannedConnections,
				createdEntities: newCreatedEntities,
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
				orderedIds: null,
				plannedRemovals: new Map(),
				plannedConnections: new Set([itemId]),
				createdEntities: new Set(),
				version: 0,
			})
		} else {
			const newPlannedConnections = new Set(existing.plannedConnections)
			newPlannedConnections.add(itemId)
			// If it was planned for removal, cancel that
			const newPlannedRemovals = new Map(existing.plannedRemovals)
			newPlannedRemovals.delete(itemId)
			// Add to orderedIds if we have explicit ordering
			let newOrderedIds = existing.orderedIds
			if (newOrderedIds !== null && !newOrderedIds.includes(itemId)) {
				newOrderedIds = [...newOrderedIds, itemId]
			}
			this.hasManyStates.set(key, {
				...existing,
				orderedIds: newOrderedIds,
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
			orderedIds: null,
			plannedRemovals: new Map(),
			plannedConnections: new Set(),
			createdEntities: new Set(),
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
			orderedIds: null,
			plannedRemovals: new Map(),
			plannedConnections: new Set(),
			createdEntities: new Set(),
			version: existing.version + 1,
		})

		this.notifyRelationSubscribers(key)
	}

	/**
	 * Adds a newly created entity to a has-many relation.
	 * Used by HasManyListHandle.add() for inline entity creation.
	 */
	addToHasMany(
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
				orderedIds: [itemId],
				plannedRemovals: new Map(),
				plannedConnections: new Set([itemId]),
				createdEntities: new Set([itemId]),
				version: 0,
			})
		} else {
			const newPlannedConnections = new Set(existing.plannedConnections)
			newPlannedConnections.add(itemId)
			const newCreatedEntities = new Set(existing.createdEntities)
			newCreatedEntities.add(itemId)
			// Initialize orderedIds if null, then append new item
			const currentOrderedIds = existing.orderedIds ?? this.computeDefaultOrderedIds(existing)
			const newOrderedIds = [...currentOrderedIds, itemId]
			this.hasManyStates.set(key, {
				...existing,
				orderedIds: newOrderedIds,
				plannedConnections: newPlannedConnections,
				createdEntities: newCreatedEntities,
				version: existing.version + 1,
			})
		}

		this.notifyRelationSubscribers(key)
	}

	/**
	 * Removes an entity from a has-many relation.
	 * For newly created entities (via add()), cancels the connection.
	 * For existing server entities, plans a disconnect.
	 */
	removeFromHasMany(
		parentType: string,
		parentId: string,
		fieldName: string,
		itemId: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		const existing = this.hasManyStates.get(key)

		if (!existing) return

		const isCreatedEntity = existing.createdEntities.has(itemId)

		if (isCreatedEntity) {
			// Entity was created via add() - just cancel the connection
			const newPlannedConnections = new Set(existing.plannedConnections)
			newPlannedConnections.delete(itemId)
			const newCreatedEntities = new Set(existing.createdEntities)
			newCreatedEntities.delete(itemId)
			// Remove from orderedIds
			let newOrderedIds = existing.orderedIds
			if (newOrderedIds !== null) {
				newOrderedIds = newOrderedIds.filter(id => id !== itemId)
			}

			// Check if state is "clean" - reset orderedIds to null if so
			const newState: StoredHasManyState = {
				...existing,
				orderedIds: newOrderedIds,
				plannedConnections: newPlannedConnections,
				createdEntities: newCreatedEntities,
				version: existing.version + 1,
			}

			// If no changes, check if orderedIds matches default order
			if (
				newPlannedConnections.size === 0 &&
				newCreatedEntities.size === 0 &&
				existing.plannedRemovals.size === 0 &&
				newOrderedIds !== null
			) {
				const defaultOrder = this.computeDefaultOrderedIds(newState)
				if (this.arraysEqual(newOrderedIds, defaultOrder)) {
					newState.orderedIds = null
				}
			}

			this.hasManyStates.set(key, newState)
		} else {
			// Existing server entity - plan disconnect
			this.planHasManyRemoval(parentType, parentId, fieldName, itemId, 'disconnect')
			return // planHasManyRemoval already notifies
		}

		this.notifyRelationSubscribers(key)
	}

	/**
	 * Compares two string arrays for equality.
	 */
	private arraysEqual(a: string[], b: string[]): boolean {
		if (a.length !== b.length) return false
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false
		}
		return true
	}

	/**
	 * Moves an item within a has-many relation from one index to another.
	 */
	moveInHasMany(
		parentType: string,
		parentId: string,
		fieldName: string,
		fromIndex: number,
		toIndex: number,
	): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		const existing = this.hasManyStates.get(key)

		if (!existing) return

		// Initialize orderedIds if null
		const currentOrderedIds = existing.orderedIds ?? this.computeDefaultOrderedIds(existing)

		// Validate indices
		if (fromIndex < 0 || fromIndex >= currentOrderedIds.length) return
		if (toIndex < 0 || toIndex >= currentOrderedIds.length) return
		if (fromIndex === toIndex) return

		// Perform the move
		const newOrderedIds = [...currentOrderedIds]
		const movedItem = newOrderedIds.splice(fromIndex, 1)[0]
		if (movedItem === undefined) return
		newOrderedIds.splice(toIndex, 0, movedItem)

		this.hasManyStates.set(key, {
			...existing,
			orderedIds: newOrderedIds,
			version: existing.version + 1,
		})

		this.notifyRelationSubscribers(key)
	}

	/**
	 * Gets the ordered list of item IDs for a has-many relation.
	 * Computes the current ordered list based on state.
	 */
	getHasManyOrderedIds(
		parentType: string,
		parentId: string,
		fieldName: string,
	): string[] {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		const existing = this.hasManyStates.get(key)

		if (!existing) return []

		if (existing.orderedIds !== null) {
			return existing.orderedIds
		}

		return this.computeDefaultOrderedIds(existing)
	}

	/**
	 * Computes the default ordered IDs for a has-many relation.
	 * Order is: serverIds (minus removals) + plannedConnections
	 */
	private computeDefaultOrderedIds(state: StoredHasManyState): string[] {
		const result: string[] = []

		// Add server IDs that are not removed
		for (const id of state.serverIds) {
			if (!state.plannedRemovals.has(id)) {
				result.push(id)
			}
		}

		// Add planned connections
		for (const id of state.plannedConnections) {
			if (!result.includes(id)) {
				result.push(id)
			}
		}

		return result
	}

	/**
	 * Checks if an entity in a has-many relation was created via add().
	 */
	isHasManyItemCreated(
		parentType: string,
		parentId: string,
		fieldName: string,
		itemId: string,
	): boolean {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		const existing = this.hasManyStates.get(key)
		return existing?.createdEntities.has(itemId) ?? false
	}

	/**
	 * Gets the created entities set for a has-many relation.
	 */
	getHasManyCreatedEntities(
		parentType: string,
		parentId: string,
		fieldName: string,
	): Set<string> | undefined {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		return this.hasManyStates.get(key)?.createdEntities
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

	// ==================== Error State ====================

	/**
	 * Gets field errors for a specific field.
	 */
	getFieldErrors(entityType: string, id: string, fieldName: string): readonly FieldError[] {
		const key = this.getRelationKey(entityType, id, fieldName)
		return this.fieldErrors.get(key)?.errors ?? []
	}

	/**
	 * Adds an error to a field.
	 */
	addFieldError(entityType: string, id: string, fieldName: string, error: FieldError): void {
		const key = this.getRelationKey(entityType, id, fieldName)
		const existing = this.fieldErrors.get(key)
		const errors = existing ? [...existing.errors, error] : [error]
		this.fieldErrors.set(key, { errors, version: (existing?.version ?? 0) + 1 })
		this.notifyEntitySubscribers(this.getEntityKey(entityType, id))
	}

	/**
	 * Clears field errors, optionally filtering by source.
	 */
	clearFieldErrors(
		entityType: string,
		id: string,
		fieldName: string,
		source?: 'client' | 'server',
	): void {
		const key = this.getRelationKey(entityType, id, fieldName)
		const existing = this.fieldErrors.get(key)
		if (!existing) return

		if (source === undefined) {
			this.fieldErrors.delete(key)
		} else {
			const filtered = existing.errors.filter(e => e.source !== source)
			if (filtered.length === 0) {
				this.fieldErrors.delete(key)
			} else {
				this.fieldErrors.set(key, { errors: filtered, version: existing.version + 1 })
			}
		}
		this.notifyEntitySubscribers(this.getEntityKey(entityType, id))
	}

	/**
	 * Clears non-sticky client errors for a field.
	 * Called when field value changes.
	 */
	clearNonStickyFieldErrors(entityType: string, id: string, fieldName: string): void {
		const key = this.getRelationKey(entityType, id, fieldName)
		const existing = this.fieldErrors.get(key)
		if (!existing) return

		const filtered = filterStickyErrors(existing.errors)
		if (filtered.length === existing.errors.length) return // No change

		if (filtered.length === 0) {
			this.fieldErrors.delete(key)
		} else {
			this.fieldErrors.set(key, { errors: filtered, version: existing.version + 1 })
		}
		this.notifyEntitySubscribers(this.getEntityKey(entityType, id))
	}

	/**
	 * Gets entity-level errors.
	 */
	getEntityErrors(entityType: string, id: string): readonly FieldError[] {
		const key = this.getEntityKey(entityType, id)
		return this.entityErrors.get(key)?.errors ?? []
	}

	/**
	 * Adds an entity-level error.
	 */
	addEntityError(entityType: string, id: string, error: FieldError): void {
		const key = this.getEntityKey(entityType, id)
		const existing = this.entityErrors.get(key)
		const errors = existing ? [...existing.errors, error] : [error]
		this.entityErrors.set(key, { errors, version: (existing?.version ?? 0) + 1 })
		this.notifyEntitySubscribers(key)
	}

	/**
	 * Clears entity-level errors, optionally filtering by source.
	 */
	clearEntityErrors(entityType: string, id: string, source?: 'client' | 'server'): void {
		const key = this.getEntityKey(entityType, id)
		const existing = this.entityErrors.get(key)
		if (!existing) return

		if (source === undefined) {
			this.entityErrors.delete(key)
		} else {
			const filtered = existing.errors.filter(e => e.source !== source)
			if (filtered.length === 0) {
				this.entityErrors.delete(key)
			} else {
				this.entityErrors.set(key, { errors: filtered, version: existing.version + 1 })
			}
		}
		this.notifyEntitySubscribers(key)
	}

	/**
	 * Gets relation errors.
	 */
	getRelationErrors(entityType: string, id: string, relationName: string): readonly FieldError[] {
		const key = this.getRelationKey(entityType, id, relationName)
		return this.relationErrors.get(key)?.errors ?? []
	}

	/**
	 * Adds a relation error.
	 */
	addRelationError(entityType: string, id: string, relationName: string, error: FieldError): void {
		const key = this.getRelationKey(entityType, id, relationName)
		const existing = this.relationErrors.get(key)
		const errors = existing ? [...existing.errors, error] : [error]
		this.relationErrors.set(key, { errors, version: (existing?.version ?? 0) + 1 })
		this.notifyRelationSubscribers(key)
	}

	/**
	 * Clears relation errors, optionally filtering by source.
	 */
	clearRelationErrors(
		entityType: string,
		id: string,
		relationName: string,
		source?: 'client' | 'server',
	): void {
		const key = this.getRelationKey(entityType, id, relationName)
		const existing = this.relationErrors.get(key)
		if (!existing) return

		if (source === undefined) {
			this.relationErrors.delete(key)
		} else {
			const filtered = existing.errors.filter(e => e.source !== source)
			if (filtered.length === 0) {
				this.relationErrors.delete(key)
			} else {
				this.relationErrors.set(key, { errors: filtered, version: existing.version + 1 })
			}
		}
		this.notifyRelationSubscribers(key)
	}

	/**
	 * Clears all server errors for an entity (entity-level, fields, and relations).
	 * Called before persist to clear stale server errors.
	 */
	clearAllServerErrors(entityType: string, id: string): void {
		const entityKey = this.getEntityKey(entityType, id)
		const keyPrefix = `${entityType}:${id}:`

		// Clear entity-level server errors
		this.clearEntityErrors(entityType, id, 'server')

		// Clear field server errors
		for (const key of this.fieldErrors.keys()) {
			if (key.startsWith(keyPrefix)) {
				const fieldName = key.slice(keyPrefix.length)
				this.clearFieldErrors(entityType, id, fieldName, 'server')
			}
		}

		// Clear relation server errors
		for (const key of this.relationErrors.keys()) {
			if (key.startsWith(keyPrefix)) {
				const relationName = key.slice(keyPrefix.length)
				this.clearRelationErrors(entityType, id, relationName, 'server')
			}
		}
	}

	/**
	 * Clears all errors for an entity (entity-level, fields, and relations).
	 */
	clearAllErrors(entityType: string, id: string): void {
		const entityKey = this.getEntityKey(entityType, id)
		const keyPrefix = `${entityType}:${id}:`

		// Clear entity-level errors
		this.entityErrors.delete(entityKey)

		// Clear field errors
		for (const key of [...this.fieldErrors.keys()]) {
			if (key.startsWith(keyPrefix)) {
				this.fieldErrors.delete(key)
			}
		}

		// Clear relation errors
		for (const key of [...this.relationErrors.keys()]) {
			if (key.startsWith(keyPrefix)) {
				this.relationErrors.delete(key)
			}
		}

		this.notifyEntitySubscribers(entityKey)
	}

	/**
	 * Checks if an entity has any client errors (entity-level, fields, or relations).
	 * Used to block persist when validation errors exist.
	 */
	hasClientErrors(entityType: string, id: string): boolean {
		const entityKey = this.getEntityKey(entityType, id)
		const keyPrefix = `${entityType}:${id}:`

		// Check entity-level errors
		const entityErrs = this.entityErrors.get(entityKey)
		if (entityErrs?.errors.some(e => e.source === 'client')) {
			return true
		}

		// Check field errors
		for (const [key, state] of this.fieldErrors) {
			if (key.startsWith(keyPrefix) && state.errors.some(e => e.source === 'client')) {
				return true
			}
		}

		// Check relation errors
		for (const [key, state] of this.relationErrors) {
			if (key.startsWith(keyPrefix) && state.errors.some(e => e.source === 'client')) {
				return true
			}
		}

		return false
	}

	/**
	 * Checks if an entity has any errors at all.
	 */
	hasAnyErrors(entityType: string, id: string): boolean {
		const entityKey = this.getEntityKey(entityType, id)
		const keyPrefix = `${entityType}:${id}:`

		// Check entity-level errors
		const entityErrs = this.entityErrors.get(entityKey)
		if (entityErrs && entityErrs.errors.length > 0) {
			return true
		}

		// Check field errors
		for (const [key, state] of this.fieldErrors) {
			if (key.startsWith(keyPrefix) && state.errors.length > 0) {
				return true
			}
		}

		// Check relation errors
		for (const [key, state] of this.relationErrors) {
			if (key.startsWith(keyPrefix) && state.errors.length > 0) {
				return true
			}
		}

		return false
	}

	// ==================== Touched State ====================

	/**
	 * Checks if a field has been touched (interacted with by the user).
	 */
	isFieldTouched(entityType: string, id: string, fieldName: string): boolean {
		const key = this.getRelationKey(entityType, id, fieldName)
		return this.touchedFields.get(key) ?? false
	}

	/**
	 * Sets the touched state for a field.
	 */
	setFieldTouched(entityType: string, id: string, fieldName: string, touched: boolean): void {
		const key = this.getRelationKey(entityType, id, fieldName)
		const current = this.touchedFields.get(key) ?? false
		if (current === touched) return

		this.touchedFields.set(key, touched)
		this.notifyEntitySubscribers(this.getEntityKey(entityType, id))
	}

	/**
	 * Clears all touched state for an entity.
	 */
	clearEntityTouchedState(entityType: string, id: string): void {
		const keyPrefix = `${entityType}:${id}:`

		for (const key of [...this.touchedFields.keys()]) {
			if (key.startsWith(keyPrefix)) {
				this.touchedFields.delete(key)
			}
		}

		this.notifyEntitySubscribers(this.getEntityKey(entityType, id))
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

	/**
	 * Resets all relations (hasOne and hasMany) for an entity to server state.
	 * Called when persist fails with rollbackOnError enabled.
	 */
	resetAllRelations(entityType: string, entityId: string): void {
		const keyPrefix = `${entityType}:${entityId}:`

		// Reset all hasOne relations
		for (const [key] of this.relationStates) {
			if (key.startsWith(keyPrefix)) {
				const fieldName = key.slice(keyPrefix.length)
				this.resetRelation(entityType, entityId, fieldName)
			}
		}

		// Reset all hasMany relations
		for (const [key] of this.hasManyStates) {
			if (key.startsWith(keyPrefix)) {
				const fieldName = key.slice(keyPrefix.length)
				this.resetHasMany(entityType, entityId, fieldName)
			}
		}
	}

	/**
	 * Gets all relation states for an entity.
	 * Returns a map of relation key -> relation state.
	 * Used for capturing state in pessimistic mode.
	 */
	getAllRelationsForEntity(entityType: string, entityId: string): Map<string, StoredRelationState> {
		const keyPrefix = `${entityType}:${entityId}:`
		const result = new Map<string, StoredRelationState>()

		for (const [key, state] of this.relationStates) {
			if (key.startsWith(keyPrefix)) {
				// Deep clone the state to avoid mutation
				result.set(key, { ...state })
			}
		}

		return result
	}

	/**
	 * Gets all has-many states for an entity.
	 * Returns a map of has-many key -> has-many state.
	 * Used for capturing state in pessimistic mode.
	 */
	getAllHasManyForEntity(entityType: string, entityId: string): Map<string, StoredHasManyState> {
		const keyPrefix = `${entityType}:${entityId}:`
		const result = new Map<string, StoredHasManyState>()

		for (const [key, state] of this.hasManyStates) {
			if (key.startsWith(keyPrefix)) {
				// Deep clone the state to avoid mutation
				result.set(key, {
					serverIds: new Set(state.serverIds),
					orderedIds: state.orderedIds ? [...state.orderedIds] : null,
					plannedRemovals: new Map(state.plannedRemovals),
					plannedConnections: new Set(state.plannedConnections),
					createdEntities: new Set(state.createdEntities),
					version: state.version,
				})
			}
		}

		return result
	}

	/**
	 * Restores a has-many state from a captured snapshot.
	 * Used in pessimistic mode after successful server confirmation.
	 */
	restoreHasManyState(
		parentType: string,
		parentId: string,
		fieldName: string,
		state: StoredHasManyState,
	): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		this.hasManyStates.set(key, {
			serverIds: new Set(state.serverIds),
			orderedIds: state.orderedIds ? [...state.orderedIds] : null,
			plannedRemovals: new Map(state.plannedRemovals),
			plannedConnections: new Set(state.plannedConnections),
			createdEntities: new Set(state.createdEntities),
			version: state.version + 1,
		})
		this.notifyRelationSubscribers(key)
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
					orderedIds: state.orderedIds ? [...state.orderedIds] : null,
					plannedRemovals: new Map(state.plannedRemovals),
					plannedConnections: new Set(state.plannedConnections),
					createdEntities: new Set(state.createdEntities),
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
				orderedIds: state.orderedIds ? [...state.orderedIds] : null,
				plannedRemovals: new Map(state.plannedRemovals),
				plannedConnections: new Set(state.plannedConnections),
				createdEntities: new Set(state.createdEntities),
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

	// ==================== Dirty Tracking ====================

	/**
	 * Information about a dirty entity
	 */


	/**
	 * Gets all dirty entities in the store.
	 * Returns entities that have changes (data !== serverData), are new, or are scheduled for deletion.
	 */
	getAllDirtyEntities(): Array<{
		entityType: string
		entityId: string
		changeType: 'create' | 'update' | 'delete'
	}> {
		const dirtyEntities: Array<{
			entityType: string
			entityId: string
			changeType: 'create' | 'update' | 'delete'
		}> = []

		// Check all entity snapshots
		for (const [key, snapshot] of this.entitySnapshots) {
			const [entityType, ...idParts] = key.split(':')
			const entityId = idParts.join(':')

			if (!entityType || !entityId) continue

			// Check if scheduled for deletion
			if (this.isScheduledForDeletion(entityType, entityId)) {
				// Only include if it exists on server (can't delete what doesn't exist)
				if (this.existsOnServer(entityType, entityId)) {
					dirtyEntities.push({ entityType, entityId, changeType: 'delete' })
				}
				continue
			}

			// Check if new entity (not yet on server)
			if (!this.existsOnServer(entityType, entityId)) {
				dirtyEntities.push({ entityType, entityId, changeType: 'create' })
				continue
			}

			// Check if entity has dirty fields or relations
			if (this.isEntityDirty(entityType, entityId)) {
				dirtyEntities.push({ entityType, entityId, changeType: 'update' })
			}
		}

		return dirtyEntities
	}

	/**
	 * Checks if an entity has any dirty data (data !== serverData).
	 */
	private isEntityDirty(entityType: string, entityId: string): boolean {
		// Check scalar fields
		const dirtyFields = this.getDirtyFields(entityType, entityId)
		if (dirtyFields.length > 0) {
			return true
		}

		// Check relations
		const dirtyRelations = this.getDirtyRelations(entityType, entityId)
		if (dirtyRelations.length > 0) {
			return true
		}

		return false
	}

	/**
	 * Gets the list of dirty fields for an entity.
	 * Compares each field in data vs serverData.
	 */
	getDirtyFields(entityType: string, entityId: string): string[] {
		const snapshot = this.getEntitySnapshot(entityType, entityId)
		if (!snapshot) return []

		const data = snapshot.data as Record<string, unknown>
		const serverData = snapshot.serverData as Record<string, unknown>

		const dirtyFields: string[] = []

		for (const fieldName of Object.keys(data)) {
			// Skip id field
			if (fieldName === 'id') continue

			const currentValue = data[fieldName]
			const serverValue = serverData[fieldName]

			// Skip relation fields (objects/arrays that represent relations)
			// Relations are tracked separately via relationStates and hasManyStates
			if (this.isRelationValue(currentValue) || this.isRelationValue(serverValue)) {
				continue
			}

			if (!deepEqual(currentValue, serverValue)) {
				dirtyFields.push(fieldName)
			}
		}

		return dirtyFields
	}

	/**
	 * Checks if a value represents a relation (object with id or array of objects).
	 */
	private isRelationValue(value: unknown): boolean {
		if (value === null || value === undefined) return false

		if (Array.isArray(value)) {
			return value.length > 0 && typeof value[0] === 'object' && value[0] !== null
		}

		if (typeof value === 'object') {
			return 'id' in (value as object)
		}

		return false
	}

	/**
	 * Gets the list of dirty relations for an entity.
	 * Checks both hasOne and hasMany relations.
	 */
	getDirtyRelations(entityType: string, entityId: string): string[] {
		const keyPrefix = `${entityType}:${entityId}:`
		const dirtyRelations: string[] = []

		// Check hasOne relations
		for (const [key, state] of this.relationStates) {
			if (!key.startsWith(keyPrefix)) continue

			const fieldName = key.slice(keyPrefix.length)

			// Dirty if current differs from server, or has placeholder data
			if (
				state.currentId !== state.serverId ||
				state.state !== state.serverState ||
				Object.keys(state.placeholderData).length > 0
			) {
				dirtyRelations.push(fieldName)
			}
		}

		// Check hasMany relations
		for (const [key, state] of this.hasManyStates) {
			if (!key.startsWith(keyPrefix)) continue

			const fieldName = key.slice(keyPrefix.length)

			// Dirty if has planned removals or connections
			if (state.plannedRemovals.size > 0 || state.plannedConnections.size > 0) {
				dirtyRelations.push(fieldName)
			}
		}

		return dirtyRelations
	}

	/**
	 * Commits only specific fields of an entity.
	 * Updates serverData for the specified fields only, leaving other fields as-is.
	 */
	commitFields(entityType: string, entityId: string, fieldNames: string[]): void {
		const key = this.getEntityKey(entityType, entityId)
		const existing = this.entitySnapshots.get(key)

		if (!existing) return

		const data = existing.data as Record<string, unknown>
		const serverData = existing.serverData as Record<string, unknown>

		// Create new serverData with only specified fields updated
		const newServerData = { ...serverData }
		for (const fieldName of fieldNames) {
			if (fieldName in data) {
				newServerData[fieldName] = data[fieldName]
			}
		}

		const newSnapshot = createEntitySnapshot(
			entityId,
			entityType,
			data,
			newServerData,
			existing.version + 1,
		)

		this.entitySnapshots.set(key, newSnapshot)
		this.notifyEntitySubscribers(key)
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
		this.fieldErrors.clear()
		this.entityErrors.clear()
		this.relationErrors.clear()
		this.touchedFields.clear()
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
