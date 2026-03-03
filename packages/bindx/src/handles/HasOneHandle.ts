import { EntityRelatedHandle } from './BaseHandle.js'
import type { ActionDispatcher } from '../core/ActionDispatcher.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import type { SchemaRegistry } from '../schema/SchemaRegistry.js'
import {
	connectRelation,
	disconnectRelation,
	deleteRelation,
	addRelationError,
	clearRelationErrors,
} from '../core/actions.js'
import {
	FIELD_REF_META,
	type HasOneRef,
	type FieldRefMeta,
	type SelectedEntityFields,
	type Unsubscribe,
	type EntityAccessor,
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
import { createHandleProxy, HAS_ONE_HANDLE_PROPERTIES } from './proxyFactory.js'


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

	private constructor(
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
	): HasOneHandle<TEntity, TSelected> {
		return createHandleProxy(new HasOneHandle<TEntity, TSelected>(parentEntityType, parentEntityId, fieldName, targetType, store, dispatcher, schema, brands), {
			knownProperties: HAS_ONE_HANDLE_PROPERTIES,
			getFields: (target) => target.entity.$fields,
		})
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
				this.entityHandleCache = EntityHandle.create<TEntity, TSelected>(
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
			this.placeholderCache = PlaceholderHandle.create<TEntity, TSelected>(
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
