import { EntityRelatedHandle, embeddedDataMatchesSnapshot } from './BaseHandle.js'
import { EntityHandle } from './EntityHandle.js'
import type { ActionDispatcher } from '../core/ActionDispatcher.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import type { HasManyRemovalType } from '../store/RelationStore.js'
import type { SchemaRegistry } from '../schema/SchemaRegistry.js'
import type { SelectionMeta } from '../selection/types.js'
import {
	connectToList,
	addToList,
	removeFromList,
	moveInList,
	addRelationError,
	clearRelationErrors,
} from '../core/actions.js'
import { FIELD_REF_META, type HasManyAccessor, type FieldRefMeta, type EntityAccessor, type Unsubscribe } from './types.js'
import { createClientError, type ErrorInput, type FieldError } from '../errors/types.js'
import type {
	EventListener,
	Interceptor,
	HasManyConnectedEvent,
	HasManyDisconnectedEvent,
	HasManyConnectingEvent,
	HasManyDisconnectingEvent,
} from '../events/types.js'
import { createAliasProxy } from './proxyFactory.js'

/**
 * HasManyListHandle provides access to a has-many relation (list of entities).
 * Implements HasManyRef interface for JSX compatibility.
 *
 * @typeParam TEntity - The full entity type of items in the relation
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 */
export class HasManyListHandle<TEntity extends object = object, TSelected = TEntity> extends EntityRelatedHandle {
	// Per-item accessor cache, keyed by the item's canonical (post-rekey) id. Identity is the
	// point: a still-listed item keeps the same proxy — and with it the same handle, which the
	// proxy is the only reference to. Kept bounded by syncItemHandleCache, which drops ids
	// that have left the list.
	private itemHandleCacheProxy = new Map<string, EntityAccessor<TEntity, TSelected>>()

	/** Runtime brand symbols for validation */
	readonly __brands?: Set<symbol>

	/**
	 * Type brand - entity name for type inference.
	 * Implements HasManyRef.__entityName.
	 */
	get __entityName(): string {
		return this.itemType
	}

	/**
	 * Type brand - schema for type inference.
	 * Returns undefined at runtime; schema type is compile-time only.
	 */
	get __schema(): undefined {
		return undefined
	}

	/**
	 * Alias for this has-many relation.
	 * When the same field is used multiple times with different params,
	 * each instance has a unique alias to store data separately.
	 */
	private readonly alias: string

	private constructor(
		parentEntityType: string,
		parentEntityId: string,
		private readonly fieldName: string,
		private readonly itemType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		private readonly schema: SchemaRegistry,
		brands?: Set<symbol>,
		alias?: string,
		private readonly selection?: SelectionMeta,
		// Segments from the query root down to this relation. Items do NOT inherit it:
		// a has-many restarts the chain, mirroring the collector proxy.
		private readonly relationPath: readonly string[] = [fieldName],
	) {
		super(parentEntityType, parentEntityId, store, dispatcher)
		this.__brands = brands
		this.alias = alias ?? fieldName
	}

	static create<TEntity extends object = object, TSelected = TEntity>(
		parentEntityType: string,
		parentEntityId: string,
		fieldName: string,
		itemType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		schema: SchemaRegistry,
		brands?: Set<symbol>,
		alias?: string,
		selection?: SelectionMeta,
		relationPath?: readonly string[],
	): HasManyAccessor<TEntity, TSelected> {
		return createAliasProxy<HasManyListHandle<TEntity, TSelected>, HasManyAccessor<TEntity, TSelected>>(
			HasManyListHandle.createRaw<TEntity, TSelected>(parentEntityType, parentEntityId, fieldName, itemType, store, dispatcher, schema, brands, alias, selection, relationPath),
		)
	}

	/**
	 * Creates the handle without the alias proxy. Mirrors {@link EntityHandle.createRaw}:
	 * the class surface (e.g. {@link itemHandleCacheSize}) is not part of HasManyAccessor.
	 */
	static createRaw<TEntity extends object = object, TSelected = TEntity>(
		parentEntityType: string,
		parentEntityId: string,
		fieldName: string,
		itemType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		schema: SchemaRegistry,
		brands?: Set<symbol>,
		alias?: string,
		selection?: SelectionMeta,
		relationPath?: readonly string[],
	): HasManyListHandle<TEntity, TSelected> {
		return new HasManyListHandle<TEntity, TSelected>(parentEntityType, parentEntityId, fieldName, itemType, store, dispatcher, schema, brands, alias, selection, relationPath)
	}

	/**
	 * JSX field reference metadata for collection phase.
	 * Implements HasManyRef interface.
	 */
	get [FIELD_REF_META](): FieldRefMeta {
		return {
			entityType: this.entityType,
			entityId: this.entityId,
			path: [this.fieldName],
			fieldName: this.fieldName,
			isArray: true,
			isRelation: true,
			targetType: this.itemType,
			fullPath: this.relationPath,
		}
	}

	/**
	 * Gets the list of items as entity accessors with direct field access.
	 * Returns selection-aware EntityAccessors that support `item.fieldName.value`.
	 * Includes planned connections and excludes planned removals.
	 * Uses ordered IDs to preserve order including after move() operations.
	 *
	 * This is also where the item-accessor cache is pruned — see {@link syncItemHandleCache}.
	 */
	get items(): EntityAccessor<TEntity, TSelected>[] {
		this.materializeEmbeddedItems()

		// Use ordered IDs from store (handles removals, connections, and ordering)
		const orderedIds = this.store.getPresentationHasManyOrderedIds(
			this.entityType,
			this.entityId,
			this.fieldName,
			this.alias,
		)

		this.syncItemHandleCache(orderedIds)

		return orderedIds.map((id) => this.getItemHandle(id))
	}

	/**
	 * Canonical cache key for an item id: a temp id follows its temp→persisted rekey, so a
	 * lookup by the now-dead temp id reuses the persisted item's handle instead of minting a
	 * duplicate for the same entity.
	 */
	private resolveItemKey(itemId: string): string {
		return this.store.resolveEntityId(this.itemType, itemId)
	}

	/**
	 * Drops cached item accessors for ids that have left the list. Without it the cache keeps an
	 * accessor for every id the relation has ever shown, for as long as the parent handle lives
	 * — a paginated / filtered / refetched has-many grows without bound.
	 *
	 * Runs before the accessors are resolved and never touches a live id, so an item that is
	 * still listed keeps the exact same proxy and the exact same handle behind it.
	 */
	private syncItemHandleCache(liveIds: readonly string[]): void {
		if (this.itemHandleCacheProxy.size === 0) return
		this.canonicalizeItemHandleCache()

		// While the parent persists, the presented list hides planned additions — pruning
		// against it would drop handles that reappear as soon as the persist settles.
		if (this.store.isPersisting(this.entityType, this.entityId)) return

		const liveKeys = new Set(liveIds.map(id => this.resolveItemKey(id)))
		for (const key of this.itemHandleCacheProxy.keys()) {
			if (liveKeys.has(key)) continue
			this.itemHandleCacheProxy.delete(key)
		}
	}

	private canonicalizeItemHandleCache(): void {
		for (const [key, proxy] of [...this.itemHandleCacheProxy]) {
			const canonicalKey = this.resolveItemKey(key)
			if (canonicalKey === key) continue
			if (!this.itemHandleCacheProxy.has(canonicalKey)) {
				this.itemHandleCacheProxy.set(canonicalKey, proxy)
			}
			this.itemHandleCacheProxy.delete(key)
		}
	}

	/**
	 * @internal Occupancy of the item-accessor cache. Exposed only so eviction tests can
	 * assert the cache stays bounded; not part of the HasManyAccessor API.
	 */
	get itemHandleCacheSize(): number {
		return this.itemHandleCacheProxy.size
	}

	/**
	 * Propagates the parent's embedded has-many data into per-item snapshots and
	 * ensures the has-many state exists in the store.
	 *
	 * Materialisation must NOT be a side effect of iterating `items` only: the
	 * block editor (and any consumer) resolves a single child via getById()
	 * without ever reading `items`, and that path must also see populated data.
	 * Idempotent within a render — guarded by hasEmbeddedDataChanged.
	 *
	 * For the same reason EVERY entry point that reads or writes the has-many state
	 * calls this first — isDirty and the mutators as well as items/getById. An
	 * embedded list has no state in the store until it is materialised, so a
	 * consumer that never iterated saw isDirty === false and had its mutation land
	 * on a state nobody reads. Keep new entry points on this guard.
	 *
	 * @returns false when there is no embedded list data to materialise.
	 */
	private materializeEmbeddedItems(): boolean {
		const data = this.getEntityData()
		if (!data) return false

		const rawData = data[this.alias] ?? data[this.fieldName]
		const listData = this.extractItems(rawData)
		if (!listData) return false

		const fieldKey = this.alias ?? this.fieldName

		// Only propagate embedded data when the parent's reference changed (re-fetch).
		// Same reference means the embedded data is stale and must not overwrite
		// child state that may have been updated by a local commit.
		if (this.store.hasEmbeddedDataChanged(this.entityType, this.entityId, fieldKey, rawData)) {
			this.ensureItemSnapshots(listData)

			const serverIds = listData
				.map((item) => item['id'] as string | undefined)
				.filter((id): id is string => id !== undefined)

			this.store.getOrCreateHasMany(
				this.entityType,
				this.entityId,
				this.fieldName,
				serverIds,
				this.alias,
			)
			this.store.markEmbeddedDataPropagated(this.entityType, this.entityId, fieldKey, rawData)
		} else {
			// Ensure has-many state exists (without updating serverIds)
			this.store.getOrCreateHasMany(
				this.entityType,
				this.entityId,
				this.fieldName,
				undefined,
				this.alias,
			)
		}

		return true
	}

	/**
	 * Ensures snapshots exist for embedded has-many items.
	 * Only called when parent's embedded data has changed (re-fetch detected).
	 */
	private ensureItemSnapshots(listData: Array<Record<string, unknown>>): void {
		for (const itemData of listData) {
			const itemId = itemData['id'] as string
			if (!itemId) continue

			// Register parent-child relationship for change propagation
			// This needs to happen even if the snapshot already exists
			this.store.registerParentChild(this.entityType, this.entityId, this.itemType, itemId)

			// Optimization: skip if item data matches existing snapshot
			const existing = this.store.getEntitySnapshot(this.itemType, itemId)
			if (existing?.serverData && embeddedDataMatchesSnapshot(itemData, existing.serverData as Record<string, unknown>)) {
				continue
			}

			// Create or update snapshot from embedded data.
			// Use refreshServerData (not setEntityData) so a re-fetch advances the
			// item's server baseline without clobbering the user's local dirty edits
			// on the item. Skip notification to avoid triggering React state updates
			// during render.
			this.store.refreshServerData(
				this.itemType,
				itemId,
				itemData,
				true, // skipNotify - called during render, data already exists embedded in parent
			)
		}
	}

	/**
	 * Extracts items from either flat array or Connection format (paginateRelation).
	 * Returns null if data is not in a recognized format.
	 */
	private extractItems(rawData: unknown): Array<Record<string, unknown>> | null {
		// Flat array format: [{ id, name }, ...]
		if (Array.isArray(rawData)) {
			return rawData
		}
		// Connection format: { pageInfo: { totalCount }, edges: [{ node: { id, name } }] }
		if (rawData && typeof rawData === 'object' && 'edges' in rawData) {
			const connection = rawData as { edges: Array<{ node: Record<string, unknown> }> }
			return connection.edges.map(edge => edge.node)
		}
		// Object with numeric keys (store may convert arrays to objects): { "0": {...}, "1": {...}, ...metadata }
		if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
			const obj = rawData as Record<string, unknown>
			const items: Array<Record<string, unknown>> = []
			for (const [key, value] of Object.entries(obj)) {
				if (/^\d+$/.test(key) && value && typeof value === 'object' && 'id' in (value as object)) {
					items.push(value as Record<string, unknown>)
				}
			}
			if (items.length > 0) {
				return items
			}
		}
		return null
	}

	/**
	 * Gets the total count from paginateRelation response.
	 * Content client attaches totalCount as a non-enumerable property on the array.
	 * Returns undefined if totalCount was not requested or not available.
	 */
	get totalCount(): number | undefined {
		const data = this.getEntityData()
		if (!data) return undefined

		const rawData = data[this.alias] ?? data[this.fieldName]
		if (Array.isArray(rawData) && 'totalCount' in rawData) {
			return (rawData as Array<unknown> & { totalCount: number }).totalCount
		}
		return undefined
	}

	/**
	 * Gets the number of items.
	 */
	get length(): number {
		return this.items.length
	}

	/**
	 * Gets a handle for a specific item.
	 * Returns selection-aware EntityAccessor that supports direct field access.
	 */
	getItemHandle(itemId: string): EntityAccessor<TEntity, TSelected> {
		this.canonicalizeItemHandleCache()
		const key = this.resolveItemKey(itemId)
		let proxy = this.itemHandleCacheProxy.get(key)

		if (!proxy) {
			const raw = EntityHandle.createRaw<TEntity, TSelected>(
				key,
				this.itemType,
				this.store,
				this.dispatcher,
				this.schema,
				this.__brands,
				this.selection,
			)
			proxy = EntityHandle.wrapProxy(raw)
			this.itemHandleCacheProxy.set(key, proxy)
		}

		return proxy
	}

	/**
	 * Gets an item handle by entity ID.
	 * Works for both server entities and newly created entities (via add()).
	 * Returns an EntityAccessor with direct field access.
	 */
	getById(id: string): EntityAccessor<TEntity, TSelected> {
		// Ensure embedded child data is propagated into the item snapshot even when
		// the caller never iterates `items` (e.g. the block editor resolves each
		// referenced entity by id). Without this the returned handle reads null.
		this.materializeEmbeddedItems()
		return this.getItemHandle(id)
	}

	/**
	 * Checks if the list is dirty (items added/removed/moved/connected/disconnected).
	 */
	get isDirty(): boolean {
		this.materializeEmbeddedItems()

		const state = this.store.getHasMany(
			this.entityType,
			this.entityId,
			this.fieldName,
			this.alias,
		)

		if (!state) return false

		return (
			state.plannedRemovals.size > 0 ||
			state.plannedAdditions.size > 0 ||
			state.orderedIds !== null
		)
	}

	/**
	 * Maps over items.
	 * Implements HasManyRef interface - returns selection-aware entity accessors with direct field access.
	 */
	map<R>(fn: (item: EntityAccessor<TEntity, TSelected>, index: number) => R): R[] {
		return this.items.map((handle, index) => fn(handle, index))
	}

	/**
	 * Connects an existing entity to this has-many relation.
	 */
	connect(itemId: string): void {
		this.materializeEmbeddedItems()
		this.dispatcher.dispatch(
			connectToList(this.entityType, this.entityId, this.fieldName, itemId, this.itemType, this.alias),
		)
	}

	/**
	 * Disconnects an entity from this has-many relation.
	 * Sets the FK to null — only works when the FK column is nullable.
	 * For created entities (via add()), cancels the add operation.
	 */
	disconnect(itemId: string): void {
		this.materializeEmbeddedItems()
		this.dispatcher.dispatch(
			removeFromList(this.entityType, this.entityId, this.fieldName, itemId, 'disconnect', this.alias),
		)
	}

	/**
	 * Deletes an entity from this has-many relation.
	 * Removes the entity itself from the database.
	 * For created entities (via add()), cancels the add operation.
	 */
	delete(itemId: string): void {
		this.materializeEmbeddedItems()
		this.dispatcher.dispatch(
			removeFromList(this.entityType, this.entityId, this.fieldName, itemId, 'delete', this.alias),
		)
	}

	/**
	 * Adds a new item to the list by creating a new entity.
	 * Returns the ID of the newly created entity (temp ID).
	 * For connecting existing entities, use connect() instead.
	 */
	add(data?: Partial<TEntity>): string {
		this.materializeEmbeddedItems()

		// One gesture = one undo entry: the pre-create and the list-add are journaled
		// together so undo removes (and redo re-creates) the whole row.
		return this.store.transaction(() => {
			// Pre-create entity so we can return tempId
			const tempId = this.store.createEntity(this.itemType, data as Record<string, unknown>)

			// Add to has-many relation through dispatcher (enables events/interceptors)
			this.dispatcher.dispatch(
				addToList(this.entityType, this.entityId, this.fieldName, this.itemType, tempId, this.alias),
			)

			return tempId
		})
	}

	/**
	 * Removes an item from the list by ID.
	 * For newly created entities (via add()), cancels the add operation.
	 * For existing server entities, auto-detects removal strategy from schema:
	 * - manyHasMany → disconnect (removes the junction record)
	 * - oneHasMany + nullable FK → disconnect (sets FK to null)
	 * - oneHasMany + non-nullable FK → delete (child can't exist without parent)
	 * Falls back to disconnect when schema metadata is not available.
	 */
	remove(itemId: string): void {
		this.materializeEmbeddedItems()
		this.dispatcher.dispatch(
			removeFromList(this.entityType, this.entityId, this.fieldName, itemId, this.resolveRemovalType(), this.alias),
		)
	}

	/**
	 * Resolves the default removal type for this has-many relation based on schema metadata.
	 * - manyHasMany → disconnect (removes junction record, target entity stays)
	 * - oneHasMany + nullable FK → disconnect (sets FK to null, child entity stays)
	 * - oneHasMany + non-nullable FK → delete (child can't exist without parent)
	 * - unknown → disconnect (safe fallback)
	 */
	private resolveRemovalType(): HasManyRemovalType {
		const relationKind = this.schema.getHasManyRelationKind(this.entityType, this.fieldName)
		if (relationKind === 'oneHasMany') {
			const nullable = this.schema.getRelationNullable(this.entityType, this.fieldName)
			if (nullable === true) {
				return 'disconnect'
			}
			return 'delete'
		}
		return 'disconnect'
	}

	/**
	 * Moves an item from one position to another within the list.
	 * Note: This only affects client-side order. For persistent ordering,
	 * use an 'order' field on the entity.
	 */
	move(fromIndex: number, toIndex: number): void {
		this.materializeEmbeddedItems()
		this.dispatcher.dispatch(
			moveInList(this.entityType, this.entityId, this.fieldName, fromIndex, toIndex, this.alias),
		)
	}

	/**
	 * Resets the has-many relation to server state.
	 * Clears all planned connections and removals.
	 */
	reset(): void {
		this.materializeEmbeddedItems()
		this.store.resetHasMany(
			this.entityType,
			this.entityId,
			this.fieldName,
			this.alias,
		)
	}

	/**
	 * Type brand - ensures HasManyRef<Author> is not assignable to HasManyRef<Tag>.
	 * This is a phantom property that only exists in the type system.
	 */
	get __entityType(): TEntity {
		return undefined as unknown as TEntity
	}

	/**
	 * Gets the list of errors on this relation.
	 */
	get errors(): readonly FieldError[] {
		return this.store.getRelationErrors(this.entityType, this.entityId, this.fieldName)
	}

	/**
	 * Checks if this relation has any errors.
	 */
	get hasError(): boolean {
		return this.errors.length > 0
	}

	/**
	 * Adds a client-side error to this relation.
	 */
	addError(error: ErrorInput): void {
		this.dispatcher.dispatch(
			addRelationError(this.entityType, this.entityId, this.fieldName, createClientError(error)),
		)
	}

	/**
	 * Clears all errors from this relation.
	 */
	clearErrors(): void {
		this.dispatcher.dispatch(
			clearRelationErrors(this.entityType, this.entityId, this.fieldName),
		)
	}

	// ==================== Event Subscriptions ====================

	/**
	 * Subscribe to item connected events.
	 */
	onItemConnected(listener: EventListener<HasManyConnectedEvent>): Unsubscribe {
		const emitter = this.dispatcher.getEventEmitter()
		return emitter.onField(
			'hasMany:connected',
			this.entityType,
			this.entityId,
			this.fieldName,
			listener,
		)
	}

	/**
	 * Subscribe to item disconnected events.
	 */
	onItemDisconnected(listener: EventListener<HasManyDisconnectedEvent>): Unsubscribe {
		const emitter = this.dispatcher.getEventEmitter()
		return emitter.onField(
			'hasMany:disconnected',
			this.entityType,
			this.entityId,
			this.fieldName,
			listener,
		)
	}

	/**
	 * Intercept item connection (can cancel).
	 */
	interceptItemConnecting(interceptor: Interceptor<HasManyConnectingEvent>): Unsubscribe {
		const emitter = this.dispatcher.getEventEmitter()
		return emitter.interceptField(
			'hasMany:connecting',
			this.entityType,
			this.entityId,
			this.fieldName,
			interceptor,
		)
	}

	/**
	 * Intercept item disconnection (can cancel).
	 */
	interceptItemDisconnecting(interceptor: Interceptor<HasManyDisconnectingEvent>): Unsubscribe {
		const emitter = this.dispatcher.getEventEmitter()
		return emitter.interceptField(
			'hasMany:disconnecting',
			this.entityType,
			this.entityId,
			this.fieldName,
			interceptor,
		)
	}

}
