import { EntityRelatedHandle, embeddedDataMatchesSnapshot } from './BaseHandle.js'
import type { ActionDispatcher } from '../core/ActionDispatcher.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import type { StoredRelationState } from '../store/RelationStore.js'
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
	 * Materializes the RelationStore entry from embedded snapshot data first, so a
	 * server-loaded has-one reports 'connected' without a prior explicit entry.
	 */
	get state(): HasOneRelationState {
		this.ensureEntry()
		const relation = this.store.getPresentationRelation(
			this.entityType,
			this.entityId,
			this.fieldName,
		)
		return relation?.state ?? 'disconnected'
	}

	/**
	 * Gets the current related entity ID — read exclusively from the RelationStore
	 * after materializing the entry from embedded snapshot data.
	 */
	get relatedId(): string | null {
		this.ensureEntry()
		const relation = this.store.getPresentationRelation(
			this.entityType,
			this.entityId,
			this.fieldName,
		)
		return relation?.currentId ?? null
	}

	/**
	 * Materializes this has-one's RelationStore entry from the parent's embedded
	 * snapshot data, so the store is the single source of truth (symmetric with
	 * {@link HasManyListHandle.materializeEmbeddedItems}).
	 *
	 * Only the relation entry is touched here — child-snapshot propagation stays in
	 * {@link ensureRelatedEntitySnapshot}, which owns the per-relation propagation
	 * slot so the two paths never double-consume it.
	 *
	 * - No entry yet + the parent embeds a related object with an id → create a
	 *   `connected` entry (non-notifying) whose server baseline comes from the
	 *   parent's serverData, so a freshly loaded relation is not dirty
	 *   (currentId === serverId, state === serverState).
	 * - Existing entry + parent re-fetch (embedded reference changed) that is NOT
	 *   locally dirty → advance the server baseline to the new related id.
	 * - A local connect/disconnect, a placeholder, or a `creating` entry is left
	 *   untouched — it is detected as a locally-dirty relation.
	 * - No embedded data and no entry → the relation stays unmaterialized (null).
	 */
	private ensureEntry(): void {
		const existing = this.store.getRelation(this.entityType, this.entityId, this.fieldName)
		const embeddedData = this.readEmbeddedRelatedData()
		const embeddedReference = readEmbeddedRelatedReference(embeddedData)

		if (!existing) {
			if (embeddedReference.kind !== 'connected') return
			const serverId = this.readServerRelatedId()
			this.store.getOrCreateRelation(this.entityType, this.entityId, this.fieldName, {
				currentId: embeddedReference.id,
				serverId,
				state: 'connected',
				serverState: serverId !== null ? 'connected' : 'disconnected',
				placeholderData: {},
			})
			return
		}

		this.advanceServerBaselineOnRefetch(existing, embeddedReference, embeddedData)
	}

	/**
	 * On a parent re-fetch (embedded reference changed) advances the relation's
	 * server baseline to the embedded related id, but only when the relation is
	 * not locally dirty — a local connect/disconnect/create must survive a re-fetch.
	 *
	 * Does NOT consume the propagation slot — {@link ensureRelatedEntitySnapshot}
	 * owns it. The same reference-change signal drives both, so both run within the
	 * one render that observes a new parent reference.
	 *
	 * The baseline write is NON-NOTIFYING: it runs during a render-phase read, and
	 * the parent re-fetch that produced the new embedded reference already notified
	 * subscribers. Notifying again here would mutate the store and synchronously call
	 * subscribers mid-render, violating the external-store contract (cf.
	 * {@link ensureRelatedEntitySnapshot}, which refreshes server data with skipNotify
	 * for the same reason).
	 */
	private advanceServerBaselineOnRefetch(
		existing: StoredRelationState,
		embeddedReference: EmbeddedRelatedReference,
		embeddedData: unknown,
	): void {
		if (embeddedReference.kind === 'absent') return
		if (this.isLocallyDirty(existing)) return

		if (embeddedReference.kind === 'null' && existing.serverId === null && existing.serverState === 'disconnected') {
			return
		}
		if (embeddedReference.kind === 'connected' && existing.serverId === embeddedReference.id && existing.serverState === 'connected') {
			return
		}
		if (!this.store.hasEmbeddedDataChanged(this.entityType, this.entityId, this.fieldName, embeddedData)) {
			return
		}

		if (embeddedReference.kind === 'null') {
			this.store.setRelation(this.entityType, this.entityId, this.fieldName, {
				currentId: null,
				serverId: null,
				state: 'disconnected',
				serverState: 'disconnected',
			}, true)
			return
		}

		this.store.setRelation(this.entityType, this.entityId, this.fieldName, {
			currentId: embeddedReference.id,
			serverId: embeddedReference.id,
			state: 'connected',
			serverState: 'connected',
		}, true)
	}

	private isLocallyDirty(relation: StoredRelationState): boolean {
		return (
			relation.currentId !== relation.serverId ||
			relation.state !== relation.serverState ||
			Object.keys(relation.placeholderData).length > 0
		)
	}

	/** Reads the embedded related object from the parent's canonical current data. */
	private readEmbeddedRelatedData(): unknown {
		return this.getEntityData()?.[this.fieldName]
	}

	/** Extracts the related id from the parent's embedded server data, or null. */
	private readServerRelatedId(): string | null {
		return extractRelatedId(this.getServerData()?.[this.fieldName])
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

		// Skip if parent's embedded data reference hasn't changed since last propagation.
		// A new reference means the parent was re-fetched from the server.
		// Same reference means the embedded data is stale and must not overwrite
		// child state that may have been updated by a local commit.
		if (!this.store.hasEmbeddedDataChanged(this.entityType, this.entityId, this.fieldName, embeddedData)) {
			return
		}

		// Skip if embedded data values match existing serverData — avoids overwriting
		// unpersisted local mutations when a re-fetch returns the same server data
		// (e.g. polling). A new reference with identical values means no actual change.
		const existing = this.store.getEntitySnapshot(this.targetType, id)
		if (existing?.serverData && embeddedDataMatchesSnapshot(embeddedData as Record<string, unknown>, existing.serverData as Record<string, unknown>)) {
			this.store.markEmbeddedDataPropagated(this.entityType, this.entityId, this.fieldName, embeddedData)
			return
		}

		// Create or update snapshot from embedded data.
		// Use refreshServerData (not setEntityData) so a re-fetch advances the
		// child's server baseline without clobbering the user's local dirty edits
		// on the related entity. Skip notification to avoid triggering React state
		// updates during render.
		this.store.refreshServerData(
			this.targetType,
			id,
			embeddedData as Record<string, unknown>,
			true, // skipNotify - called during render, data already exists embedded in parent
		)
		this.store.markEmbeddedDataPropagated(this.entityType, this.entityId, this.fieldName, embeddedData)
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
		this.ensureEntry()
		const relation = this.store.getRelation(
			this.entityType,
			this.entityId,
			this.fieldName,
		)
		if (!relation) return false

		return this.isLocallyDirty(relation)
	}

	/**
	 * Creates a new entity of the target type and connects it to this relation.
	 * Returns the temp ID of the created entity.
	 * Accessible via proxy as `$create()`.
	 */
	create(data?: Partial<TEntity>): string {
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

type EmbeddedRelatedReference =
	| { kind: 'absent' }
	| { kind: 'null' }
	| { kind: 'connected'; id: string }

/**
 * Reads an embedded has-one value while preserving explicit null.
 */
function readEmbeddedRelatedReference(embedded: unknown): EmbeddedRelatedReference {
	if (embedded === undefined) return { kind: 'absent' }
	if (embedded === null) return { kind: 'null' }
	if (typeof embedded !== 'object' || !('id' in embedded)) return { kind: 'absent' }
	const id = embedded.id
	return typeof id === 'string' ? { kind: 'connected', id } : { kind: 'absent' }
}

/**
 * Extracts the related entity id from an embedded has-one object, or null when
 * the value is not an object with a string id.
 */
function extractRelatedId(embedded: unknown): string | null {
	const reference = readEmbeddedRelatedReference(embedded)
	return reference.kind === 'connected' ? reference.id : null
}
