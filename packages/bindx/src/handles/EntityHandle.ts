import { EntityRelatedHandle } from './BaseHandle.js'
import { FieldHandle } from './FieldHandle.js'
import type { ActionDispatcher } from '../core/ActionDispatcher.js'
import { type SnapshotStore } from '../store/SnapshotStore.js'
import type { SchemaRegistry } from '../schema/SchemaRegistry.js'
import type { EntitySnapshot } from '../store/snapshots.js'
import {
	resetEntity,
	commitEntity,
	addEntityError,
	clearEntityErrors,
	clearAllErrors as clearAllErrorsAction,
} from '../core/actions.js'
import { type FieldRef, type HasOneAccessor, type HasManyRef, type SelectedEntityFields, type Unsubscribe, type EntityAccessor } from './types.js'
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
} from '../events/types.js'
import { HasOneHandle } from './HasOneHandle.js'
import { HasManyListHandle } from './HasManyListHandle.js'
import { createHandleProxy } from './proxyFactory.js'
import type { SelectionMeta } from '../selection/types.js'
import { UnfetchedFieldError } from '../errors/UnfetchedFieldError.js'

interface CachedHandle<TRaw, TProxy> {
	readonly raw: TRaw
	readonly proxy: TProxy
}

/** Minimal internal interface for cached relation handles that need reset/dispose.
 * At runtime, the proxied handles satisfy this through delegation, even if the public type doesn't expose dispose(). */
interface RelationHandleRaw {
	reset(): void
	dispose(): void
}

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
export class EntityHandle<T extends object = object, TSelected = T> extends EntityRelatedHandle {
	/** Cache for field handles to ensure stable identity */
	private readonly fieldHandleCache = new Map<string, CachedHandle<FieldHandle<unknown>, FieldRef<unknown>>>()

	/** Cache for relation handles */
	private readonly relationHandleCache = new Map<string, CachedHandle<RelationHandleRaw, HasOneAccessor<object> | HasManyRef<object>>>()

	/** Runtime brand symbols for validation */
	readonly __brands?: Set<symbol>

	private constructor(
		id: string,
		entityType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		private readonly schema: SchemaRegistry,
		brands?: Set<symbol>,
		private readonly selection?: SelectionMeta,
	) {
		super(entityType, id, store, dispatcher)
		this.__brands = brands
	}

	static create<T extends object = object, TSelected = T>(
		id: string,
		entityType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		schema: SchemaRegistry,
		brands?: Set<symbol>,
		selection?: SelectionMeta,
	): EntityAccessor<T, TSelected> {
		return EntityHandle.wrapProxy(new EntityHandle<T, TSelected>(id, entityType, store, dispatcher, schema, brands, selection))
	}

	static createRaw<T extends object = object, TSelected = T>(
		id: string,
		entityType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		schema: SchemaRegistry,
		brands?: Set<symbol>,
		selection?: SelectionMeta,
	): EntityHandle<T, TSelected> {
		return new EntityHandle<T, TSelected>(id, entityType, store, dispatcher, schema, brands, selection)
	}

	static wrapProxy<T extends object, TSelected>(handle: EntityHandle<T, TSelected>): EntityAccessor<T, TSelected> {
		return createHandleProxy<EntityHandle<T, TSelected>, EntityAccessor<T, TSelected>>(handle, (target) => target.fields)
	}

	/**
	 * Gets the entity ID.
	 */
	get id(): string {
		return this.entityId
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
	get error(): FieldError | undefined {
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
				const rawHandle = this.getHasOneHandleRaw(fieldName)
				// Check if the relation itself is dirty (connect/disconnect)
				if (rawHandle.isDirty) {
					return true
				}
				// Check if the target entity has dirty fields
				if (rawHandle.entityRaw.isDirty) {
					return true
				}
			} else if (relationType === 'hasMany') {
				const rawHandle = this.getHasManyHandleRaw(fieldName)
				if (rawHandle.isDirty) {
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
	field<K extends keyof T>(fieldName: K): FieldRef<T[K]> {
		const cacheKey = String(fieldName)
		const cached = this.fieldHandleCache.get(cacheKey)

		if (cached) {
			return cached.proxy as FieldRef<T[K]>
		}

		const enumName = this.schema.getEnumName(this.entityType, cacheKey)
		const columnType = this.schema.getColumnType(this.entityType, cacheKey)
		const raw = FieldHandle.createRaw<T[K]>(
			this.entityType,
			this.entityId,
			[cacheKey],
			this.store,
			this.dispatcher,
			enumName,
			columnType,
		)
		const proxy = FieldHandle.wrapProxy(raw)
		this.fieldHandleCache.set(cacheKey, { raw, proxy } as CachedHandle<FieldHandle<unknown>, FieldRef<unknown>>)

		return proxy
	}

	/**
	 * Gets a has-one relation handle.
	 */
	hasOne<TRelated extends object>(fieldName: string, nestedSelection?: SelectionMeta): HasOneAccessor<TRelated> {
		const cacheKey = `hasOne:${fieldName}`
		const cached = this.relationHandleCache.get(cacheKey)

		if (cached) {
			return cached.proxy as HasOneAccessor<TRelated>
		}

		const targetType = this.schema.getRelationTarget(this.entityType, fieldName)
		if (!targetType) {
			throw new Error(
				`Field "${fieldName}" is not a relation on entity "${this.entityType}"`,
			)
		}

		const raw = HasOneHandle.createRaw<TRelated>(
			this.entityType,
			this.entityId,
			fieldName,
			targetType,
			this.store,
			this.dispatcher,
			this.schema,
			undefined,
			nestedSelection,
		)
		const proxy = HasOneHandle.wrapProxy(raw)
		this.relationHandleCache.set(cacheKey, { raw, proxy } as unknown as CachedHandle<RelationHandleRaw, HasOneAccessor<object> | HasManyRef<object>>)

		return proxy
	}

	/**
	 * Gets a has-many relation handle.
	 *
	 * @param alias - Optional alias for the relation. When the same field is used multiple times
	 *                with different parameters (filter, orderBy, limit), each needs a unique alias.
	 */
	hasMany<TItem extends object>(fieldName: string, alias?: string, nestedSelection?: SelectionMeta): HasManyRef<TItem> {
		const effectiveAlias = alias ?? fieldName
		const cacheKey = `hasMany:${effectiveAlias}`
		const cached = this.relationHandleCache.get(cacheKey)

		if (cached) {
			return cached.proxy as HasManyRef<TItem>
		}

		const targetType = this.schema.getRelationTarget(this.entityType, fieldName)
		if (!targetType) {
			throw new Error(
				`Field "${fieldName}" is not a relation on entity "${this.entityType}"`,
			)
		}

		const handle = HasManyListHandle.create<TItem>(
			this.entityType,
			this.entityId,
			fieldName,
			targetType,
			this.store,
			this.dispatcher,
			this.schema,
			this.__brands,
			effectiveAlias,
			nestedSelection,
		)
		this.relationHandleCache.set(cacheKey, { raw: handle, proxy: handle } as unknown as CachedHandle<RelationHandleRaw, HasOneAccessor<object> | HasManyRef<object>>)

		return handle
	}

	/**
	 * Gets a raw (unproxied) has-one relation handle from cache.
	 * Creates the handle if not cached yet.
	 */
	private getHasOneHandleRaw(fieldName: string): HasOneHandle<object> {
		const cacheKey = `hasOne:${fieldName}`
		const cached = this.relationHandleCache.get(cacheKey)

		if (cached) {
			return cached.raw as HasOneHandle<object>
		}

		const targetType = this.schema.getRelationTarget(this.entityType, fieldName)
		if (!targetType) {
			throw new Error(
				`Field "${fieldName}" is not a relation on entity "${this.entityType}"`,
			)
		}

		const raw = HasOneHandle.createRaw(
			this.entityType,
			this.entityId,
			fieldName,
			targetType,
			this.store,
			this.dispatcher,
			this.schema,
			undefined,
			undefined,
		)
		const proxy = HasOneHandle.wrapProxy(raw)
		this.relationHandleCache.set(cacheKey, { raw, proxy } as unknown as CachedHandle<RelationHandleRaw, HasOneAccessor<object> | HasManyRef<object>>)

		return raw
	}

	/**
	 * Gets a raw (unproxied) has-many relation handle from cache.
	 * Creates the handle if not cached yet.
	 */
	private getHasManyHandleRaw(fieldName: string): HasManyRef<object> {
		const cacheKey = `hasMany:${fieldName}`
		const cached = this.relationHandleCache.get(cacheKey)

		if (cached) {
			return cached.proxy as HasManyRef<object>
		}

		const targetType = this.schema.getRelationTarget(this.entityType, fieldName)
		if (!targetType) {
			throw new Error(
				`Field "${fieldName}" is not a relation on entity "${this.entityType}"`,
			)
		}

		const handle = HasManyListHandle.create(
			this.entityType,
			this.entityId,
			fieldName,
			targetType,
			this.store,
			this.dispatcher,
			this.schema,
			this.__brands,
			fieldName,
			undefined,
		)
		this.relationHandleCache.set(cacheKey, { raw: handle, proxy: handle } as unknown as CachedHandle<RelationHandleRaw, HasOneAccessor<object> | HasManyRef<object>>)

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
		for (const { raw } of this.relationHandleCache.values()) {
			raw.reset()
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

		for (const { raw } of this.fieldHandleCache.values()) {
			raw.dispose()
		}
		this.fieldHandleCache.clear()

		for (const { raw } of this.relationHandleCache.values()) {
			raw.dispose()
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
				// Selection validation
				if (this.selection && !this.selection.fields.has(fieldName)) {
					throw new UnfetchedFieldError(this.entityType, this.entityId, [fieldName])
				}

				const nestedSelection = this.selection?.fields.get(fieldName)?.nested

				// Use schema to determine field type
				const fieldDef = this.schema.getFieldDef(this.entityType, fieldName)

				if (!fieldDef || fieldDef.type === 'scalar') {
					// Scalar field - return FieldHandle
					return this.field(fieldName as keyof T)
				}

				if (fieldDef.type === 'hasOne') {
					// Has-one relation - return HasOneHandle
					return this.hasOne(fieldName, nestedSelection)
				}

				if (fieldDef.type === 'hasMany') {
					// Has-many relation - return HasManyListHandle
					return this.hasMany(fieldName, undefined, nestedSelection)
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
	 * Entity name for type inference.
	 * Carries the entity type name (e.g., 'Article', 'Author').
	 * Implements EntityRef.__entityName.
	 */
	get __entityName(): string {
		return this.entityType
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
