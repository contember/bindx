import {
	createEntitySnapshot,
	type EntitySnapshot,
	type LoadStatus,
} from './snapshots.js'
import type { FieldError } from '../errors/types.js'
import { deepEqual } from '../utils/deepEqual.js'
import { SubscriptionManager, type SnapshotVersionBumper } from './SubscriptionManager.js'
import { ErrorStore } from './ErrorStore.js'
import {
	RelationStore,
	type HasManyRemovalType,
	type StoredHasManyState,
	type StoredRelationState,
} from './RelationStore.js'
import type { HasOneRelationState } from '../handles/types.js'

export type { HasManyRemovalType, StoredHasManyState, StoredRelationState } from './RelationStore.js'

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
 *
 * Composed of:
 * - SubscriptionManager — subscription tracking and notification
 * - ErrorStore — field/entity/relation error tracking
 * - RelationStore — has-one / has-many relation state management
 */
export class SnapshotStore implements SnapshotVersionBumper {
	/** Entity snapshots keyed by "entityType:id" */
	private readonly entitySnapshots = new Map<string, EntitySnapshot>()

	/** Load states keyed by "entityType:id" */
	private readonly loadStates = new Map<string, EntityLoadState>()

	/** Entity metadata keyed by "entityType:id" */
	private readonly entityMetas = new Map<string, EntityMeta>()

	/** Persisting status keyed by "entityType:id" */
	private readonly persistingEntities = new Set<string>()

	/** Touched state keyed by "entityType:id:fieldName" */
	private readonly touchedFields = new Map<string, boolean>()

	/** Mapping from temp ID to persisted ID (keyed by "entityType:tempId") */
	private readonly tempToPersistedId = new Map<string, string>()

	private readonly subscriptions = new SubscriptionManager()
	private readonly errors = new ErrorStore()
	private readonly relations = new RelationStore()

	// ==================== Key Generation ====================

	private getEntityKey(entityType: string, id: string): string {
		return `${entityType}:${id}`
	}

	private getRelationKey(parentType: string, parentId: string, fieldName: string): string {
		return `${parentType}:${parentId}:${fieldName}`
	}

	// ==================== SnapshotVersionBumper ====================

	bumpEntitySnapshotVersion(key: string): void {
		const existing = this.entitySnapshots.get(key)
		if (existing) {
			const newSnapshot = createEntitySnapshot(
				existing.id,
				existing.entityType,
				existing.data,
				existing.serverData,
				existing.version + 1,
			)
			this.entitySnapshots.set(key, newSnapshot)
		}
	}

	// ==================== Notification Helpers ====================

	private notifyEntitySubscribers(key: string): void {
		this.subscriptions.notifyEntitySubscribers(key, this)
	}

	private notifyRelationSubscribers(relationKey: string): void {
		const parts = relationKey.split(':')
		if (parts.length >= 2) {
			const entityKey = `${parts[0]}:${parts[1]}`
			this.subscriptions.notifyRelationSubscribers(relationKey, entityKey, this)
		}
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
			existing.data,
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
			existing.serverData,
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
	 */
	createEntity(entityType: string, initialData?: Record<string, unknown>): string {
		const tempId = `__temp_${crypto.randomUUID()}`
		const data = { id: tempId, ...initialData }

		this.setEntityData(entityType, tempId, data, false)
		this.setExistsOnServer(entityType, tempId, false)

		return tempId
	}

	/**
	 * Maps a temporary ID to its persisted (server-assigned) ID after successful creation.
	 */
	mapTempIdToPersistedId(entityType: string, tempId: string, persistedId: string): void {
		const key = this.getEntityKey(entityType, tempId)
		this.tempToPersistedId.set(key, persistedId)
		this.setExistsOnServer(entityType, tempId, true)
		this.notifyEntitySubscribers(key)
	}

	/**
	 * Gets the persisted ID for an entity.
	 */
	getPersistedId(entityType: string, id: string): string | null {
		if (isPlaceholderId(id)) return null
		if (isPersistedId(id)) return id

		const key = this.getEntityKey(entityType, id)
		return this.tempToPersistedId.get(key) ?? null
	}

	/**
	 * Checks if an entity is new (created locally, not yet persisted to server).
	 */
	isNewEntity(entityType: string, id: string): boolean {
		if (isPlaceholderId(id)) return true
		if (isPersistedId(id)) return false

		const key = this.getEntityKey(entityType, id)
		return !this.tempToPersistedId.has(key)
	}

	// ==================== Has-Many State (delegated to RelationStore) ====================

	getOrCreateHasMany(
		parentType: string,
		parentId: string,
		fieldName: string,
		serverIds?: string[],
		alias?: string,
	): StoredHasManyState {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		return this.relations.getOrCreateHasMany(key, serverIds)
	}

	getHasMany(
		parentType: string,
		parentId: string,
		fieldName: string,
		alias?: string,
	): StoredHasManyState | undefined {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		return this.relations.getHasMany(key)
	}

	setHasManyServerIds(
		parentType: string,
		parentId: string,
		fieldName: string,
		serverIds: string[],
		alias?: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		this.relations.setHasManyServerIds(key, serverIds)
		this.notifyRelationSubscribers(key)
	}

	planHasManyRemoval(
		parentType: string,
		parentId: string,
		fieldName: string,
		itemId: string,
		type: HasManyRemovalType,
		alias?: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		this.relations.planHasManyRemoval(key, itemId, type)
		this.notifyRelationSubscribers(key)
	}

	cancelHasManyRemoval(
		parentType: string,
		parentId: string,
		fieldName: string,
		itemId: string,
		alias?: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		this.relations.cancelHasManyRemoval(key, itemId)
		this.notifyRelationSubscribers(key)
	}

	getHasManyPlannedRemovals(
		parentType: string,
		parentId: string,
		fieldName: string,
		alias?: string,
	): Map<string, HasManyRemovalType> | undefined {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		return this.relations.getHasMany(key)?.plannedRemovals
	}

	planHasManyConnection(
		parentType: string,
		parentId: string,
		fieldName: string,
		itemId: string,
		alias?: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		this.relations.planHasManyConnection(key, itemId)
		this.notifyRelationSubscribers(key)
	}

	cancelHasManyConnection(
		parentType: string,
		parentId: string,
		fieldName: string,
		itemId: string,
		alias?: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		this.relations.cancelHasManyConnection(key, itemId)
		this.notifyRelationSubscribers(key)
	}

	getHasManyPlannedConnections(
		parentType: string,
		parentId: string,
		fieldName: string,
		alias?: string,
	): Set<string> | undefined {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		return this.relations.getHasMany(key)?.plannedConnections
	}

	commitHasMany(
		parentType: string,
		parentId: string,
		fieldName: string,
		newServerIds: string[],
		alias?: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		this.relations.commitHasMany(key, newServerIds)
		this.notifyRelationSubscribers(key)
	}

	resetHasMany(
		parentType: string,
		parentId: string,
		fieldName: string,
		alias?: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		this.relations.resetHasMany(key)
		this.notifyRelationSubscribers(key)
	}

	addToHasMany(
		parentType: string,
		parentId: string,
		fieldName: string,
		itemId: string,
		alias?: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		this.relations.addToHasMany(key, itemId)
		this.notifyRelationSubscribers(key)
	}

	removeFromHasMany(
		parentType: string,
		parentId: string,
		fieldName: string,
		itemId: string,
		alias?: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		const result = this.relations.removeFromHasMany(key, itemId)
		if (result === 'planned_removal') {
			// planHasManyRemoval already called internally, just notify
			this.notifyRelationSubscribers(key)
		} else if (result === 'cancelled_connection') {
			this.notifyRelationSubscribers(key)
		}
	}

	moveInHasMany(
		parentType: string,
		parentId: string,
		fieldName: string,
		fromIndex: number,
		toIndex: number,
		alias?: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		this.relations.moveInHasMany(key, fromIndex, toIndex)
		this.notifyRelationSubscribers(key)
	}

	getHasManyOrderedIds(
		parentType: string,
		parentId: string,
		fieldName: string,
		alias?: string,
	): string[] {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		return this.relations.getHasManyOrderedIds(key)
	}

	isHasManyItemCreated(
		parentType: string,
		parentId: string,
		fieldName: string,
		itemId: string,
		alias?: string,
	): boolean {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		const state = this.relations.getHasMany(key)
		return state?.createdEntities.has(itemId) ?? false
	}

	getHasManyCreatedEntities(
		parentType: string,
		parentId: string,
		fieldName: string,
		alias?: string,
	): Set<string> | undefined {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		return this.relations.getHasMany(key)?.createdEntities
	}

	// ==================== Persisting State ====================

	isPersisting(entityType: string, id: string): boolean {
		const key = this.getEntityKey(entityType, id)
		return this.persistingEntities.has(key)
	}

	setPersisting(entityType: string, id: string, isPersisting: boolean): void {
		const key = this.getEntityKey(entityType, id)
		if (isPersisting) {
			this.persistingEntities.add(key)
		} else {
			this.persistingEntities.delete(key)
		}
		this.notifyEntitySubscribers(key)
	}

	// ==================== Error State (delegated to ErrorStore) ====================

	getFieldErrors(entityType: string, id: string, fieldName: string): readonly FieldError[] {
		const key = this.getRelationKey(entityType, id, fieldName)
		return this.errors.getFieldErrors(key)
	}

	addFieldError(entityType: string, id: string, fieldName: string, error: FieldError): void {
		const key = this.getRelationKey(entityType, id, fieldName)
		this.errors.addFieldError(key, error)
		this.notifyEntitySubscribers(this.getEntityKey(entityType, id))
	}

	clearFieldErrors(
		entityType: string,
		id: string,
		fieldName: string,
		source?: 'client' | 'server',
	): void {
		const key = this.getRelationKey(entityType, id, fieldName)
		this.errors.clearFieldErrors(key, source)
		this.notifyEntitySubscribers(this.getEntityKey(entityType, id))
	}

	clearNonStickyFieldErrors(entityType: string, id: string, fieldName: string): void {
		const key = this.getRelationKey(entityType, id, fieldName)
		if (this.errors.clearNonStickyFieldErrors(key)) {
			this.notifyEntitySubscribers(this.getEntityKey(entityType, id))
		}
	}

	getEntityErrors(entityType: string, id: string): readonly FieldError[] {
		const key = this.getEntityKey(entityType, id)
		return this.errors.getEntityErrors(key)
	}

	addEntityError(entityType: string, id: string, error: FieldError): void {
		const key = this.getEntityKey(entityType, id)
		this.errors.addEntityError(key, error)
		this.notifyEntitySubscribers(key)
	}

	clearEntityErrors(entityType: string, id: string, source?: 'client' | 'server'): void {
		const key = this.getEntityKey(entityType, id)
		this.errors.clearEntityErrors(key, source)
		this.notifyEntitySubscribers(key)
	}

	getRelationErrors(entityType: string, id: string, relationName: string): readonly FieldError[] {
		const key = this.getRelationKey(entityType, id, relationName)
		return this.errors.getRelationErrors(key)
	}

	addRelationError(entityType: string, id: string, relationName: string, error: FieldError): void {
		const key = this.getRelationKey(entityType, id, relationName)
		this.errors.addRelationError(key, error)
		this.notifyRelationSubscribers(key)
	}

	clearRelationErrors(
		entityType: string,
		id: string,
		relationName: string,
		source?: 'client' | 'server',
	): void {
		const key = this.getRelationKey(entityType, id, relationName)
		this.errors.clearRelationErrors(key, source)
		this.notifyRelationSubscribers(key)
	}

	clearAllServerErrors(entityType: string, id: string): void {
		const entityKey = this.getEntityKey(entityType, id)
		const keyPrefix = `${entityType}:${id}:`
		this.errors.clearAllServerErrors(entityKey, keyPrefix)
	}

	clearAllErrors(entityType: string, id: string): void {
		const entityKey = this.getEntityKey(entityType, id)
		const keyPrefix = `${entityType}:${id}:`
		this.errors.clearAllErrors(entityKey, keyPrefix)
		this.notifyEntitySubscribers(entityKey)
	}

	hasClientErrors(entityType: string, id: string): boolean {
		const entityKey = this.getEntityKey(entityType, id)
		const keyPrefix = `${entityType}:${id}:`
		return this.errors.hasClientErrors(entityKey, keyPrefix)
	}

	hasAnyErrors(entityType: string, id: string): boolean {
		const entityKey = this.getEntityKey(entityType, id)
		const keyPrefix = `${entityType}:${id}:`
		return this.errors.hasAnyErrors(entityKey, keyPrefix)
	}

	// ==================== Touched State ====================

	isFieldTouched(entityType: string, id: string, fieldName: string): boolean {
		const key = this.getRelationKey(entityType, id, fieldName)
		return this.touchedFields.get(key) ?? false
	}

	setFieldTouched(entityType: string, id: string, fieldName: string, touched: boolean): void {
		const key = this.getRelationKey(entityType, id, fieldName)
		const current = this.touchedFields.get(key) ?? false
		if (current === touched) return

		this.touchedFields.set(key, touched)
		this.notifyEntitySubscribers(this.getEntityKey(entityType, id))
	}

	clearEntityTouchedState(entityType: string, id: string): void {
		const keyPrefix = `${entityType}:${id}:`

		for (const key of [...this.touchedFields.keys()]) {
			if (key.startsWith(keyPrefix)) {
				this.touchedFields.delete(key)
			}
		}

		this.notifyEntitySubscribers(this.getEntityKey(entityType, id))
	}

	// ==================== Relation State (delegated to RelationStore) ====================

	getOrCreateRelation(
		parentType: string,
		parentId: string,
		fieldName: string,
		initial: Omit<StoredRelationState, 'version'>,
	): StoredRelationState {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		return this.relations.getOrCreateRelation(key, initial)
	}

	getRelation(
		parentType: string,
		parentId: string,
		fieldName: string,
	): StoredRelationState | undefined {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		return this.relations.getRelation(key)
	}

	setRelation(
		parentType: string,
		parentId: string,
		fieldName: string,
		updates: Partial<Omit<StoredRelationState, 'version'>>,
	): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		const entityKey = this.getEntityKey(parentType, parentId)
		const entitySnapshot = this.entitySnapshots.get(entityKey)
		this.relations.setRelation(key, updates, entitySnapshot, fieldName)
		this.notifyRelationSubscribers(key)
	}

	commitRelation(parentType: string, parentId: string, fieldName: string): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		this.relations.commitRelation(key)
		this.notifyRelationSubscribers(key)
	}

	resetRelation(parentType: string, parentId: string, fieldName: string): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		this.relations.resetRelation(key)
		this.notifyRelationSubscribers(key)
	}

	commitAllRelations(entityType: string, entityId: string): void {
		const keyPrefix = `${entityType}:${entityId}:`
		this.relations.commitAllRelations(keyPrefix)
	}

	resetAllRelations(entityType: string, entityId: string): void {
		const keyPrefix = `${entityType}:${entityId}:`
		this.relations.resetAllRelations(keyPrefix)
	}

	getAllRelationsForEntity(entityType: string, entityId: string): Map<string, StoredRelationState> {
		const keyPrefix = `${entityType}:${entityId}:`
		return this.relations.getAllRelationsForEntity(keyPrefix)
	}

	getAllHasManyForEntity(entityType: string, entityId: string): Map<string, StoredHasManyState> {
		const keyPrefix = `${entityType}:${entityId}:`
		return this.relations.getAllHasManyForEntity(keyPrefix)
	}

	restoreHasManyState(
		parentType: string,
		parentId: string,
		fieldName: string,
		state: StoredHasManyState,
		alias?: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		this.relations.restoreHasManyState(key, state)
		this.notifyRelationSubscribers(key)
	}

	// ==================== Subscriptions (delegated to SubscriptionManager) ====================

	subscribeToEntity(entityType: string, id: string, callback: Subscriber): () => void {
		const key = this.getEntityKey(entityType, id)
		return this.subscriptions.subscribeToEntity(key, callback)
	}

	subscribeToRelation(
		parentType: string,
		parentId: string,
		fieldName: string,
		callback: Subscriber,
	): () => void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		return this.subscriptions.subscribeToRelation(key, callback)
	}

	subscribe(callback: Subscriber): () => void {
		return this.subscriptions.subscribe(callback)
	}

	getVersion(): number {
		return this.subscriptions.getVersion()
	}

	notify(): void {
		this.subscriptions.notify()
	}

	// ==================== Parent-Child Relationships ====================

	registerParentChild(parentType: string, parentId: string, childType: string, childId: string): void {
		const parentKey = this.getEntityKey(parentType, parentId)
		const childKey = this.getEntityKey(childType, childId)
		this.subscriptions.registerParentChild(parentKey, childKey)
	}

	unregisterParentChild(parentType: string, parentId: string, childType: string, childId: string): void {
		const parentKey = this.getEntityKey(parentType, parentId)
		const childKey = this.getEntityKey(childType, childId)
		this.subscriptions.unregisterParentChild(parentKey, childKey)
	}

	// ==================== Partial Snapshot Export/Import ====================

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
		const entityMetas = new Map<string, EntityMeta>()

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

		return {
			entitySnapshots,
			relationStates: this.relations.exportRelationStates(keys.relationKeys),
			hasManyStates: this.relations.exportHasManyStates(keys.hasManyKeys),
			entityMetas,
		}
	}

	importPartialSnapshot(snapshot: {
		entitySnapshots: Map<string, EntitySnapshot>
		relationStates: Map<string, StoredRelationState>
		hasManyStates: Map<string, StoredHasManyState>
		entityMetas: Map<string, EntityMeta>
	}): void {
		const notifiedEntityKeys = new Set<string>()

		for (const [key, entitySnapshot] of snapshot.entitySnapshots) {
			this.entitySnapshots.set(key, entitySnapshot)
			notifiedEntityKeys.add(key)
		}

		for (const [key, meta] of snapshot.entityMetas) {
			this.entityMetas.set(key, { ...meta })
		}

		const relationKeys = this.relations.importRelationStates(snapshot.relationStates)
		const hasManyKeys = this.relations.importHasManyStates(snapshot.hasManyStates)
		const notifiedRelationKeys = new Set([...relationKeys, ...hasManyKeys])

		this.subscriptions.notifyGlobal()

		for (const key of notifiedEntityKeys) {
			this.subscriptions.notifyEntityDirect(key)
		}

		for (const key of notifiedRelationKeys) {
			this.subscriptions.notifyRelationDirect(key)
		}
	}

	// ==================== Dirty Tracking ====================

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

		for (const [key] of this.entitySnapshots) {
			const [entityType, ...idParts] = key.split(':')
			const entityId = idParts.join(':')

			if (!entityType || !entityId) continue

			if (this.isScheduledForDeletion(entityType, entityId)) {
				if (this.existsOnServer(entityType, entityId)) {
					dirtyEntities.push({ entityType, entityId, changeType: 'delete' })
				}
				continue
			}

			if (!this.existsOnServer(entityType, entityId)) {
				dirtyEntities.push({ entityType, entityId, changeType: 'create' })
				continue
			}

			if (this.isEntityDirty(entityType, entityId)) {
				dirtyEntities.push({ entityType, entityId, changeType: 'update' })
			}
		}

		return dirtyEntities
	}

	private isEntityDirty(entityType: string, entityId: string): boolean {
		const dirtyFields = this.getDirtyFields(entityType, entityId)
		if (dirtyFields.length > 0) return true

		const keyPrefix = `${entityType}:${entityId}:`
		const dirtyRelations = this.relations.getDirtyRelations(keyPrefix)
		if (dirtyRelations.length > 0) return true

		return false
	}

	getDirtyFields(entityType: string, entityId: string): string[] {
		const snapshot = this.getEntitySnapshot(entityType, entityId)
		if (!snapshot) return []

		const data = snapshot.data as Record<string, unknown>
		const serverData = snapshot.serverData as Record<string, unknown>

		const dirtyFields: string[] = []

		for (const fieldName of Object.keys(data)) {
			if (fieldName === 'id') continue

			const currentValue = data[fieldName]
			const serverValue = serverData[fieldName]

			if (isRelationValue(currentValue) || isRelationValue(serverValue)) {
				continue
			}

			if (!deepEqual(currentValue, serverValue)) {
				dirtyFields.push(fieldName)
			}
		}

		return dirtyFields
	}

	getDirtyRelations(entityType: string, entityId: string): string[] {
		const keyPrefix = `${entityType}:${entityId}:`
		return this.relations.getDirtyRelations(keyPrefix)
	}

	commitFields(entityType: string, entityId: string, fieldNames: string[]): void {
		const key = this.getEntityKey(entityType, entityId)
		const existing = this.entitySnapshots.get(key)

		if (!existing) return

		const data = existing.data as Record<string, unknown>
		const serverData = existing.serverData as Record<string, unknown>

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

	clear(): void {
		this.entitySnapshots.clear()
		this.loadStates.clear()
		this.entityMetas.clear()
		this.relations.clear()
		this.persistingEntities.clear()
		this.errors.clear()
		this.touchedFields.clear()

		this.subscriptions.notify()
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

/**
 * Checks if a value represents a relation (object with id or array of objects).
 */
function isRelationValue(value: unknown): boolean {
	if (value === null || value === undefined) return false

	if (Array.isArray(value)) {
		return value.length > 0 && typeof value[0] === 'object' && value[0] !== null
	}

	if (typeof value === 'object') {
		return 'id' in (value as object)
	}

	return false
}
