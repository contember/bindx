import type { ActionDispatcher } from '../core/ActionDispatcher.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import { generatePlaceholderId } from '../store/SnapshotStore.js'
import {
	FIELD_REF_META,
	type EntityRef,
	type SelectedEntityFields,
	type FieldRefMeta,
	type Unsubscribe,
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
import { createAliasProxy } from './proxyFactory.js'

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

	private constructor(
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
	}

	static create<TEntity extends object = object, TSelected = TEntity>(
		parentEntityType: string,
		parentEntityId: string,
		fieldName: string,
		targetType: string,
		store: SnapshotStore,
		dispatcher: ActionDispatcher,
		brands?: Set<symbol>,
	): PlaceholderHandle<TEntity, TSelected> {
		return createAliasProxy(new PlaceholderHandle<TEntity, TSelected>(parentEntityType, parentEntityId, fieldName, targetType, store, dispatcher, brands))
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
