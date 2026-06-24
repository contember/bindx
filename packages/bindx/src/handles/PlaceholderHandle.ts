import type { ActionDispatcher } from '../core/ActionDispatcher.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import { generatePlaceholderId } from '../store/SnapshotStore.js'
import {
	FIELD_REF_META,
	type EntityFieldsAccessor,
	type FieldRefMeta,
	type Unsubscribe,
	type EntityAccessor,
} from './types.js'
import type { ErrorInput, FieldError } from '../errors/types.js'
import type {
	EventTypeMap,
	AfterEventTypes,
	BeforeEventTypes,
	EventListener,
	Interceptor,
	EntityPersistedEvent,
	EntityPersistingEvent,
} from '../events/types.js'
import { createHandleProxy } from './proxyFactory.js'
import { HasManyListHandle } from './HasManyListHandle.js'
import { generateTempId } from '../store/entityId.js'
import { connectRelation } from '../core/actions.js'
import type { SchemaRegistry } from '../schema/SchemaRegistry.js'

/**
 * PlaceholderHandle provides access to a placeholder entity (for creating new entities).
 * Implements EntityRef interface with a placeholder ID.
 * Reads/writes from placeholderData in the relation state.
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields
 */
export class PlaceholderHandle<TEntity extends object = object, TSelected = TEntity> {
	/** Runtime brand symbols for validation */
	readonly __brands?: Set<symbol>

	/** Placeholder ID for this handle */
	private readonly placeholderId: string

	/**
	 * Stable temp id this placeholder collapses into once it must become a real entity
	 * (the first time a child is added to one of its has-many relations). Lazily minted.
	 */
	private materializedId: string | null = null

	private constructor(
		private readonly parentEntityType: string,
		private readonly parentEntityId: string,
		private readonly fieldName: string,
		private readonly targetType: string,
		private readonly store: SnapshotStore,
		private readonly dispatcher: ActionDispatcher,
		private readonly schema: SchemaRegistry | null,
		brands?: Set<symbol>,
	) {
		this.__brands = brands
		this.placeholderId = generatePlaceholderId()
	}

	static create<TEntity extends object = object, TSelected = TEntity>(
		parentEntityType: string,
		parentEntityId: string,
		fieldName: string,
		targetType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		schema?: SchemaRegistry | null,
		brands?: Set<symbol>,
	): EntityAccessor<TEntity, TSelected> {
		return PlaceholderHandle.wrapProxy(new PlaceholderHandle<TEntity, TSelected>(parentEntityType, parentEntityId, fieldName, targetType, store, dispatcher, schema ?? null, brands))
	}

	static createRaw<TEntity extends object = object, TSelected = TEntity>(
		parentEntityType: string,
		parentEntityId: string,
		fieldName: string,
		targetType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		schema?: SchemaRegistry | null,
		brands?: Set<symbol>,
	): PlaceholderHandle<TEntity, TSelected> {
		return new PlaceholderHandle<TEntity, TSelected>(parentEntityType, parentEntityId, fieldName, targetType, store, dispatcher, schema ?? null, brands)
	}

	static wrapProxy<TEntity extends object, TSelected>(handle: PlaceholderHandle<TEntity, TSelected>): EntityAccessor<TEntity, TSelected> {
		return createHandleProxy<PlaceholderHandle<TEntity, TSelected>, EntityAccessor<TEntity, TSelected>>(handle, (target) => target.fields)
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
	 * Placeholder entities are never being persisted.
	 */
	get isPersisting(): boolean {
		return false
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
	get fields(): EntityFieldsAccessor<TEntity, TSelected> {
		return new Proxy({} as EntityFieldsAccessor<TEntity, TSelected>, {
			get: (_, fieldName: string) => {
				return this.createPlaceholderFieldHandle(fieldName)
			},
		})
	}

	/**
	 * Stable temp id this placeholder collapses into when it must become a real entity.
	 */
	private getMaterializedId(): string {
		if (!this.materializedId) this.materializedId = generateTempId()
		return this.materializedId
	}

	/**
	 * Promotes this placeholder into a real (temp) entity connected to its parent relation.
	 * Called lazily the first time a child is added to one of the placeholder's has-many
	 * relations — a has-many child needs a real parent to belong to. The entity is seeded
	 * with whatever placeholder scalar data was typed so far, then connected via the normal
	 * create path, so persist collects both the entity and its children (see collectHasOne/
	 * collectHasManyOperations → create). Idempotent.
	 */
	private materializeIntoParent(): void {
		const tempId = this.getMaterializedId()
		const relation = this.store.getRelation(this.parentEntityType, this.parentEntityId, this.fieldName)
		if (relation?.currentId === tempId) return // already materialized
		if (!this.store.getEntitySnapshot(this.targetType, tempId)) {
			this.store.createEntity(this.targetType, { ...(relation?.placeholderData ?? {}), id: tempId })
		}
		this.dispatcher.dispatch(
			connectRelation(this.parentEntityType, this.parentEntityId, this.fieldName, tempId, this.targetType),
		)
	}

	/**
	 * Creates a field handle for placeholder data.
	 * For has-many relations, returns a real (empty) has-many handle bound to this
	 * placeholder entity, so it behaves identically to a connected one.
	 * For has-one relations, returns a nested placeholder has-one handle so chains like
	 * `<HasOne field={parentPlaceholder.profile}>` materialize an inner placeholder
	 * rather than handing `undefined` to the children callback.
	 */
	private createPlaceholderFieldHandle(fieldName: string): unknown {
		// For has-many relations, return a real HasManyListHandle bound to this placeholder's
		// stable temp id. Hand-rolling a degenerate stub here used to drop FIELD_REF_META,
		// getById and a working add() — which crashed the BlockEditor
		// (`references[FIELD_REF_META].entityType`) on render for any parent without a
		// connected entity yet. Reads stay empty (no snapshot for the temp id until something
		// is added); the first add() promotes the placeholder into a real connected entity
		// (materializeIntoParent) so the children — and the parent itself — round-trip on persist.
		if (this.schema?.isHasMany(this.targetType, fieldName)) {
			const itemType = this.schema.getRelationTarget(this.targetType, fieldName)
			if (!itemType) {
				throw new Error(`Field "${fieldName}" is not a relation on entity "${this.targetType}"`)
			}
			const handle = HasManyListHandle.create(
				this.targetType,
				this.getMaterializedId(),
				fieldName,
				itemType,
				this.store,
				this.dispatcher,
				this.schema,
				this.__brands,
			)
			// Intercept add() to lazily promote the placeholder to a real entity first — a child
			// can't belong to a parent that doesn't exist. Reads pass through untouched.
			return new Proxy(handle as object, {
				get: (target, prop, receiver) => {
					const value = Reflect.get(target, prop, receiver)
					if (prop === 'add' && typeof value === 'function') {
						return (...args: unknown[]): unknown => {
							this.materializeIntoParent()
							return (value as (...a: unknown[]) => unknown).apply(target, args)
						}
					}
					return value
				},
			})
		}

		// For has-one relations, return a placeholder-of-placeholder has-one handle
		if (this.schema?.isHasOne(this.targetType, fieldName)) {
			const innerTargetType = this.schema.getRelationTarget(this.targetType, fieldName)
			if (innerTargetType) {
				return this.createPlaceholderHasOneFieldHandle(fieldName, innerTargetType)
			}
		}

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
			touch(): void {
				// Placeholder fields are not persisted yet, so touch is a no-op
			},
			get isTouched(): boolean {
				return false
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
	 * Creates a nested placeholder has-one handle.
	 *
	 * Used when a placeholder entity (the outer placeholder) is asked for one of its
	 * has-one relations — there is no real parent row, so the inner relation is also
	 * a placeholder. The returned handle exposes the HasOne-shaped surface that
	 * `<HasOne>` JSX relies on (FIELD_REF_META, $entity, $state) plus field-access
	 * proxying so chains like `parentPlaceholder.profile.bio.value` resolve to `null`
	 * instead of throwing.
	 *
	 * Mutations (`$connect`, `$create`) are not supported on nested placeholders —
	 * materialize the outer placeholder first (e.g. by writing to a scalar field or
	 * connecting the outer relation).
	 */
	private createPlaceholderHasOneFieldHandle(fieldName: string, innerTargetType: string): unknown {
		const self = this
		const nestedPlaceholderRaw = PlaceholderHandle.createRaw(
			this.targetType,
			this.placeholderId,
			fieldName,
			innerTargetType,
			this.store,
			this.dispatcher,
			this.schema,
			this.__brands,
		)
		const nestedPlaceholderProxy = PlaceholderHandle.wrapProxy(nestedPlaceholderRaw)
		const fieldRefMeta: FieldRefMeta = {
			entityType: self.targetType,
			entityId: self.placeholderId,
			path: [fieldName],
			fieldName,
			isArray: false,
			isRelation: true,
			targetType: innerTargetType,
		}
		const noopUnsubscribe: Unsubscribe = () => {}

		const handleLike = {
			get [FIELD_REF_META](): FieldRefMeta { return fieldRefMeta },
			get id(): string { return nestedPlaceholderRaw.id },
			get state(): 'disconnected' { return 'disconnected' },
			get isConnected(): boolean { return false },
			get isNew(): boolean { return true },
			get isPersisting(): boolean { return false },
			get isDirty(): boolean { return false },
			get persistedId(): null { return null },
			get data(): null { return null },
			get entity(): EntityAccessor<object> { return nestedPlaceholderProxy },
			get fields() { return nestedPlaceholderRaw.fields },
			get errors(): readonly FieldError[] { return [] },
			get hasError(): boolean { return false },
			get __entityName(): string { return innerTargetType },
			get __entityType(): unknown { return undefined },
			get __brands(): Set<symbol> | undefined { return self.__brands },
			create(): string {
				throw new Error(`Cannot $create on nested placeholder has-one "${fieldName}" — materialize the outer placeholder first`)
			},
			connect(): void {
				throw new Error(`Cannot $connect on nested placeholder has-one "${fieldName}" — materialize the outer placeholder first`)
			},
			disconnect(): void {},
			delete(): void {},
			remove(): void {},
			reset(): void {},
			addError(_error: ErrorInput): void {},
			clearErrors(): void {},
			clearAllErrors(): void {},
			onConnect(_listener: EventListener<EventTypeMap['relation:connected']>): Unsubscribe { return noopUnsubscribe },
			onDisconnect(_listener: EventListener<EventTypeMap['relation:disconnected']>): Unsubscribe { return noopUnsubscribe },
			interceptConnect(_interceptor: Interceptor<EventTypeMap['relation:connecting']>): Unsubscribe { return noopUnsubscribe },
			interceptDisconnect(_interceptor: Interceptor<EventTypeMap['relation:disconnecting']>): Unsubscribe { return noopUnsubscribe },
			on<E extends AfterEventTypes>(_eventType: E, _listener: EventListener<EventTypeMap[E]>): Unsubscribe { return noopUnsubscribe },
			intercept<E extends BeforeEventTypes>(_eventType: E, _interceptor: Interceptor<EventTypeMap[E]>): Unsubscribe { return noopUnsubscribe },
			onPersisted(_listener: EventListener<EntityPersistedEvent>): Unsubscribe { return noopUnsubscribe },
			interceptPersisting(_interceptor: Interceptor<EntityPersistingEvent>): Unsubscribe { return noopUnsubscribe },
			subscribe(_callback: () => void): Unsubscribe { return noopUnsubscribe },
		}

		return createHandleProxy(handleLike, target => target.fields)
	}

	/**
	 * Type brand for EntityRef compatibility.
	 */
	get __entityType(): TEntity {
		return undefined as unknown as TEntity
	}

	/**
	 * Entity name for type inference.
	 */
	get __entityName(): string {
		return this.targetType
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
