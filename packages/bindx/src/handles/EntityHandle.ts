import { EntityRelatedHandle } from './BaseHandle.js'
import { FieldHandle } from './FieldHandle.js'
import type { ActionDispatcher } from '../core/ActionDispatcher.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import type { SchemaRegistry } from '../schema/SchemaRegistry.js'
import type { EntitySnapshot } from '../store/snapshots.js'
import { resetEntity, commitEntity } from '../core/actions.js'
import { FIELD_REF_META, type HasOneRef, type HasManyRef, type FieldRefMeta, type EntityRef, type EntityFields, type SelectedEntityFields } from './types.js'
import { deepEqual } from '../utils/deepEqual.js'

// Type for relation handle cache
type RelationHandle = HasOneHandle<object> | HasManyListHandle<object>

/**
 * EntityHandle provides stable access to an entity.
 * Implements EntityRef interface for consistent usage across the system.
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
	 * Alias for relatedId - implements HasOneRef interface.
	 */
	get id(): string | null {
		return this.relatedId
	}

	/**
	 * Gets the nested entity fields.
	 * Implements HasOneRef interface.
	 * Delegates to the entity (either real EntityHandle or PlaceholderHandle).
	 */
	get fields(): SelectedEntityFields<TEntity, TSelected> {
		return this.entity.fields
	}

	/**
	 * Gets the related entity reference.
	 * Implements HasOneRef.entity - returns EntityRef for the related entity.
	 * Returns PlaceholderHandle (with id=null) if the relation is disconnected.
	 */
	get entity(): EntityRef<TEntity, TSelected> {
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
			return this.entityHandleCache
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
		return this.placeholderCache
	}

	/**
	 * Ensures the related entity has a snapshot in the store.
	 * If the related entity is embedded in the parent's data (not yet normalized),
	 * creates a snapshot from the embedded data.
	 */
	private ensureRelatedEntitySnapshot(id: string): void {
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
		this.store.setEntityData(
			this.targetType,
			id,
			embeddedData as Record<string, unknown>,
			true, // isServerData
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

	/**
	 * Type brand - ensures HasOneRef<Author> is not assignable to HasOneRef<Tag>.
	 * This is a phantom property that only exists in the type system.
	 */
	get __entityType(): TEntity {
		return undefined as unknown as TEntity
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

	constructor(
		parentEntityType: string,
		parentEntityId: string,
		private readonly fieldName: string,
		private readonly itemType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		private readonly schema: SchemaRegistry,
		brands?: Set<symbol>,
	) {
		super(parentEntityType, parentEntityId, store, dispatcher)
		this.__brands = brands
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
	 * Returns selection-aware EntityHandles that implement EntityRef.
	 */
	get items(): EntityHandle<TEntity, TSelected>[] {
		const data = this.getEntityData()
		if (!data) return []

		const listData = data[this.fieldName] as Array<{ id: string }> | undefined
		if (!Array.isArray(listData)) return []

		// Ensure snapshots exist for embedded items
		this.ensureItemSnapshots(listData)

		return listData.map((item) => this.getItemHandle(item.id))
	}

	/**
	 * Ensures snapshots exist for embedded has-many items.
	 */
	private ensureItemSnapshots(listData: Array<Record<string, unknown>>): void {
		for (const itemData of listData) {
			const itemId = itemData['id'] as string
			if (!itemId) continue

			// Skip if snapshot already exists
			if (this.store.hasEntity(this.itemType, itemId)) {
				continue
			}

			// Create snapshot from embedded data
			this.store.setEntityData(
				this.itemType,
				itemId,
				itemData,
				true, // isServerData
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
	 * Returns selection-aware EntityHandle that implements EntityRef.
	 */
	getItemHandle(itemId: string): EntityHandle<TEntity, TSelected> {
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
	 * Implements HasManyRef interface - returns selection-aware entity refs.
	 * EntityHandle implements EntityRef, so handles can be passed directly.
	 */
	map<R>(fn: (item: EntityRef<TEntity, TSelected>, index: number) => R): R[] {
		return this.items.map((handle, index) => fn(handle, index))
	}

	/**
	 * Adds a new item to the list.
	 * Implements HasManyRef interface.
	 */
	add(_data?: Partial<TEntity>): void {
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

	/**
	 * Type brand - ensures HasManyRef<Author> is not assignable to HasManyRef<Tag>.
	 * This is a phantom property that only exists in the type system.
	 */
	get __entityType(): TEntity {
		return undefined as unknown as TEntity
	}
}

// ==================== Placeholder Handle ====================

/**
 * PlaceholderHandle provides access to a placeholder entity (for creating new entities).
 * Implements EntityRef interface with id = null.
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
	}

	/**
	 * Placeholder entities have no ID.
	 */
	get id(): null {
		return null
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
		}
	}

	/**
	 * Type brand for EntityRef compatibility.
	 */
	get __entityType(): TEntity {
		return undefined as unknown as TEntity
	}
}

// ==================== Helper Functions ====================

/**
 * Creates a proxy that returns null FieldHandle-like objects for disconnected relations.
 * Used when a HasOneHandle's relation is disconnected but code still accesses fields.
 * @deprecated Use PlaceholderHandle instead
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

