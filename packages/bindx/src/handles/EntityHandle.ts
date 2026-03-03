import { EntityRelatedHandle } from './BaseHandle.js'
import { FieldHandle } from './FieldHandle.js'
import type { ActionDispatcher } from '../core/ActionDispatcher.js'
import { type SnapshotStore, generatePlaceholderId } from '../store/SnapshotStore.js'
import type { SchemaRegistry } from '../schema/SchemaRegistry.js'
import type { EntitySnapshot } from '../store/snapshots.js'
import {
	resetEntity,
	commitEntity,
	connectRelation,
	disconnectRelation,
	deleteRelation,
	addEntityError,
	clearEntityErrors,
	clearAllErrors as clearAllErrorsAction,
	addRelationError,
	clearRelationErrors,
} from '../core/actions.js'
import { FIELD_REF_META, type HasOneRef, type HasManyRef, type FieldRefMeta, type EntityRef, type EntityFields, type SelectedEntityFields, type Unsubscribe, type EntityAccessor, type HasOneAccessor } from './types.js'
import { deepEqual } from '../utils/deepEqual.js'
import { createClientError, type ErrorInput, type FieldError } from '../errors/types.js'
import type {
	EventTypeMap,
	AfterEventTypes,
	BeforeEventTypes,
	EventListener,
	Interceptor,
	EntityPersistedEvent,
	EntityPersistingEvent,
	RelationConnectedEvent,
	RelationDisconnectedEvent,
	RelationConnectingEvent,
	RelationDisconnectingEvent,
	HasManyConnectedEvent,
	HasManyDisconnectedEvent,
	HasManyConnectingEvent,
	HasManyDisconnectingEvent,
} from '../events/types.js'
import { createHandleProxy, createAliasProxy, ENTITY_HANDLE_PROPERTIES, HAS_ONE_HANDLE_PROPERTIES } from './proxyFactory.js'

// Type for relation handle cache
type RelationHandle = HasOneHandle<object> | HasManyListHandle<object>

/**
 * EntityHandle provides stable access to an entity.
 * Implements EntityRef interface for consistent usage across the system.
 *
 * Supports direct field access for shorter chains:
 * - `entity.fieldName` is equivalent to `entity.$fields.fieldName`
 * - Handle properties use $ prefix to avoid collision with field names: `$id`, `$data`, `$isDirty`, etc.
 *
 * Key characteristics:
 * - Stable identity (same instance across renders when id doesn't change)
 * - Provides field handles for individual fields
 * - Provides relation handles for has-one and has-many relations
 * - Tracks dirty state across all fields
 *
 * @typeParam T - The full entity type
 * @typeParam TSelected - The selected subset of fields (defaults to T for backwards compatibility)
 */
export class EntityHandle<T extends object = object, TSelected = T> extends EntityRelatedHandle implements EntityRef<T, TSelected> {
	/** Cache for field handles to ensure stable identity */
	private readonly fieldHandleCache = new Map<string, FieldHandle<unknown>>()

	/** Cache for relation handles */
	private readonly relationHandleCache = new Map<string, RelationHandle>()

	/** Runtime brand symbols for validation */
	readonly __brands?: Set<symbol>

	/** Type brand for schema - placeholder at runtime */
	declare readonly __schema: Record<string, object>

	// $ aliases - handled by proxy at runtime, declared for TypeScript
	declare readonly $fields: SelectedEntityFields<T, TSelected>
	declare readonly $data: TSelected | null
	declare readonly $isDirty: boolean
	declare readonly $persistedId: string | null
	declare readonly $isNew: boolean
	declare readonly $errors: readonly FieldError[]
	declare readonly $hasError: boolean
	declare $addError: (error: ErrorInput) => void
	declare $clearErrors: () => void
	declare $clearAllErrors: () => void
	declare $on: <E extends AfterEventTypes>(eventType: E, listener: EventListener<EventTypeMap[E]>) => Unsubscribe
	declare $intercept: <E extends BeforeEventTypes>(eventType: E, interceptor: Interceptor<EventTypeMap[E]>) => Unsubscribe
	declare $onPersisted: (listener: EventListener<EntityPersistedEvent>) => Unsubscribe
	declare $interceptPersisting: (interceptor: Interceptor<EntityPersistingEvent>) => Unsubscribe

	constructor(
		id: string,
		entityType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		private readonly schema: SchemaRegistry,
		brands?: Set<symbol>,
	) {
		super(entityType, id, store, dispatcher)
		this.__brands = brands

		// Return a Proxy that supports direct field access
		// eslint-disable-next-line no-constructor-return
		return createHandleProxy(this, {
			knownProperties: ENTITY_HANDLE_PROPERTIES,
			getFields: (target) => target.fields,
		}) as EntityHandle<T, TSelected>
	}

	/**
	 * Gets the entity ID.
	 */
	get id(): string {
		return this.entityId
	}

	/**
	 * Gets the entity type.
	 */
	get type(): string {
		return this.entityType
	}

	/**
	 * Gets the current entity snapshot.
	 */
	getSnapshot(): EntitySnapshot<T> | undefined {
		return this.store.getEntitySnapshot<T>(this.entityType, this.entityId)
	}

	/**
	 * Gets the current entity data.
	 * Returns selected fields subset as specified by TSelected type parameter.
	 */
	get data(): TSelected | null {
		const snapshot = this.getSnapshot()
		return (snapshot?.data ?? null) as TSelected | null
	}

	/**
	 * Gets the server data.
	 */
	get serverData(): T | undefined {
		const snapshot = this.getSnapshot()
		return snapshot?.serverData
	}

	/**
	 * Checks if the entity has been loaded.
	 */
	get isLoaded(): boolean {
		return this.getSnapshot() !== undefined
	}

	/**
	 * Checks if the entity is currently loading.
	 */
	get isLoading(): boolean {
		const loadState = this.store.getLoadState(this.entityType, this.entityId)
		return loadState?.status === 'loading'
	}

	/**
	 * Checks if there was an error loading the entity.
	 */
	get isError(): boolean {
		const loadState = this.store.getLoadState(this.entityType, this.entityId)
		return loadState?.status === 'error'
	}

	/**
	 * Gets the loading error if any.
	 */
	get error(): Error | undefined {
		const loadState = this.store.getLoadState(this.entityType, this.entityId)
		return loadState?.error
	}

	/**
	 * Checks if the entity is currently being persisted.
	 */
	get isPersisting(): boolean {
		return this.store.isPersisting(this.entityType, this.entityId)
	}

	/**
	 * Checks if any field on the entity has been modified.
	 * This includes scalar field changes and relation changes (hasOne, hasMany).
	 */
	get isDirty(): boolean {
		const snapshot = this.getSnapshot()
		if (!snapshot) return false

		// Check scalar field changes
		if (!deepEqual(snapshot.data, snapshot.serverData)) {
			return true
		}

		// Check if any relation is dirty
		const relationFields = this.schema.getRelationFields(this.entityType)
		for (const fieldName of relationFields) {
			const relationType = this.schema.getRelationType(this.entityType, fieldName)

			if (relationType === 'hasOne') {
				const handle = this.hasOne(fieldName)
				// Use $isDirty since isDirty is not in HAS_ONE_HANDLE_PROPERTIES
				if (handle.$isDirty) {
					return true
				}
			} else if (relationType === 'hasMany') {
				const handle = this.hasMany(fieldName)
				if (handle.isDirty) {
					return true
				}
			}
		}

		return false
	}

	/**
	 * Gets the persisted ID (server-assigned ID after create).
	 * Returns the ID itself if it's already a real ID, null if it's a temp ID without mapping.
	 */
	get persistedId(): string | null {
		return this.store.getPersistedId(this.entityType, this.entityId)
	}

	/**
	 * Checks if this entity is new (created locally, not yet persisted to server).
	 */
	get isNew(): boolean {
		return this.store.isNewEntity(this.entityType, this.entityId)
	}

	/**
	 * Gets a field handle for a specific field.
	 * Returns cached handle to ensure stable identity.
	 */
	field<K extends keyof T>(fieldName: K): FieldHandle<T[K]> {
		const cacheKey = String(fieldName)
		const cached = this.fieldHandleCache.get(cacheKey)

		if (cached) {
			return cached as FieldHandle<T[K]>
		}

		const handle = new FieldHandle<T[K]>(
			this.entityType,
			this.entityId,
			[cacheKey],
			this.store,
			this.dispatcher,
		)
		this.fieldHandleCache.set(cacheKey, handle as FieldHandle<unknown>)

		return handle
	}

	/**
	 * Gets a has-one relation handle.
	 */
	hasOne<TRelated extends object>(fieldName: string): HasOneHandle<TRelated> {
		const cacheKey = `hasOne:${fieldName}`
		const cached = this.relationHandleCache.get(cacheKey)

		if (cached) {
			return cached as HasOneHandle<TRelated>
		}

		const targetType = this.schema.getRelationTarget(this.entityType, fieldName)
		if (!targetType) {
			throw new Error(
				`Field "${fieldName}" is not a relation on entity "${this.entityType}"`,
			)
		}

		const handle = new HasOneHandle<TRelated>(
			this.entityType,
			this.entityId,
			fieldName,
			targetType,
			this.store,
			this.dispatcher,
			this.schema,
		)
		this.relationHandleCache.set(cacheKey, handle as RelationHandle)

		return handle
	}

	/**
	 * Gets a has-many relation handle.
	 *
	 * @param alias - Optional alias for the relation. When the same field is used multiple times
	 *                with different parameters (filter, orderBy, limit), each needs a unique alias.
	 */
	hasMany<TItem extends object>(fieldName: string, alias?: string): HasManyListHandle<TItem> {
		const effectiveAlias = alias ?? fieldName
		const cacheKey = `hasMany:${effectiveAlias}`
		const cached = this.relationHandleCache.get(cacheKey)

		if (cached) {
			return cached as HasManyListHandle<TItem>
		}

		const targetType = this.schema.getRelationTarget(this.entityType, fieldName)
		if (!targetType) {
			throw new Error(
				`Field "${fieldName}" is not a relation on entity "${this.entityType}"`,
			)
		}

		const handle = new HasManyListHandle<TItem>(
			this.entityType,
			this.entityId,
			fieldName,
			targetType,
			this.store,
			this.dispatcher,
			this.schema,
			this.__brands,
			effectiveAlias,
		)
		this.relationHandleCache.set(cacheKey, handle as RelationHandle)

		return handle
	}

	/**
	 * Resets the entity to server data.
	 * Also resets all relation states (hasOne, hasMany).
	 */
	reset(): void {
		this.assertNotDisposed()
		this.dispatcher.dispatch(resetEntity(this.entityType, this.entityId))

		// Reset all cached relation handles
		for (const handle of this.relationHandleCache.values()) {
			handle.reset()
		}
	}

	/**
	 * Commits changes (serverData = data).
	 */
	commit(): void {
		this.assertNotDisposed()
		this.dispatcher.dispatch(commitEntity(this.entityType, this.entityId))
	}

	/**
	 * Disposes the handle and all cached child handles.
	 */
	override dispose(): void {
		super.dispose()

		for (const handle of this.fieldHandleCache.values()) {
			handle.dispose()
		}
		this.fieldHandleCache.clear()

		for (const handle of this.relationHandleCache.values()) {
			handle.dispose()
		}
		this.relationHandleCache.clear()
	}

	/**
	 * Creates a proxy for field access.
	 * Returns appropriate handle type based on schema field definition:
	 * - Scalar fields -> FieldHandle
	 * - HasOne relations -> HasOneHandle
	 * - HasMany relations -> HasManyListHandle
	 *
	 * Implements EntityRef.fields - returns selection-aware field accessors.
	 */
	get fields(): SelectedEntityFields<T, TSelected> {
		return new Proxy({} as SelectedEntityFields<T, TSelected>, {
			get: (_, fieldName: string) => {
				// Use schema to determine field type
				const fieldDef = this.schema.getFieldDef(this.entityType, fieldName)

				if (!fieldDef || fieldDef.type === 'scalar') {
					// Scalar field - return FieldHandle
					return this.field(fieldName as keyof T)
				}

				if (fieldDef.type === 'hasOne') {
					// Has-one relation - return HasOneHandle
					return this.hasOne(fieldName)
				}

				if (fieldDef.type === 'hasMany') {
					// Has-many relation - return HasManyListHandle
					return this.hasMany(fieldName)
				}

				// Unknown field type - fallback to FieldHandle
				return this.field(fieldName as keyof T)
			},
		})
	}

	/**
	 * Type brand - ensures EntityRef<Author> is not assignable to EntityRef<Tag>.
	 * This is a phantom property that only exists in the type system.
	 * Implements EntityRef.__entityType.
	 */
	get __entityType(): T {
		return undefined as unknown as T
	}

	/**
	 * Entity name for role-based type inference.
	 * Carries the entity type name (e.g., 'Article', 'Author').
	 * Implements EntityRef.__entityName.
	 */
	get __entityName(): string {
		return this.entityType
	}

	/**
	 * Available roles for HasRole constraint.
	 * Default implementation returns empty array (no role constraints).
	 * Role-aware code should create EntityRef with specific roles.
	 */
	get __availableRoles(): readonly string[] {
		return []
	}

	/**
	 * Gets the list of entity-level errors (not including field or relation errors).
	 */
	get errors(): readonly FieldError[] {
		return this.store.getEntityErrors(this.entityType, this.entityId)
	}

	/**
	 * Checks if this entity has any errors (entity-level, fields, or relations).
	 */
	get hasError(): boolean {
		return this.store.hasAnyErrors(this.entityType, this.entityId)
	}

	/**
	 * Adds a client-side error to this entity.
	 */
	addError(error: ErrorInput): void {
		this.assertNotDisposed()
		this.dispatcher.dispatch(
			addEntityError(this.entityType, this.entityId, createClientError(error)),
		)
	}

	/**
	 * Clears entity-level errors.
	 */
	clearErrors(): void {
		this.assertNotDisposed()
		this.dispatcher.dispatch(
			clearEntityErrors(this.entityType, this.entityId),
		)
	}

	/**
	 * Clears all errors (entity-level, fields, and relations).
	 */
	clearAllErrors(): void {
		this.assertNotDisposed()
		this.dispatcher.dispatch(
			clearAllErrorsAction(this.entityType, this.entityId),
		)
	}

	// ==================== Dirty Tracking ====================

	/**
	 * Gets the list of dirty scalar fields.
	 */
	getDirtyFields(): readonly string[] {
		return this.store.getDirtyFields(this.entityType, this.entityId)
	}

	/**
	 * Gets the list of dirty relations.
	 */
	getDirtyRelations(): readonly string[] {
		return this.store.getDirtyRelations(this.entityType, this.entityId)
	}

	// ==================== Event Subscriptions ====================

	/**
	 * Subscribe to any event on this entity.
	 */
	on<E extends AfterEventTypes>(
		eventType: E,
		listener: EventListener<EventTypeMap[E]>,
	): Unsubscribe {
		const emitter = this.dispatcher.getEventEmitter()
		return emitter.onEntity(eventType, this.entityType, this.entityId, listener)
	}

	/**
	 * Intercept any before event on this entity.
	 */
	intercept<E extends BeforeEventTypes>(
		eventType: E,
		interceptor: Interceptor<EventTypeMap[E]>,
	): Unsubscribe {
		const emitter = this.dispatcher.getEventEmitter()
		return emitter.interceptEntity(eventType, this.entityType, this.entityId, interceptor)
	}

	/**
	 * Subscribe to persist success events.
	 */
	onPersisted(listener: EventListener<EntityPersistedEvent>): Unsubscribe {
		return this.on('entity:persisted', listener)
	}

	/**
	 * Intercept persist (can cancel).
	 */
	interceptPersisting(interceptor: Interceptor<EntityPersistingEvent>): Unsubscribe {
		return this.intercept('entity:persisting', interceptor)
	}

}


/**
 * HasOneHandle provides access to a has-one relation.
 * Implements HasOneRef interface for JSX compatibility.
 *
 * @typeParam TEntity - The full entity type of the related entity
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 */
export class HasOneHandle<TEntity extends object = object, TSelected = TEntity> extends EntityRelatedHandle implements HasOneRef<TEntity, TSelected> {
	private entityHandleCache: EntityHandle<TEntity, TSelected> | null = null
	private placeholderCache: PlaceholderHandle<TEntity, TSelected> | null = null

	/** Runtime brand symbols for validation */
	readonly __brands?: Set<symbol>

	/** Type brand for schema - placeholder at runtime */
	declare readonly __schema: Record<string, object>

	// $ aliases - handled by proxy at runtime, declared for TypeScript
	declare readonly $id: string
	declare readonly $isDirty: boolean
	declare readonly $state: 'connected' | 'disconnected' | 'deleted' | 'creating'
	declare readonly $fields: SelectedEntityFields<TEntity, TSelected>
	declare readonly $entity: EntityAccessor<TEntity, TSelected>
	declare readonly $errors: readonly FieldError[]
	declare readonly $hasError: boolean
	declare $connect: (id: string) => void
	declare $disconnect: () => void
	declare $delete: () => void
	declare $reset: () => void
	declare $addError: (error: ErrorInput) => void
	declare $clearErrors: () => void
	declare $onConnect: (listener: EventListener<RelationConnectedEvent>) => Unsubscribe
	declare $onDisconnect: (listener: EventListener<RelationDisconnectedEvent>) => Unsubscribe
	declare $interceptConnect: (interceptor: Interceptor<RelationConnectingEvent>) => Unsubscribe
	declare $interceptDisconnect: (interceptor: Interceptor<RelationDisconnectingEvent>) => Unsubscribe

	constructor(
		parentEntityType: string,
		parentEntityId: string,
		private readonly fieldName: string,
		private readonly targetType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		private readonly schema: SchemaRegistry,
		brands?: Set<symbol>,
	) {
		super(parentEntityType, parentEntityId, store, dispatcher)
		this.__brands = brands

		// Return a Proxy that supports direct field access
		// eslint-disable-next-line no-constructor-return
		return createHandleProxy(this, {
			knownProperties: HAS_ONE_HANDLE_PROPERTIES,
			getFields: (target) => target.entity.$fields,
		}) as HasOneHandle<TEntity, TSelected>
	}

	/**
	 * JSX field reference metadata for collection phase.
	 * Implements HasOneRef interface.
	 */
	get [FIELD_REF_META](): FieldRefMeta {
		return {
			entityType: this.entityType,
			entityId: this.entityId,
			path: [this.fieldName],
			fieldName: this.fieldName,
			isArray: false,
			isRelation: true,
		}
	}

	/**
	 * Subscribe to relation changes.
	 */
	override subscribe(callback: () => void): () => void {
		// Subscribe to both parent entity and relation state
		const unsub1 = this.store.subscribeToEntity(this.entityType, this.entityId, callback)
		const unsub2 = this.store.subscribeToRelation(
			this.entityType,
			this.entityId,
			this.fieldName,
			callback,
		)

		return () => {
			unsub1()
			unsub2()
		}
	}

	/**
	 * Gets the relation state.
	 */
	get state(): 'connected' | 'disconnected' | 'deleted' | 'creating' {
		const relation = this.store.getRelation(
			this.entityType,
			this.entityId,
			this.fieldName,
		)
		return relation?.state ?? 'disconnected'
	}

	/**
	 * Gets the current related entity ID.
	 * Falls back to entity data if relation state is not initialized.
	 */
	get relatedId(): string | null {
		// First check relation state (for manual changes like connect/disconnect)
		const relation = this.store.getRelation(
			this.entityType,
			this.entityId,
			this.fieldName,
		)
		if (relation) {
			return relation.currentId
		}

		// Fallback to entity snapshot data (for server-loaded data)
		const parentSnapshot = this.store.getEntitySnapshot(this.entityType, this.entityId)
		if (parentSnapshot?.data) {
			const relatedData = (parentSnapshot.data as Record<string, unknown>)[this.fieldName]
			if (relatedData && typeof relatedData === 'object' && 'id' in relatedData) {
				return (relatedData as { id: string }).id
			}
		}

		return null
	}

	/**
	 * Gets the related entity ID.
	 * Returns the actual ID if connected, or placeholder ID if disconnected.
	 * Implements HasOneRef interface.
	 */
	get id(): string {
		return this.entity.id
	}

	/**
	 * Gets the nested entity fields.
	 * Implements HasOneRef interface.
	 * Delegates to the entity (either real EntityHandle or PlaceholderHandle).
	 */
	get fields(): SelectedEntityFields<TEntity, TSelected> {
		return this.entity.$fields
	}

	/**
	 * Gets the related entity accessor with direct field access.
	 * Implements HasOneRef.$entity - returns EntityAccessor for the related entity.
	 * Returns PlaceholderHandle (with placeholder ID) if the relation is disconnected.
	 */
	get entity(): EntityAccessor<TEntity, TSelected> {
		const id = this.relatedId

		if (id) {
			// Ensure the related entity has a snapshot in the store
			// (it may be embedded in the parent entity's data)
			this.ensureRelatedEntitySnapshot(id)

			// Connected - return real entity handle
			if (!this.entityHandleCache || this.entityHandleCache.id !== id) {
				this.entityHandleCache = new EntityHandle<TEntity, TSelected>(
					id,
					this.targetType,
					this.store,
					this.dispatcher,
					this.schema,
					this.__brands,
				)
			}
			// EntityHandle constructor returns a Proxy that implements EntityAccessor
			return this.entityHandleCache as unknown as EntityAccessor<TEntity, TSelected>
		}

		// Disconnected - return placeholder handle
		if (!this.placeholderCache) {
			this.placeholderCache = new PlaceholderHandle<TEntity, TSelected>(
				this.entityType,
				this.entityId,
				this.fieldName,
				this.targetType,
				this.store,
				this.dispatcher,
				this.__brands,
			)
		}
		// PlaceholderHandle implements EntityRef but for API consistency return as EntityAccessor
		return this.placeholderCache as unknown as EntityAccessor<TEntity, TSelected>
	}

	/**
	 * Ensures the related entity has a snapshot in the store.
	 * If the related entity is embedded in the parent's data (not yet normalized),
	 * creates a snapshot from the embedded data.
	 */
	private ensureRelatedEntitySnapshot(id: string): void {
		// Register parent-child relationship for change propagation
		// This needs to happen even if the snapshot already exists
		this.store.registerParentChild(this.entityType, this.entityId, this.targetType, id)

		// Check if snapshot already exists
		if (this.store.hasEntity(this.targetType, id)) {
			return
		}

		// Get embedded data from parent entity
		const parentSnapshot = this.store.getEntitySnapshot(this.entityType, this.entityId)
		if (!parentSnapshot?.data) {
			return
		}

		const embeddedData = (parentSnapshot.data as Record<string, unknown>)[this.fieldName]
		if (!embeddedData || typeof embeddedData !== 'object') {
			return
		}

		// Create snapshot from embedded data
		// Skip notification to avoid triggering React state updates during render
		this.store.setEntityData(
			this.targetType,
			id,
			embeddedData as Record<string, unknown>,
			true, // isServerData
			true, // skipNotify - called during render, data already exists embedded in parent
		)
	}

	/**
	 * Checks if the relation is dirty.
	 */
	get isDirty(): boolean {
		const relation = this.store.getRelation(
			this.entityType,
			this.entityId,
			this.fieldName,
		)
		if (!relation) return false

		return (
			relation.currentId !== relation.serverId ||
			relation.state !== relation.serverState ||
			Object.keys(relation.placeholderData).length > 0
		)
	}

	/**
	 * Connects the relation to an entity.
	 */
	connect(targetId: string): void {
		this.assertNotDisposed()
		this.dispatcher.dispatch(
			connectRelation(this.entityType, this.entityId, this.fieldName, targetId),
		)
	}

	/**
	 * Disconnects the relation.
	 */
	disconnect(): void {
		this.assertNotDisposed()
		this.dispatcher.dispatch(
			disconnectRelation(this.entityType, this.entityId, this.fieldName),
		)
	}

	/**
	 * Marks the relation for deletion.
	 */
	delete(): void {
		this.assertNotDisposed()
		this.dispatcher.dispatch(
			deleteRelation(this.entityType, this.entityId, this.fieldName),
		)
	}

	/**
	 * Resets the relation to server state.
	 */
	reset(): void {
		this.assertNotDisposed()
		this.store.resetRelation(this.entityType, this.entityId, this.fieldName)
	}

	/**
	 * Disposes the handle.
	 */
	override dispose(): void {
		super.dispose()
		this.entityHandleCache?.dispose()
		this.entityHandleCache = null
	}

	/**
	 * Type brand - ensures HasOneRef<Author> is not assignable to HasOneRef<Tag>.
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
		this.assertNotDisposed()
		this.dispatcher.dispatch(
			addRelationError(this.entityType, this.entityId, this.fieldName, createClientError(error)),
		)
	}

	/**
	 * Clears all errors from this relation.
	 */
	clearErrors(): void {
		this.assertNotDisposed()
		this.dispatcher.dispatch(
			clearRelationErrors(this.entityType, this.entityId, this.fieldName),
		)
	}

	// ==================== Event Subscriptions ====================

	/**
	 * Subscribe to connection events.
	 */
	onConnect(listener: EventListener<RelationConnectedEvent>): Unsubscribe {
		const emitter = this.dispatcher.getEventEmitter()
		return emitter.onField(
			'relation:connected',
			this.entityType,
			this.entityId,
			this.fieldName,
			listener,
		)
	}

	/**
	 * Subscribe to disconnection events.
	 */
	onDisconnect(listener: EventListener<RelationDisconnectedEvent>): Unsubscribe {
		const emitter = this.dispatcher.getEventEmitter()
		return emitter.onField(
			'relation:disconnected',
			this.entityType,
			this.entityId,
			this.fieldName,
			listener,
		)
	}

	/**
	 * Intercept connection (can cancel or modify target).
	 */
	interceptConnect(interceptor: Interceptor<RelationConnectingEvent>): Unsubscribe {
		const emitter = this.dispatcher.getEventEmitter()
		return emitter.interceptField(
			'relation:connecting',
			this.entityType,
			this.entityId,
			this.fieldName,
			interceptor,
		)
	}

	/**
	 * Intercept disconnection (can cancel).
	 */
	interceptDisconnect(interceptor: Interceptor<RelationDisconnectingEvent>): Unsubscribe {
		const emitter = this.dispatcher.getEventEmitter()
		return emitter.interceptField(
			'relation:disconnecting',
			this.entityType,
			this.entityId,
			this.fieldName,
			interceptor,
		)
	}

	// ==================== EntityRef-compatible Properties ====================
	// These make HasOneAccessor structurally compatible with EntityAccessor

	/** Raw data snapshot of the related entity - delegates to $entity */
	get $data(): TSelected | null { return this.entity.$data }

	/** Whether this entity is new - delegates to $entity */
	get $isNew(): boolean { return this.entity.$isNew }

	/** Server-assigned ID after persistence - delegates to $entity */
	get $persistedId(): string | null { return this.entity.$persistedId }

	/** Type brand for entity name */
	get __entityName(): string { return this.targetType }

	/** Available roles for role-based type checking */
	get __availableRoles(): readonly string[] { return [] }

	/** Clear all errors - delegates to $entity */
	$clearAllErrors(): void { this.entity.$clearAllErrors() }

	/** Subscribe to any event on the related entity */
	$on<E extends AfterEventTypes>(
		eventType: E,
		listener: EventListener<EventTypeMap[E]>,
	): Unsubscribe {
		return this.entity.$on(eventType, listener)
	}

	/** Intercept any before event on the related entity */
	$intercept<E extends BeforeEventTypes>(
		eventType: E,
		interceptor: Interceptor<EventTypeMap[E]>,
	): Unsubscribe {
		return this.entity.$intercept(eventType, interceptor)
	}

	/** Subscribe to persist success events on the related entity */
	$onPersisted(listener: EventListener<EntityPersistedEvent>): Unsubscribe {
		return this.entity.$onPersisted(listener)
	}

	/** Intercept persist on the related entity */
	$interceptPersisting(interceptor: Interceptor<EntityPersistingEvent>): Unsubscribe {
		return this.entity.$interceptPersisting(interceptor)
	}

}


/**
 * HasManyListHandle provides access to a has-many relation (list of entities).
 * Implements HasManyRef interface for JSX compatibility.
 *
 * @typeParam TEntity - The full entity type of items in the relation
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 */
export class HasManyListHandle<TEntity extends object = object, TSelected = TEntity> extends EntityRelatedHandle implements HasManyRef<TEntity, TSelected> {
	private itemHandleCache = new Map<string, EntityHandle<TEntity, TSelected>>()

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
	 * Type brand - available roles for type inference.
	 * Returns empty array at runtime; role checking is compile-time only.
	 */
	get __availableRoles(): readonly string[] {
		return []
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

	constructor(
		parentEntityType: string,
		parentEntityId: string,
		private readonly fieldName: string,
		private readonly itemType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		private readonly schema: SchemaRegistry,
		brands?: Set<symbol>,
		alias?: string,
	) {
		super(parentEntityType, parentEntityId, store, dispatcher)
		this.__brands = brands
		this.alias = alias ?? fieldName

		// Return a Proxy that supports $ aliasing
		// eslint-disable-next-line no-constructor-return
		return createAliasProxy(this) as HasManyListHandle<TEntity, TSelected>
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
		}
	}

	/**
	 * Gets the list of items as entity accessors with direct field access.
	 * Returns selection-aware EntityAccessors that support `item.fieldName.value`.
	 * Includes planned connections and excludes planned removals.
	 * Uses ordered IDs to preserve order including after move() operations.
	 */
	get items(): EntityAccessor<TEntity, TSelected>[] {
		const data = this.getEntityData()
		if (!data) return []

		const listData = data[this.fieldName] as Array<{ id: string }> | undefined
		if (!Array.isArray(listData)) return []

		// Ensure snapshots exist for embedded items
		this.ensureItemSnapshots(listData)

		// Extract server IDs from embedded data
		const serverIds = listData
			.map((item) => item.id)
			.filter((id): id is string => id !== undefined)

		// Ensure has-many state exists with proper server IDs
		// This is needed so that connect/disconnect operations work correctly
		this.store.getOrCreateHasMany(
			this.entityType,
			this.entityId,
			this.fieldName,
			serverIds,
			this.alias,
		)

		// Use ordered IDs from store (handles removals, connections, and ordering)
		const orderedIds = this.store.getHasManyOrderedIds(
			this.entityType,
			this.entityId,
			this.fieldName,
			this.alias,
		)

		return orderedIds.map((id) => this.getItemHandle(id))
	}

	/**
	 * Ensures snapshots exist for embedded has-many items.
	 */
	private ensureItemSnapshots(listData: Array<Record<string, unknown>>): void {
		for (const itemData of listData) {
			const itemId = itemData['id'] as string
			if (!itemId) continue

			// Register parent-child relationship for change propagation
			// This needs to happen even if the snapshot already exists
			this.store.registerParentChild(this.entityType, this.entityId, this.itemType, itemId)

			// Skip if snapshot already exists
			if (this.store.hasEntity(this.itemType, itemId)) {
				continue
			}

			// Create snapshot from embedded data
			// Skip notification to avoid triggering React state updates during render
			this.store.setEntityData(
				this.itemType,
				itemId,
				itemData,
				true, // isServerData
				true, // skipNotify - called during render, data already exists embedded in parent
			)
		}
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
		let handle = this.itemHandleCache.get(itemId)

		if (!handle) {
			handle = new EntityHandle<TEntity, TSelected>(
				itemId,
				this.itemType,
				this.store,
				this.dispatcher,
				this.schema,
				this.__brands,
			)
			this.itemHandleCache.set(itemId, handle)
		}

		// EntityHandle constructor returns a Proxy that implements EntityAccessor
		return handle as unknown as EntityAccessor<TEntity, TSelected>
	}

	/**
	 * Checks if the list is dirty (items added/removed/moved/connected/disconnected).
	 */
	get isDirty(): boolean {
		const state = this.store.getHasMany(
			this.entityType,
			this.entityId,
			this.fieldName,
			this.alias,
		)

		if (!state) return false

		return (
			state.plannedRemovals.size > 0 ||
			state.plannedConnections.size > 0 ||
			state.createdEntities.size > 0 ||
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
		this.assertNotDisposed()
		this.store.planHasManyConnection(
			this.entityType,
			this.entityId,
			this.fieldName,
			itemId,
			this.alias,
		)
	}

	/**
	 * Disconnects an entity from this has-many relation.
	 */
	disconnect(itemId: string): void {
		this.assertNotDisposed()
		this.store.planHasManyRemoval(
			this.entityType,
			this.entityId,
			this.fieldName,
			itemId,
			'disconnect',
			this.alias,
		)
	}

	/**
	 * Adds a new item to the list by creating a new entity.
	 * Returns the ID of the newly created entity (temp ID).
	 * For connecting existing entities, use connect() instead.
	 */
	add(data?: Partial<TEntity>): string {
		this.assertNotDisposed()

		// Create new entity with temp ID
		const tempId = this.store.createEntity(this.itemType, data as Record<string, unknown>)

		// Add to has-many relation
		this.store.addToHasMany(
			this.entityType,
			this.entityId,
			this.fieldName,
			tempId,
			this.alias,
		)

		return tempId
	}

	/**
	 * Removes an item from the list by ID.
	 * For newly created entities (via add()), cancels the add operation.
	 * For existing server entities, plans a disconnect.
	 */
	remove(itemId: string): void {
		this.assertNotDisposed()

		this.store.removeFromHasMany(
			this.entityType,
			this.entityId,
			this.fieldName,
			itemId,
			this.alias,
		)
	}

	/**
	 * Moves an item from one position to another within the list.
	 * Note: This only affects client-side order. For persistent ordering,
	 * use an 'order' field on the entity.
	 */
	move(fromIndex: number, toIndex: number): void {
		this.assertNotDisposed()

		this.store.moveInHasMany(
			this.entityType,
			this.entityId,
			this.fieldName,
			fromIndex,
			toIndex,
			this.alias,
		)
	}

	/**
	 * Resets the has-many relation to server state.
	 * Clears all planned connections and removals.
	 */
	reset(): void {
		this.assertNotDisposed()
		this.store.resetHasMany(
			this.entityType,
			this.entityId,
			this.fieldName,
			this.alias,
		)
	}

	/**
	 * Disposes the handle.
	 */
	override dispose(): void {
		super.dispose()

		for (const handle of this.itemHandleCache.values()) {
			handle.dispose()
		}
		this.itemHandleCache.clear()
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
		this.assertNotDisposed()
		this.dispatcher.dispatch(
			addRelationError(this.entityType, this.entityId, this.fieldName, createClientError(error)),
		)
	}

	/**
	 * Clears all errors from this relation.
	 */
	clearErrors(): void {
		this.assertNotDisposed()
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

// ==================== Placeholder Handle ====================

/**
 * PlaceholderHandle provides access to a placeholder entity (for creating new entities).
 * Implements EntityRef interface with a placeholder ID.
 * Reads/writes from placeholderData in the relation state.
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields
 */
export class PlaceholderHandle<TEntity extends object = object, TSelected = TEntity>
	implements EntityRef<TEntity, TSelected>
{
	/** Runtime brand symbols for validation */
	readonly __brands?: Set<symbol>

	/** Type brand for schema - placeholder at runtime */
	declare readonly __schema: Record<string, object>

	/** Placeholder ID for this handle */
	private readonly placeholderId: string

	// $ aliases - handled by proxy at runtime, declared for TypeScript
	declare readonly $fields: SelectedEntityFields<TEntity, TSelected>
	declare readonly $data: TSelected | null
	declare readonly $isDirty: boolean
	declare readonly $persistedId: null
	declare readonly $isNew: boolean
	declare readonly $errors: readonly FieldError[]
	declare readonly $hasError: boolean
	declare $addError: (error: ErrorInput) => void
	declare $clearErrors: () => void
	declare $clearAllErrors: () => void
	declare $on: <E extends AfterEventTypes>(eventType: E, listener: EventListener<EventTypeMap[E]>) => Unsubscribe
	declare $intercept: <E extends BeforeEventTypes>(eventType: E, interceptor: Interceptor<EventTypeMap[E]>) => Unsubscribe
	declare $onPersisted: (listener: EventListener<EntityPersistedEvent>) => Unsubscribe
	declare $interceptPersisting: (interceptor: Interceptor<EntityPersistingEvent>) => Unsubscribe

	constructor(
		private readonly parentEntityType: string,
		private readonly parentEntityId: string,
		private readonly fieldName: string,
		private readonly targetType: string,
		private readonly store: SnapshotStore,
		private readonly dispatcher: ActionDispatcher,
		brands?: Set<symbol>,
	) {
		this.__brands = brands
		this.placeholderId = generatePlaceholderId()

		// Return a Proxy that supports $ aliasing
		// eslint-disable-next-line no-constructor-return
		return createAliasProxy(this) as PlaceholderHandle<TEntity, TSelected>
	}

	/**
	 * Gets the placeholder ID.
	 */
	get id(): string {
		return this.placeholderId
	}

	/**
	 * Gets placeholder data from the relation state.
	 */
	get data(): TSelected | null {
		const relation = this.store.getRelation(
			this.parentEntityType,
			this.parentEntityId,
			this.fieldName,
		)
		if (!relation || Object.keys(relation.placeholderData).length === 0) {
			return null
		}
		return relation.placeholderData as TSelected
	}

	/**
	 * Placeholder is dirty if it has any data.
	 */
	get isDirty(): boolean {
		const relation = this.store.getRelation(
			this.parentEntityType,
			this.parentEntityId,
			this.fieldName,
		)
		return relation ? Object.keys(relation.placeholderData).length > 0 : false
	}

	/**
	 * Placeholder entities are always new (not yet persisted).
	 */
	get persistedId(): null {
		return null
	}

	/**
	 * Placeholder entities are always new.
	 */
	get isNew(): boolean {
		return true
	}

	/**
	 * Gets field accessors that read/write placeholder data.
	 */
	get fields(): SelectedEntityFields<TEntity, TSelected> {
		return new Proxy({} as SelectedEntityFields<TEntity, TSelected>, {
			get: (_, fieldName: string) => {
				return this.createPlaceholderFieldHandle(fieldName)
			},
		})
	}

	/**
	 * Creates a field handle for placeholder data.
	 */
	private createPlaceholderFieldHandle(fieldName: string): unknown {
		const self = this

		return {
			get [FIELD_REF_META](): FieldRefMeta {
				return {
					entityType: self.targetType,
					entityId: self.placeholderId,
					path: [fieldName],
					fieldName,
					isArray: false,
					isRelation: false,
				}
			},
			get value(): unknown {
				const relation = self.store.getRelation(
					self.parentEntityType,
					self.parentEntityId,
					self.fieldName,
				)
				return relation?.placeholderData[fieldName] ?? null
			},
			get serverValue(): unknown {
				return null
			},
			get isDirty(): boolean {
				const relation = self.store.getRelation(
					self.parentEntityType,
					self.parentEntityId,
					self.fieldName,
				)
				return fieldName in (relation?.placeholderData ?? {})
			},
			setValue: (value: unknown): void => {
				self.dispatcher.dispatch({
					type: 'SET_PLACEHOLDER_DATA',
					entityType: self.parentEntityType,
					entityId: self.parentEntityId,
					fieldName: self.fieldName,
					fieldPath: [fieldName],
					value,
				})
			},
			get inputProps() {
				const getValue = () => {
					const relation = self.store.getRelation(
						self.parentEntityType,
						self.parentEntityId,
						self.fieldName,
					)
					return relation?.placeholderData[fieldName] ?? null
				}
				const setValue = (value: unknown) => {
					self.dispatcher.dispatch({
						type: 'SET_PLACEHOLDER_DATA',
						entityType: self.parentEntityType,
						entityId: self.parentEntityId,
						fieldName: self.fieldName,
						fieldPath: [fieldName],
						value,
					})
				}
				return {
					get value() {
						return getValue()
					},
					setValue,
					onChange: setValue,
				}
			},
			path: [fieldName],
			fieldName,
			// Error properties for FieldRef interface
			get errors(): readonly FieldError[] {
				return []
			},
			get hasError(): boolean {
				return false
			},
			addError(_error: ErrorInput): void {
				// Placeholder fields don't store errors
			},
			clearErrors(): void {
				// Placeholder fields don't have errors to clear
			},
		}
	}

	/**
	 * Type brand for EntityRef compatibility.
	 */
	get __entityType(): TEntity {
		return undefined as unknown as TEntity
	}

	/**
	 * Entity name for role-based type inference.
	 */
	get __entityName(): string {
		return this.targetType
	}

	/**
	 * Available roles for HasRole constraint.
	 * Default implementation returns empty array (no role constraints).
	 */
	get __availableRoles(): readonly string[] {
		return []
	}

	/**
	 * Placeholder entities don't have persistent errors.
	 * Returns empty array.
	 */
	get errors(): readonly FieldError[] {
		return []
	}

	/**
	 * Placeholder entities don't have errors.
	 */
	get hasError(): boolean {
		return false
	}

	/**
	 * No-op for placeholder entities.
	 */
	addError(_error: ErrorInput): void {
		// Placeholder entities don't store errors
	}

	/**
	 * No-op for placeholder entities.
	 */
	clearErrors(): void {
		// Placeholder entities don't have errors to clear
	}

	/**
	 * No-op for placeholder entities.
	 */
	clearAllErrors(): void {
		// Placeholder entities don't have errors to clear
	}

	// ==================== Event Subscriptions ====================
	// Placeholder entities don't fire events - these are no-ops that return dummy unsubscribe functions

	/**
	 * No-op for placeholder entities.
	 */
	on<E extends AfterEventTypes>(
		_eventType: E,
		_listener: EventListener<EventTypeMap[E]>,
	): Unsubscribe {
		return () => {}
	}

	/**
	 * No-op for placeholder entities.
	 */
	intercept<E extends BeforeEventTypes>(
		_eventType: E,
		_interceptor: Interceptor<EventTypeMap[E]>,
	): Unsubscribe {
		return () => {}
	}

	/**
	 * No-op for placeholder entities.
	 */
	onPersisted(_listener: EventListener<EntityPersistedEvent>): Unsubscribe {
		return () => {}
	}

	/**
	 * No-op for placeholder entities.
	 */
	interceptPersisting(_interceptor: Interceptor<EntityPersistingEvent>): Unsubscribe {
		return () => {}
	}

}
