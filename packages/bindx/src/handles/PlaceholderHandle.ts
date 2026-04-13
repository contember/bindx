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
	 * Placeholder entities have no persisted ID — returns placeholder ID.
	 */
	get resolvedId(): string {
		return this.placeholderId
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
	 * Creates a field handle for placeholder data.
	 * For has-many relations, returns an empty has-many-like handle with items/map/length.
	 */
	private createPlaceholderFieldHandle(fieldName: string): unknown {
		// For has-many relations, return an empty has-many-like handle
		if (this.schema?.isHasMany(this.targetType, fieldName)) {
			const emptyItems: EntityAccessor<object>[] = []
			const emptyHasMany: Record<string, unknown> = {
				get items() { return emptyItems },
				get length() { return 0 },
				map: () => [],
				add: () => { throw new Error(`Cannot add items to disconnected has-many relation "${fieldName}" on placeholder entity`) },
				remove: () => {},
				$state: 'disconnected',
				[Symbol.iterator]: () => emptyItems[Symbol.iterator](),
			}
			return emptyHasMany
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
