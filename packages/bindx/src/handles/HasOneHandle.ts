import { EntityRelatedHandle } from './BaseHandle.js'
import type { ActionDispatcher } from '../core/ActionDispatcher.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import type { SchemaRegistry } from '../schema/SchemaRegistry.js'
import type { SelectionMeta } from '../selection/types.js'
import {
	connectRelation,
	disconnectRelation,
	deleteRelation,
	addRelationError,
	clearRelationErrors,
} from '../core/actions.js'
import {
	FIELD_REF_META,
	type FieldRefMeta,
	type EntityFieldsAccessor,
	type Unsubscribe,
	type EntityAccessor,
	type HasOneAccessor,
} from './types.js'
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
} from '../events/types.js'
import { EntityHandle } from './EntityHandle.js'
import { PlaceholderHandle } from './PlaceholderHandle.js'
import { createHandleProxy } from './proxyFactory.js'


/**
 * HasOneHandle provides access to a has-one relation.
 * Implements HasOneRef interface for JSX compatibility.
 *
 * @typeParam TEntity - The full entity type of the related entity
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 */
export class HasOneHandle<TEntity extends object = object, TSelected = TEntity> extends EntityRelatedHandle {
	private entityHandleCacheRaw: EntityHandle<TEntity, TSelected> | null = null
	private entityHandleCacheProxy: EntityAccessor<TEntity, TSelected> | null = null
	private placeholderCacheRaw: PlaceholderHandle<TEntity, TSelected> | null = null
	private placeholderCacheProxy: EntityAccessor<TEntity, TSelected> | null = null

	/** Runtime brand symbols for validation */
	readonly __brands?: Set<symbol>

	private constructor(
		parentEntityType: string,
		parentEntityId: string,
		private readonly fieldName: string,
		private readonly targetType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		private readonly schema: SchemaRegistry,
		brands?: Set<symbol>,
		private readonly selection?: SelectionMeta,
	) {
		super(parentEntityType, parentEntityId, store, dispatcher)
		this.__brands = brands
	}

	static create<TEntity extends object = object, TSelected = TEntity>(
		parentEntityType: string,
		parentEntityId: string,
		fieldName: string,
		targetType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		schema: SchemaRegistry,
		brands?: Set<symbol>,
		selection?: SelectionMeta,
	): HasOneAccessor<TEntity, TSelected> {
		return createHandleProxy<HasOneHandle<TEntity, TSelected>, HasOneAccessor<TEntity, TSelected>>(new HasOneHandle<TEntity, TSelected>(parentEntityType, parentEntityId, fieldName, targetType, store, dispatcher, schema, brands, selection), (target) => target.entityRaw.fields)
	}

	static createRaw<TEntity extends object = object, TSelected = TEntity>(
		parentEntityType: string,
		parentEntityId: string,
		fieldName: string,
		targetType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		schema: SchemaRegistry,
		brands?: Set<symbol>,
		selection?: SelectionMeta,
	): HasOneHandle<TEntity, TSelected> {
		return new HasOneHandle<TEntity, TSelected>(parentEntityType, parentEntityId, fieldName, targetType, store, dispatcher, schema, brands, selection)
	}

	static wrapProxy<TEntity extends object, TSelected>(handle: HasOneHandle<TEntity, TSelected>): HasOneAccessor<TEntity, TSelected> {
		return createHandleProxy<HasOneHandle<TEntity, TSelected>, HasOneAccessor<TEntity, TSelected>>(handle, (target) => target.entityRaw.fields)
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
			targetType: this.targetType,
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
	 * Falls back to snapshot data when no explicit relation state exists,
	 * so server-loaded has-one relations report 'connected' without
	 * requiring a prior RelationStore entry.
	 */
	get state(): 'connected' | 'disconnected' | 'deleted' | 'creating' {
		const relation = this.store.getRelation(
			this.entityType,
			this.entityId,
			this.fieldName,
		)
		if (relation) {
			return relation.state
		}
		// No explicit relation state — check if snapshot has embedded data
		if (this.relatedId !== null) {
			return 'connected'
		}
		return 'disconnected'
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
	get fields(): EntityFieldsAccessor<TEntity, TSelected> {
		return this.entity.$fields
	}

	/**
	 * Gets the raw (unproxied) related entity handle.
	 * Returns raw EntityHandle or raw PlaceholderHandle.
	 * Used internally to avoid going through the proxy layer.
	 */
	get entityRaw(): EntityHandle<TEntity, TSelected> | PlaceholderHandle<TEntity, TSelected> {
		const id = this.relatedId

		if (id) {
			this.ensureRelatedEntitySnapshot(id)

			if (!this.entityHandleCacheRaw || this.entityHandleCacheRaw.id !== id) {
				this.entityHandleCacheRaw = EntityHandle.createRaw<TEntity, TSelected>(
					id,
					this.targetType,
					this.store,
					this.dispatcher,
					this.schema,
					this.__brands,
					this.selection,
				)
				this.entityHandleCacheProxy = EntityHandle.wrapProxy(this.entityHandleCacheRaw)
			}
			return this.entityHandleCacheRaw
		}

		if (!this.placeholderCacheRaw) {
			this.placeholderCacheRaw = PlaceholderHandle.createRaw<TEntity, TSelected>(
				this.entityType,
				this.entityId,
				this.fieldName,
				this.targetType,
				this.store,
				this.dispatcher,
				this.schema,
				this.__brands,
			)
			this.placeholderCacheProxy = PlaceholderHandle.wrapProxy(this.placeholderCacheRaw)
		}
		return this.placeholderCacheRaw
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

			// Connected - return real entity handle (populate raw cache via entityRaw if needed)
			if (!this.entityHandleCacheRaw || this.entityHandleCacheRaw.id !== id) {
				// entityRaw populates both raw and proxy caches
				this.entityRaw
			}
			return this.entityHandleCacheProxy!
		}

		// Disconnected - return placeholder handle
		if (!this.placeholderCacheRaw) {
			// entityRaw populates both raw and proxy caches
			this.entityRaw
		}
		return this.placeholderCacheProxy!
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

		// Only use embedded data if its ID matches the expected related entity ID.
		// After $connect changes the relation to a different entity, the parent's embedded
		// data still contains the OLD related entity — using it would store stale data
		// under the new entity's key.
		const embeddedId = (embeddedData as Record<string, unknown>)['id']
		if (embeddedId !== id) {
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
	 * Checks if the related entity is currently being persisted.
	 */
	get isPersisting(): boolean {
		const id = this.relatedId
		if (!id) return false
		return this.store.isPersisting(this.targetType, id)
	}

	/**
	 * Checks if the relation is connected to a persisted entity.
	 */
	get isConnected(): boolean {
		return this.state === 'connected'
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
	 * Creates a new entity of the target type and connects it to this relation.
	 * Returns the temp ID of the created entity.
	 * Accessible via proxy as `$create()`.
	 */
	create(data?: Partial<TEntity>): string {
		this.assertNotDisposed()
		const tempId = this.store.createEntity(this.targetType, data as Record<string, unknown>)
		this.dispatcher.dispatch(
			connectRelation(this.entityType, this.entityId, this.fieldName, tempId, this.targetType),
		)
		return tempId
	}

	/**
	 * Connects the relation to an entity.
	 */
	connect(targetId: string): void {
		this.assertNotDisposed()
		this.dispatcher.dispatch(
			connectRelation(this.entityType, this.entityId, this.fieldName, targetId, this.targetType),
		)
	}

	/**
	 * Disconnects the relation.
	 * Sets the FK to null — only works when the FK column is nullable.
	 */
	disconnect(): void {
		this.assertNotDisposed()
		this.dispatcher.dispatch(
			disconnectRelation(this.entityType, this.entityId, this.fieldName),
		)
	}

	/**
	 * Marks the related entity for deletion.
	 */
	delete(): void {
		this.assertNotDisposed()
		this.dispatcher.dispatch(
			deleteRelation(this.entityType, this.entityId, this.fieldName),
		)
	}

	/**
	 * Removes the related entity using the appropriate strategy based on schema metadata.
	 * - nullable FK → disconnect (sets FK to null, related entity stays)
	 * - non-nullable FK → delete (related entity can't exist without parent)
	 * - unknown → disconnect (safe fallback)
	 */
	remove(): void {
		const nullable = this.schema.getRelationNullable(this.entityType, this.fieldName)
		if (nullable === false) {
			this.delete()
		} else {
			this.disconnect()
		}
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
		this.entityHandleCacheRaw?.dispose()
		this.entityHandleCacheRaw = null
		this.entityHandleCacheProxy = null
		this.placeholderCacheRaw = null
		this.placeholderCacheProxy = null
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
	// These delegate to entityRaw so that proxy resolution ($data→data, $isNew→isNew, etc.) works correctly.

	/** Raw data snapshot of the related entity - delegates to entityRaw */
	get data(): TSelected | null { return this.entityRaw.data }

	/** Whether this entity is new - delegates to entityRaw */
	get isNew(): boolean { return this.entityRaw.isNew }

	/** Server-assigned ID after persistence - delegates to entityRaw */
	get persistedId(): string | null { return this.entityRaw.persistedId }

	/** Type brand for entity name */
	get __entityName(): string { return this.targetType }

	/** Clear all errors - delegates to entityRaw */
	clearAllErrors(): void { this.entityRaw.clearAllErrors() }

	/** Subscribe to any event on the related entity */
	on<E extends AfterEventTypes>(
		eventType: E,
		listener: EventListener<EventTypeMap[E]>,
	): Unsubscribe {
		return this.entityRaw.on(eventType, listener)
	}

	/** Intercept any before event on the related entity */
	intercept<E extends BeforeEventTypes>(
		eventType: E,
		interceptor: Interceptor<EventTypeMap[E]>,
	): Unsubscribe {
		return this.entityRaw.intercept(eventType, interceptor)
	}

	/** Subscribe to persist success events on the related entity */
	onPersisted(listener: EventListener<EntityPersistedEvent>): Unsubscribe {
		return this.entityRaw.onPersisted(listener)
	}

	/** Intercept persist on the related entity */
	interceptPersisting(interceptor: Interceptor<EntityPersistingEvent>): Unsubscribe {
		return this.entityRaw.interceptPersisting(interceptor)
	}

}
