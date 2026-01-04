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
 * Relation state stored in SnapshotStore
 */
interface StoredRelationState {
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

	/** Relation states keyed by "parentType:parentId:fieldName" */
	private readonly relationStates = new Map<string, StoredRelationState>()

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
	 */
	setEntityData<T extends object>(
		entityType: string,
		id: string,
		data: T,
		isServerData: boolean = false,
	): EntitySnapshot<T> {
		const key = this.getEntityKey(entityType, id)
		const existing = this.entitySnapshots.get(key)

		const serverData = isServerData
			? data
			: (existing?.serverData as T) ?? data

		const newSnapshot = createEntitySnapshot(
			id,
			entityType,
			data,
			serverData,
			(existing?.version ?? 0) + 1,
		)

		this.entitySnapshots.set(key, newSnapshot)
		this.notifyEntitySubscribers(key)

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
	 */
	setRelation(
		parentType: string,
		parentId: string,
		fieldName: string,
		updates: Partial<Omit<StoredRelationState, 'version'>>,
	): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		const existing = this.relationStates.get(key)

		if (!existing) return

		this.relationStates.set(key, {
			...existing,
			...updates,
			version: existing.version + 1,
		})

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

	// ==================== Notification ====================

	private notifyEntitySubscribers(key: string): void {
		this.globalVersion++

		// Notify entity-specific subscribers
		const entitySubs = this.entitySubscribers.get(key)
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

	private notifyRelationSubscribers(key: string): void {
		this.globalVersion++

		// Notify relation-specific subscribers
		const relationSubs = this.relationSubscribers.get(key)
		if (relationSubs) {
			for (const sub of relationSubs) {
				sub()
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
		this.relationStates.clear()
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
