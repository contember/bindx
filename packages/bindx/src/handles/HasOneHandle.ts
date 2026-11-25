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
	type HasOneRelationState,
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
import { EntityHandle, type FieldAccessMode } from './EntityHandle.js'
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
		// Segments from the query root down to this relation; also the entity path
		// of whatever it resolves to. See FieldRefMeta.fullPath.
		private readonly relationPath: readonly string[] = [fieldName],
		private readonly fieldAccess: FieldAccessMode = 'checked',
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
		relationPath?: readonly string[],
		fieldAccess?: FieldAccessMode,
	): HasOneAccessor<TEntity, TSelected> {
		return HasOneHandle.wrapProxy(new HasOneHandle<TEntity, TSelected>(parentEntityType, parentEntityId, fieldName, targetType, store, dispatcher, schema, brands, selection, relationPath, fieldAccess))
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
		relationPath?: readonly string[],
		fieldAccess?: FieldAccessMode,
	): HasOneHandle<TEntity, TSelected> {
		return new HasOneHandle<TEntity, TSelected>(parentEntityType, parentEntityId, fieldName, targetType, store, dispatcher, schema, brands, selection, relationPath, fieldAccess)
	}

	static wrapProxy<TEntity extends object, TSelected>(handle: HasOneHandle<TEntity, TSelected>): HasOneAccessor<TEntity, TSelected> {
		return createHandleProxy<HasOneHandle<TEntity, TSelected>, HasOneAccessor<TEntity, TSelected>>(
			handle,
			(target) => target.entityRaw.fields,
			(target) => target.entityRaw.selectedFieldNames,
		)
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
			fullPath: this.relationPath,
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

	/** Gets the relation state. A server read writes it on arrival; a relation never read is disconnected. */
	get state(): HasOneRelationState {
		const relation = this.store.getPresentationRelation(
			this.entityType,
			this.entityId,
			this.fieldName,
		)
		return relation?.state ?? 'disconnected'
	}

	/** Gets the current related entity ID from the relation store. */
	get relatedId(): string | null {
		const relation = this.store.getPresentationRelation(
			this.entityType,
			this.entityId,
			this.fieldName,
		)
		return relation?.currentId ?? null
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
			if (!this.entityHandleCacheRaw || this.entityHandleCacheRaw.id !== id) {
				this.entityHandleCacheRaw = EntityHandle.createRaw<TEntity, TSelected>(
					id,
					this.targetType,
					this.store,
					this.dispatcher,
					this.schema,
					this.__brands,
					this.selection,
					this.relationPath,
					this.fieldAccess,
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
				this.relationPath,
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

		return relation.currentId !== relation.serverId
			|| relation.state !== relation.serverState
			|| Object.keys(relation.placeholderData).length > 0
	}

	/**
	 * Creates a new entity of the target type and connects it to this relation.
	 * Returns the temp ID of the created entity.
	 * Accessible via proxy as `$create()`.
	 */
	create(data?: Partial<TEntity>): string {
		// One gesture = one undo entry: the pre-create and the connect are journaled
		// together so undo removes (and redo re-creates) the created target.
		return this.store.transaction(() => {
			const tempId = this.store.createEntity(this.targetType, data as Record<string, unknown>)
			this.dispatcher.dispatch(
				connectRelation(this.entityType, this.entityId, this.fieldName, tempId, this.targetType),
			)
			return tempId
		})
	}

	/**
	 * Connects the relation to an entity.
	 */
	connect(targetId: string): void {
		this.dispatcher.dispatch(
			connectRelation(this.entityType, this.entityId, this.fieldName, targetId, this.targetType),
		)
	}

	/**
	 * Disconnects the relation.
	 * Sets the FK to null — only works when the FK column is nullable.
	 */
	disconnect(): void {
		this.dispatcher.dispatch(
			disconnectRelation(this.entityType, this.entityId, this.fieldName),
		)
	}

	/**
	 * Marks the related entity for deletion.
	 */
	delete(): void {
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
		this.store.resetRelation(this.entityType, this.entityId, this.fieldName)
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
