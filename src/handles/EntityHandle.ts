import { EntityRelatedHandle } from './BaseHandle.js'
import { FieldHandle } from './FieldHandle.js'
import type { ActionDispatcher } from '../core/ActionDispatcher.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import type { SchemaRegistry } from '../schema/SchemaRegistry.js'
import type { EntitySnapshot } from '../store/snapshots.js'
import { resetEntity, commitEntity } from '../core/actions.js'
import { FIELD_REF_META, type HasOneRef, type HasManyRef, type FieldRefMeta } from '../jsx/types.js'
import type { EntityFields } from './types.js'

// Type for relation handle cache
type RelationHandle = HasOneHandle<object> | HasManyListHandle<object>

/**
 * EntityHandle provides stable access to an entity.
 *
 * Key characteristics:
 * - Stable identity (same instance across renders when id doesn't change)
 * - Provides field handles for individual fields
 * - Provides relation handles for has-one and has-many relations
 * - Tracks dirty state across all fields
 */
export class EntityHandle<T extends object = object> extends EntityRelatedHandle {
	/** Cache for field handles to ensure stable identity */
	private readonly fieldHandleCache = new Map<string, FieldHandle<unknown>>()

	/** Cache for relation handles */
	private readonly relationHandleCache = new Map<string, RelationHandle>()

	constructor(
		id: string,
		entityType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		private readonly schema: SchemaRegistry,
	) {
		super(entityType, id, store, dispatcher)
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
	 */
	get data(): T | null {
		const snapshot = this.getSnapshot()
		return snapshot?.data ?? null
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
	 */
	get isDirty(): boolean {
		const snapshot = this.getSnapshot()
		if (!snapshot) return false

		return !deepEqual(snapshot.data, snapshot.serverData)
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
	 */
	hasMany<TItem extends object>(fieldName: string): HasManyListHandle<TItem> {
		const cacheKey = `hasMany:${fieldName}`
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
		)
		this.relationHandleCache.set(cacheKey, handle as RelationHandle)

		return handle
	}

	/**
	 * Resets the entity to server data.
	 */
	reset(): void {
		this.assertNotDisposed()
		this.dispatcher.dispatch(resetEntity(this.entityType, this.entityId))
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
	 */
	get fields(): EntityFields<T> {
		return new Proxy({} as EntityFields<T>, {
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
}

/**
 * HasOneHandle provides access to a has-one relation.
 * Implements HasOneRef interface for JSX compatibility.
 */
export class HasOneHandle<T extends object = object> extends EntityRelatedHandle implements HasOneRef<T> {
	private entityHandleCache: EntityHandle<T> | null = null

	constructor(
		parentEntityType: string,
		parentEntityId: string,
		private readonly fieldName: string,
		private readonly targetType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		private readonly schema: SchemaRegistry,
	) {
		super(parentEntityType, parentEntityId, store, dispatcher)
	}

	/**
	 * JSX field reference metadata for collection phase.
	 * Implements HasOneRef interface.
	 */
	get [FIELD_REF_META](): FieldRefMeta {
		return {
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
	 */
	get relatedId(): string | null {
		const relation = this.store.getRelation(
			this.entityType,
			this.entityId,
			this.fieldName,
		)
		return relation?.currentId ?? null
	}

	/**
	 * Gets the related entity ID.
	 * Alias for relatedId - implements HasOneRef interface.
	 */
	get id(): string | null {
		return this.relatedId
	}

	/**
	 * Gets the nested entity fields.
	 * Implements HasOneRef interface.
	 * Returns proxy with null values if relation is disconnected.
	 */
	get fields(): EntityFields<T> {
		const entity = this.entity
		if (!entity) {
			// Return proxy that returns null FieldHandles for disconnected relations
			return createNullFieldsProxy<T>()
		}
		return entity.fields
	}

	/**
	 * Gets the related entity handle if connected.
	 */
	get entity(): EntityHandle<T> | null {
		const id = this.relatedId
		if (!id) return null

		if (!this.entityHandleCache || this.entityHandleCache.id !== id) {
			this.entityHandleCache = new EntityHandle<T>(
				id,
				this.targetType,
				this.store,
				this.dispatcher,
				this.schema,
			)
		}

		return this.entityHandleCache
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
		this.store.setRelation(this.entityType, this.entityId, this.fieldName, {
			currentId: targetId,
			state: 'connected',
			placeholderData: {},
		})
	}

	/**
	 * Disconnects the relation.
	 */
	disconnect(): void {
		this.assertNotDisposed()
		this.store.setRelation(this.entityType, this.entityId, this.fieldName, {
			currentId: null,
			state: 'disconnected',
			placeholderData: {},
		})
	}

	/**
	 * Marks the relation for deletion.
	 */
	delete(): void {
		this.assertNotDisposed()
		this.store.setRelation(this.entityType, this.entityId, this.fieldName, {
			state: 'deleted',
		})
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
}

/**
 * HasManyListHandle provides access to a has-many relation (list of entities).
 * Implements HasManyRef interface for JSX compatibility.
 */
export class HasManyListHandle<T extends object = object> extends EntityRelatedHandle implements HasManyRef<T> {
	private itemHandleCache = new Map<string, EntityHandle<T>>()

	constructor(
		parentEntityType: string,
		parentEntityId: string,
		private readonly fieldName: string,
		private readonly itemType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		private readonly schema: SchemaRegistry,
	) {
		super(parentEntityType, parentEntityId, store, dispatcher)
	}

	/**
	 * JSX field reference metadata for collection phase.
	 * Implements HasManyRef interface.
	 */
	get [FIELD_REF_META](): FieldRefMeta {
		return {
			path: [this.fieldName],
			fieldName: this.fieldName,
			isArray: true,
			isRelation: true,
		}
	}

	/**
	 * Gets the list of items as entity handles.
	 */
	get items(): EntityHandle<T>[] {
		const data = this.getEntityData()
		if (!data) return []

		const listData = data[this.fieldName] as Array<{ id: string }> | undefined
		if (!Array.isArray(listData)) return []

		return listData.map((item) => this.getItemHandle(item.id))
	}

	/**
	 * Gets the number of items.
	 */
	get length(): number {
		return this.items.length
	}

	/**
	 * Gets a handle for a specific item.
	 */
	getItemHandle(itemId: string): EntityHandle<T> {
		let handle = this.itemHandleCache.get(itemId)

		if (!handle) {
			handle = new EntityHandle<T>(
				itemId,
				this.itemType,
				this.store,
				this.dispatcher,
				this.schema,
			)
			this.itemHandleCache.set(itemId, handle)
		}

		return handle
	}

	/**
	 * Checks if the list is dirty (items added/removed/reordered).
	 */
	get isDirty(): boolean {
		// TODO: Implement proper dirty tracking for lists
		return false
	}

	/**
	 * Maps over items.
	 * Implements HasManyRef interface.
	 */
	map<R>(fn: (handle: EntityHandle<T>, index: number) => R): R[] {
		return this.items.map(fn)
	}

	/**
	 * Adds a new item to the list.
	 * Implements HasManyRef interface.
	 */
	add(_data?: Partial<T>): void {
		// TODO: Implement add - requires store support for list mutations
		this.assertNotDisposed()
	}

	/**
	 * Removes an item from the list by key.
	 * Implements HasManyRef interface.
	 */
	remove(_key: string): void {
		// TODO: Implement remove - requires store support for list mutations
		this.assertNotDisposed()
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
}

// ==================== Helper Functions ====================

/**
 * Creates a proxy that returns null FieldHandle-like objects for disconnected relations.
 * Used when a HasOneHandle's relation is disconnected but code still accesses fields.
 */
function createNullFieldsProxy<T extends object>(): EntityFields<T> {
	return new Proxy({} as EntityFields<T>, {
		get(_, fieldName: string) {
			// Return a minimal FieldHandle-like object with null values
			return {
				[FIELD_REF_META]: {
					path: [fieldName],
					fieldName,
					isArray: false,
					isRelation: false,
				},
				value: null,
				serverValue: null,
				isDirty: false,
				setValue: () => {},
				inputProps: {
					value: null,
					setValue: () => {},
					onChange: () => {},
				},
				path: [fieldName],
				fieldName,
			}
		},
	})
}

/**
 * Deep equality check for values.
 */
function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true
	if (a === null || b === null) return false
	if (typeof a !== 'object' || typeof b !== 'object') return false

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false
		for (let i = 0; i < a.length; i++) {
			if (!deepEqual(a[i], b[i])) return false
		}
		return true
	}

	if (Array.isArray(a) || Array.isArray(b)) return false

	const keysA = Object.keys(a as object)
	const keysB = Object.keys(b as object)

	if (keysA.length !== keysB.length) return false

	for (const key of keysA) {
		if (!keysB.includes(key)) return false
		if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
			return false
		}
	}

	return true
}
