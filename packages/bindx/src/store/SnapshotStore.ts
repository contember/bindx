import {
	createEntitySnapshot,
	type EntitySnapshot,
	type LoadStatus,
} from './snapshots.js'
import type { FieldError } from '../errors/types.js'
import { SubscriptionManager, type SnapshotVersionBumper } from './SubscriptionManager.js'
import { ErrorStore } from './ErrorStore.js'
import {
	RelationStore,
	type HasManyRemovalType,
	type StoredHasManyState,
	type StoredRelationState,
} from './RelationStore.js'
import { EntityMetaStore, type EntityMeta } from './EntityMetaStore.js'
import { TouchedStore } from './TouchedStore.js'
import { generateTempId } from './entityId.js'
import { DirtyTracker } from './DirtyTracker.js'

export type { HasManyRemovalType, StoredHasManyState, StoredRelationState } from './RelationStore.js'
export type { EntityMeta } from './EntityMetaStore.js'
export { isTempId, isPlaceholderId, isPersistedId, generatePlaceholderId } from './entityId.js'

type Subscriber = () => void

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
 * - EntityMetaStore — entity metadata, load state, persisting, temp ID mapping
 * - TouchedStore — field touched state tracking
 */
export class SnapshotStore implements SnapshotVersionBumper {
	/** Entity snapshots keyed by "entityType:id" */
	private readonly entitySnapshots = new Map<string, EntitySnapshot>()

	private readonly subscriptions = new SubscriptionManager()
	private readonly errors = new ErrorStore()
	private readonly relations = new RelationStore()
	private readonly meta = new EntityMetaStore()
	private readonly touched = new TouchedStore()
	private readonly dirtyTracker = new DirtyTracker(this.entitySnapshots, this.meta, this.relations)

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

	getEntitySnapshot<T extends object>(entityType: string, id: string): EntitySnapshot<T> | undefined {
		const key = this.getEntityKey(entityType, id)
		return this.entitySnapshots.get(key) as EntitySnapshot<T> | undefined
	}

	hasEntity(entityType: string, id: string): boolean {
		const key = this.getEntityKey(entityType, id)
		return this.entitySnapshots.has(key)
	}

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
			this.meta.setExistsOnServer(key, true)
		}

		if (!skipNotify) {
			this.notifyEntitySubscribers(key)
		}

		return newSnapshot
	}

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

	removeEntity(entityType: string, id: string): void {
		const key = this.getEntityKey(entityType, id)
		this.entitySnapshots.delete(key)
		this.meta.clearLoadState(key)
		this.notifyEntitySubscribers(key)
	}

	// ==================== Load State (delegated to EntityMetaStore) ====================

	getLoadState(entityType: string, id: string): { status: LoadStatus; error?: Error } | undefined {
		const key = this.getEntityKey(entityType, id)
		return this.meta.getLoadState(key)
	}

	setLoadState(entityType: string, id: string, status: LoadStatus, error?: Error): void {
		const key = this.getEntityKey(entityType, id)
		this.meta.setLoadState(key, status, error)
		this.notifyEntitySubscribers(key)
	}

	// ==================== Entity Meta (delegated to EntityMetaStore) ====================

	getEntityMeta(entityType: string, id: string): EntityMeta | undefined {
		const key = this.getEntityKey(entityType, id)
		return this.meta.getEntityMeta(key)
	}

	setExistsOnServer(entityType: string, id: string, existsOnServer: boolean): void {
		const key = this.getEntityKey(entityType, id)
		this.meta.setExistsOnServer(key, existsOnServer)
		this.notifyEntitySubscribers(key)
	}

	existsOnServer(entityType: string, id: string): boolean {
		const key = this.getEntityKey(entityType, id)
		return this.meta.existsOnServer(key)
	}

	scheduleForDeletion(entityType: string, id: string): void {
		const key = this.getEntityKey(entityType, id)
		this.meta.scheduleForDeletion(key)
		this.notifyEntitySubscribers(key)
	}

	unscheduleForDeletion(entityType: string, id: string): void {
		const key = this.getEntityKey(entityType, id)
		this.meta.unscheduleForDeletion(key)
		this.notifyEntitySubscribers(key)
	}

	isScheduledForDeletion(entityType: string, id: string): boolean {
		const key = this.getEntityKey(entityType, id)
		return this.meta.isScheduledForDeletion(key)
	}

	// ==================== Create Mode (Temp ID Management) ====================

	createEntity(entityType: string, initialData?: Record<string, unknown>): string {
		const tempId = generateTempId()
		const data = { id: tempId, ...initialData }

		this.setEntityData(entityType, tempId, data, false)
		this.setExistsOnServer(entityType, tempId, false)

		return tempId
	}

	mapTempIdToPersistedId(entityType: string, tempId: string, persistedId: string): void {
		const key = this.getEntityKey(entityType, tempId)
		this.meta.mapTempIdToPersistedId(key, persistedId)
		this.notifyEntitySubscribers(key)
	}

	getPersistedId(entityType: string, id: string): string | null {
		const key = this.getEntityKey(entityType, id)
		return this.meta.getPersistedId(key, id)
	}

	isNewEntity(entityType: string, id: string): boolean {
		const key = this.getEntityKey(entityType, id)
		return this.meta.isNewEntity(key, id)
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

	// ==================== Persisting State (delegated to EntityMetaStore) ====================

	isPersisting(entityType: string, id: string): boolean {
		const key = this.getEntityKey(entityType, id)
		return this.meta.isPersisting(key)
	}

	setPersisting(entityType: string, id: string, isPersisting: boolean): void {
		const key = this.getEntityKey(entityType, id)
		this.meta.setPersisting(key, isPersisting)
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

	// ==================== Touched State (delegated to TouchedStore) ====================

	isFieldTouched(entityType: string, id: string, fieldName: string): boolean {
		const key = this.getRelationKey(entityType, id, fieldName)
		return this.touched.isFieldTouched(key)
	}

	setFieldTouched(entityType: string, id: string, fieldName: string, touched: boolean): void {
		const key = this.getRelationKey(entityType, id, fieldName)
		if (this.touched.setFieldTouched(key, touched)) {
			this.notifyEntitySubscribers(this.getEntityKey(entityType, id))
		}
	}

	clearEntityTouchedState(entityType: string, id: string): void {
		const keyPrefix = `${entityType}:${id}:`
		this.touched.clearForEntity(keyPrefix)
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

		for (const key of keys.entityKeys) {
			const snapshot = this.entitySnapshots.get(key)
			if (snapshot) {
				entitySnapshots.set(key, snapshot)
			}
		}

		return {
			entitySnapshots,
			relationStates: this.relations.exportRelationStates(keys.relationKeys),
			hasManyStates: this.relations.exportHasManyStates(keys.hasManyKeys),
			entityMetas: this.meta.exportMetas(keys.entityKeys),
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

		this.meta.importMetas(snapshot.entityMetas)

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

	// ==================== Dirty Tracking (delegated to DirtyTracker) ====================

	getAllDirtyEntities(): Array<{
		entityType: string
		entityId: string
		changeType: 'create' | 'update' | 'delete'
	}> {
		return this.dirtyTracker.getAllDirtyEntities()
	}

	getDirtyFields(entityType: string, entityId: string): string[] {
		return this.dirtyTracker.getDirtyFields(entityType, entityId)
	}

	getDirtyRelations(entityType: string, entityId: string): string[] {
		return this.dirtyTracker.getDirtyRelations(entityType, entityId)
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
		this.meta.clear()
		this.relations.clear()
		this.errors.clear()
		this.touched.clear()

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

