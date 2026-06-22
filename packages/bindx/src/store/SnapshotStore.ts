import type { EntitySnapshot, LoadStatus } from './snapshots.js'
import { createEntitySnapshot } from './snapshots.js'
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
import { EntitySnapshotStore } from './EntitySnapshotStore.js'
import { RootRegistry } from './RootRegistry.js'
import { ReachabilityAnalyzer } from './ReachabilityAnalyzer.js'
import { RekeyOrchestrator } from './RekeyOrchestrator.js'

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
 * - EntitySnapshotStore — entity snapshot CRUD
 * - SubscriptionManager — subscription tracking and notification
 * - ErrorStore — field/entity/relation error tracking
 * - RelationStore — has-one / has-many relation state management
 * - EntityMetaStore — entity metadata, load state, persisting, temp ID mapping
 * - TouchedStore — field touched state tracking
 */
export class SnapshotStore implements SnapshotVersionBumper {
	private readonly entitySnapshots = new EntitySnapshotStore()
	private readonly subscriptions = new SubscriptionManager()
	private readonly errors = new ErrorStore()
	private readonly relations = new RelationStore()
	private readonly meta = new EntityMetaStore()
	private readonly touched = new TouchedStore()
	private readonly roots = new RootRegistry()
	private readonly reachability: ReachabilityAnalyzer
	private readonly dirtyTracker: DirtyTracker
	private readonly rekeyOrchestrator: RekeyOrchestrator

	/**
	 * Tracks the last embedded data reference propagated from parent to child.
	 * Used to detect whether the parent was re-fetched (new reference) vs. stale
	 * embedded data that should not overwrite committed child state.
	 * Keyed by "parentType:parentId:fieldName".
	 */
	private readonly lastPropagatedData = new Map<string, unknown>()

	constructor() {
		this.reachability = new ReachabilityAnalyzer(this.entitySnapshots, this.meta, this.relations, this.roots)
		this.dirtyTracker = new DirtyTracker(this.entitySnapshots, this.meta, this.relations, this.reachability)
		// The participants are visited in this exact order on every rekey — see the
		// ordering contract in RekeyOrchestrator.rekey(). Propagation tracking lives
		// on this store, so it joins as a small inline adapter.
		this.rekeyOrchestrator = new RekeyOrchestrator([
			this.roots,
			this.entitySnapshots,
			this.meta,
			this.subscriptions,
			this.relations,
			this.errors,
			this.touched,
			{ rekey: ctx => this.rekeyPropagatedData(ctx.oldKeyPrefix, ctx.newKeyPrefix) },
		])
	}

	// ==================== Key Generation ====================

	private getEntityKey(entityType: string, id: string): string {
		return this.rekeyOrchestrator.resolveKey(entityType, id)
	}

	private getRelationKey(parentType: string, parentId: string, fieldName: string): string {
		const resolvedParentId = this.resolveId(parentType, parentId)
		return `${parentType}:${resolvedParentId}:${fieldName}`
	}

	/**
	 * Resolves an ID to its persisted ID if it has been rekeyed.
	 */
	private resolveId(entityType: string, id: string): string {
		return this.rekeyOrchestrator.resolveId(entityType, id)
	}

	// ==================== SnapshotVersionBumper ====================

	bumpEntitySnapshotVersion(key: string): void {
		this.entitySnapshots.bumpVersion(key)
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

	// ==================== Embedded Data Propagation Tracking ====================

	/**
	 * Returns true if the embedded data reference differs from what was last propagated.
	 * Uses reference identity — a new reference means the parent was re-fetched.
	 */
	hasEmbeddedDataChanged(parentType: string, parentId: string, fieldName: string, currentData: unknown): boolean {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		return this.lastPropagatedData.get(key) !== currentData
	}

	/**
	 * Records the embedded data reference that was propagated to the child.
	 */
	markEmbeddedDataPropagated(parentType: string, parentId: string, fieldName: string, data: unknown): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		this.lastPropagatedData.set(key, data)
	}

	/**
	 * Removes all propagation tracking entries for a given parent entity.
	 */
	clearPropagatedDataForEntity(parentType: string, parentId: string): void {
		const prefix = `${parentType}:${this.resolveId(parentType, parentId)}:`
		for (const key of this.lastPropagatedData.keys()) {
			if (key.startsWith(prefix)) {
				this.lastPropagatedData.delete(key)
			}
		}
	}

	/**
	 * Rekeys propagation tracking entries when a temp ID is replaced by a persisted ID.
	 */
	private rekeyPropagatedData(oldPrefix: string, newPrefix: string): void {
		for (const [key, value] of this.lastPropagatedData) {
			if (key.startsWith(oldPrefix)) {
				this.lastPropagatedData.delete(key)
				this.lastPropagatedData.set(newPrefix + key.slice(oldPrefix.length), value)
			}
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
		const newSnapshot = this.entitySnapshots.setData(key, id, entityType, data, isServerData)

		if (isServerData) {
			this.meta.setExistsOnServer(key, true)
		}

		if (!skipNotify) {
			this.notifyEntitySubscribers(key)
		}

		return newSnapshot as EntitySnapshot<T>
	}

	/**
	 * Refreshes server data from a revalidation read while preserving the user's
	 * local dirty edits. See {@link EntitySnapshotStore.refreshServerData}.
	 */
	refreshServerData<T extends object>(
		entityType: string,
		id: string,
		data: T,
		skipNotify: boolean = false,
	): EntitySnapshot<T> {
		const key = this.getEntityKey(entityType, id)
		const newSnapshot = this.entitySnapshots.refreshServerData(key, id, entityType, data)
		this.meta.setExistsOnServer(key, true)
		if (!skipNotify) {
			this.notifyEntitySubscribers(key)
		}
		return newSnapshot as EntitySnapshot<T>
	}

	updateEntityFields<T extends object>(
		entityType: string,
		id: string,
		updates: Partial<T>,
	): EntitySnapshot<T> | undefined {
		const key = this.getEntityKey(entityType, id)
		const result = this.entitySnapshots.updateFields<T>(key, updates)
		if (result) {
			this.notifyEntitySubscribers(key)
		}
		return result
	}

	setFieldValue(
		entityType: string,
		id: string,
		fieldPath: string[],
		value: unknown,
	): void {
		const key = this.getEntityKey(entityType, id)
		if (this.entitySnapshots.setFieldValue(key, fieldPath, value)) {
			this.notifyEntitySubscribers(key)
		}
	}

	commitEntity(entityType: string, id: string): void {
		const key = this.getEntityKey(entityType, id)
		this.entitySnapshots.commit(key)
		this.notifyEntitySubscribers(key)
	}

	resetEntity(entityType: string, id: string): void {
		const key = this.getEntityKey(entityType, id)
		this.entitySnapshots.reset(key)
		this.notifyEntitySubscribers(key)
	}

	/**
	 * Removes a single entity and all of its own per-entity state (snapshot,
	 * metadata, root registration, errors, touched state, propagation tracking,
	 * and owned relation state).
	 *
	 * This does NOT cascade into descendants, and it does NOT strip inbound edges
	 * (other entities' has-many membership / has-one currentId that point AT the
	 * removed id). Callers must therefore only remove an entity that is unreachable
	 * — i.e. no live parent relation references it — so the graph cannot dangle. The
	 * lazy {@link sweepUnreachableCreated} guarantees this by construction; the React
	 * unmount cleanup routes through it (via {@link unregisterRootEntity} + a sweep)
	 * rather than calling removeEntity on a possibly-referenced id.
	 */
	removeEntity(entityType: string, id: string): void {
		const key = this.getEntityKey(entityType, id)
		const keyPrefix = `${key}:`

		this.entitySnapshots.remove(key)
		this.meta.remove(key)
		this.roots.unregister(key)
		this.errors.clearAllErrors(key, keyPrefix)
		this.touched.clearForEntity(keyPrefix)
		this.clearPropagatedDataForEntity(entityType, id)
		this.relations.removeOwnedRelations(keyPrefix)

		this.notifyEntitySubscribers(key)
	}

	/**
	 * Whether an entity (looked up by id alone) exists in the store and has never
	 * been persisted to the server. Used to decide relation-state semantics when a
	 * has-one target is deleted — deleting a never-persisted target reverts the
	 * relation to 'disconnected' rather than 'deleted', since there is no server
	 * row to delete.
	 */
	isNeverPersisted(entityId: string): boolean {
		const key = this.entitySnapshots.keyForId(entityId)
		if (!key) return false
		return !this.meta.existsOnServer(key)
	}

	// ==================== Load State (delegated to EntityMetaStore) ====================

	getLoadState(entityType: string, id: string): { status: LoadStatus; error?: FieldError } | undefined {
		const key = this.getEntityKey(entityType, id)
		return this.meta.getLoadState(key)
	}

	setLoadState(entityType: string, id: string, status: LoadStatus, error?: FieldError): void {
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
		// Honour a caller-provided id (e.g. a client-generated UUID used as a stable
		// primary key). Otherwise mint a temp id that is remapped to the server-assigned
		// id after persist.
		const id = (initialData?.['id'] as string | undefined) ?? generateTempId()
		const data = { ...initialData, id }

		this.setEntityData(entityType, id, data, false)
		this.setExistsOnServer(entityType, id, false)

		// A freshly created entity is pending-persist by default — a root for
		// reachability-based create detection. It stops being a root the moment a
		// relation anchors it as a child (see registerParentChild). A top-level
		// create (<Entity create>, useEntityList add) is never anchored, so it stays
		// a root and is reported as a `create`.
		this.roots.register(this.getEntityKey(entityType, id))

		return id
	}

	/**
	 * Unregisters a top-level root WITHOUT removing its snapshot. Called by the React
	 * unmount cleanup (a `<Entity create>` form / `useEntityList` draft) before a
	 * {@link sweepUnreachableCreated} pass: dropping the root lets the sweep reclaim a
	 * truly-orphaned create, while a create still anchored by another live relation
	 * stays reachable and survives. (Un-rooting also happens implicitly via
	 * {@link registerParentChild} and the rekey in {@link mapTempIdToPersistedId}.)
	 */
	unregisterRootEntity(entityType: string, id: string): void {
		this.roots.unregister(this.getEntityKey(entityType, id))
	}

	mapTempIdToPersistedId(entityType: string, tempId: string, persistedId: string): void {
		// The orchestrator owns the temp→persisted redirect and drives the rekey
		// fan-out across every sub-store in its documented order.
		this.rekeyOrchestrator.rekey(entityType, tempId, persistedId)

		// Notify on the NEW key so React picks up the change.
		this.notifyEntitySubscribers(`${entityType}:${persistedId}`)
	}

	getPersistedId(entityType: string, id: string): string | null {
		return this.rekeyOrchestrator.getPersistedId(entityType, id)
	}

	isNewEntity(entityType: string, id: string): boolean {
		return this.rekeyOrchestrator.isNewEntity(entityType, id)
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

	connectExistingToHasMany(
		parentType: string,
		parentId: string,
		fieldName: string,
		itemId: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, fieldName)
		this.relations.connectExistingToHasMany(key, itemId)
		this.notifyRelationSubscribers(key)
	}

	removeFromHasMany(
		parentType: string,
		parentId: string,
		fieldName: string,
		itemId: string,
		removalType: HasManyRemovalType,
		alias?: string,
	): void {
		const key = this.getRelationKey(parentType, parentId, alias ?? fieldName)
		// Cancelling the add of a never-persisted child just removes it from the
		// list; its now-unreachable snapshot is no longer reported as a `create` and
		// is collected by the lazy memory sweep.
		if (this.relations.removeFromHasMany(key, itemId, removalType)) {
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

	setPersisting(entityType: string, id: string, isPersisting: boolean, pessimistic: boolean = false): void {
		const key = this.getEntityKey(entityType, id)
		this.meta.setPersisting(key, isPersisting, pessimistic)
		this.notifyEntitySubscribers(key)
	}

	/**
	 * Returns the snapshot a consumer should DISPLAY for an entity.
	 *
	 * This equals the canonical {@link getEntitySnapshot} except while the entity
	 * is pessimistically in-flight, when it returns the server baseline (data ===
	 * serverData) WITHOUT mutating the store. The canonical snapshot stays dirty,
	 * so dirty tracking, mutation building, and retry are unaffected — only the
	 * presented value is the pre-persist server view.
	 *
	 * Inert until consumers route their display reads through it (see PR 4); a
	 * non-pessimistic entity is returned verbatim, so optimistic mode and the
	 * not-persisting case share this one path.
	 */
	getPresentationSnapshot<T extends object>(entityType: string, id: string): EntitySnapshot<T> | undefined {
		const snapshot = this.getEntitySnapshot<T>(entityType, id)
		if (!snapshot) return undefined

		const key = this.getEntityKey(entityType, id)
		if (!this.meta.isPessimisticInFlight(key)) {
			return snapshot
		}

		return createEntitySnapshot<T>(
			snapshot.id,
			snapshot.entityType,
			snapshot.serverData,
			snapshot.serverData,
			snapshot.version,
		)
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
		// A child anchored by a parent relation is no longer a top-level root; its
		// reachability now flows through the parent. (No-op for server children.)
		this.roots.unregister(childKey)
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
		return {
			entitySnapshots: this.entitySnapshots.exportSnapshots(keys.entityKeys),
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
		const notifiedEntityKeys = this.entitySnapshots.importSnapshots(snapshot.entitySnapshots)

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

	/**
	 * Removes the snapshots of created (never-persisted) entities that are no longer
	 * reachable from any root — the lazy memory sweep that replaces eager purge.
	 *
	 * Correctness never depends on this (unreachable creates are already excluded
	 * from getAllDirtyEntities); it only reclaims memory. Run it off the hot path,
	 * e.g. once a persist settles. Shared (diamond) children are kept because
	 * reachability reports them as live as long as any parent references them.
	 */
	sweepUnreachableCreated(): void {
		const reachable = this.reachability.computeReachableCreated()
		for (const key of [...this.entitySnapshots.keys()]) {
			if (this.meta.existsOnServer(key)) continue
			if (reachable.has(key)) continue
			const separator = key.indexOf(':')
			if (separator === -1) continue
			this.removeEntity(key.slice(0, separator), key.slice(separator + 1))
		}
	}

	getDirtyFields(entityType: string, entityId: string): string[] {
		return this.dirtyTracker.getDirtyFields(entityType, entityId)
	}

	getDirtyRelations(entityType: string, entityId: string): string[] {
		return this.dirtyTracker.getDirtyRelations(entityType, entityId)
	}

	commitFields(entityType: string, entityId: string, fieldNames: string[]): void {
		const key = this.getEntityKey(entityType, entityId)
		this.entitySnapshots.commitFields(key, fieldNames)
		this.notifyEntitySubscribers(key)
	}

	// ==================== Utility ====================

	clear(): void {
		this.entitySnapshots.clear()
		this.meta.clear()
		this.relations.clear()
		this.errors.clear()
		this.touched.clear()
		this.roots.clear()
		this.rekeyOrchestrator.clear()
		this.lastPropagatedData.clear()

		this.subscriptions.notify()
	}
}
