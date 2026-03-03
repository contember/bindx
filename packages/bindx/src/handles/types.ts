/**
 * Unified type definitions for the Handle system.
 *
 * This module provides type-safe field accessor mapping that correctly
 * distinguishes between scalar fields, hasOne relations, and hasMany relations.
 *
 * Type hierarchy uses inheritance for implicit/explicit selection modes:
 * - Base types (e.g., FieldRefBase) - work everywhere, no direct value access
 * - Full types (e.g., FieldRef) extend Base - add .value, .length, etc.
 *
 * Components accept Base types, so they work with both implicit and explicit selection.
 */

import type { FieldHandle } from './FieldHandle.js'

// ============================================================================
// Relation State Types
// ============================================================================

/**
 * State of a has-one relation.
 */
export type HasOneRelationState =
	| 'connected' // Points to an existing entity
	| 'disconnected' // Explicitly set to null
	| 'deleted' // Related entity marked for deletion
	| 'creating' // Placeholder entity being filled for implicit create

import type { ComponentBrand, AnyBrand } from '../brand/ComponentBrand.js'
import type { FieldError, ErrorInput } from '../errors/types.js'
import type {
	FieldChangedEvent,
	FieldChangingEvent,
	RelationConnectedEvent,
	RelationDisconnectedEvent,
	RelationConnectingEvent,
	RelationDisconnectingEvent,
	HasManyConnectedEvent,
	HasManyDisconnectedEvent,
	HasManyConnectingEvent,
	HasManyDisconnectingEvent,
	EntityPersistedEvent,
	EntityPersistingEvent,
	EventTypeMap,
	AfterEventTypes,
	BeforeEventTypes,
	EventListener,
	Interceptor,
	Unsubscribe as UnsubscribeType,
} from '../events/types.js'

// Re-export Unsubscribe for convenience
export type { UnsubscribeType as Unsubscribe }

// ============================================================================
// Field Type Detection Utilities
// ============================================================================

/**
 * Extracts scalar field keys from a type.
 * A field is scalar if it's not an array and not an object (except 'id' which is always scalar).
 */
export type ScalarKeys<T> = {
	[K in keyof T]: T[K] extends (infer _U)[]
		? never
		: NonNullable<T[K]> extends object
			? K extends 'id'
				? K
				: never
			: K
}[keyof T]

/**
 * Extracts has-many relation keys from a type.
 * A field is has-many if it's an array of objects.
 */
export type HasManyKeys<T> = {
	[K in keyof T]: T[K] extends (infer U)[]
		? U extends object
			? K
			: never
		: never
}[keyof T]

/**
 * Extracts has-one relation keys from a type.
 * A field is has-one if it's an object (but not 'id' and not an array).
 */
export type HasOneKeys<T> = {
	[K in keyof T]: T[K] extends (infer _U)[]
		? never
		: NonNullable<T[K]> extends object
			? K extends 'id'
				? never
				: K
			: never
}[keyof T]

// ============================================================================
// Symbols
// ============================================================================

/**
 * Marker symbol for field reference metadata
 */
export const FIELD_REF_META = Symbol('FIELD_REF_META')

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Base metadata interface for all field references.
 * Used by JSX components for selection collection.
 */
export interface FieldRefMeta<TEntityName extends string = string> {
	readonly entityType: TEntityName
	readonly entityId: string
	readonly path: string[]
	readonly fieldName: string
	readonly isArray: boolean
	readonly isRelation: boolean
}

/**
 * Input props interface for form binding.
 */
export interface InputProps<T> {
	readonly value: T | null
	readonly setValue: (value: T | null) => void
	readonly onChange: (value: T | null) => void
}

/**
 * Extracts the nested selection type for a relation field.
 */
type ExtractNestedSelection<TSelected, K extends PropertyKey> =
	K extends keyof TSelected ? TSelected[K] : never

/**
 * Reverse lookup: finds entity name (schema key) from entity type.
 */
export type EntityNameFromType<TSchema extends Record<string, object>, TEntityType> = {
	[K in keyof TSchema]: TSchema[K] extends TEntityType ? K : never
}[keyof TSchema] & string

// ============================================================================
// SCALAR FIELD TYPES
// ============================================================================

/**
 * Base interface for scalar field references.
 * Works everywhere, can be passed to components.
 * Does NOT include .value, .serverValue, .isDirty - use FieldRef for those.
 *
 * @example
 * ```tsx
 * // In implicit mode, task.title is FieldRefBase<string>
 * // Can be passed to <Field>:
 * <Field field={task.title} />
 *
 * // Can use mutations:
 * task.title.setValue('new value')
 *
 * // Cannot read value directly (use FieldRef for that):
 * // task.title.value  // ❌ type error
 * ```
 */
export interface FieldRefBase<T> {
	/** Internal metadata for collection phase */
	readonly [FIELD_REF_META]: FieldRefMeta

	/** Whether field has been touched (interacted with by user) */
	readonly isTouched: boolean

	/** Mark the field as touched */
	touch(): void

	/** Update the value */
	setValue(value: T | null): void

	/** Input binding props */
	readonly inputProps: InputProps<T>

	/** List of errors on this field */
	readonly errors: readonly FieldError[]

	/** Whether this field has any errors */
	readonly hasError: boolean

	/** Add a client-side error to this field */
	addError(error: ErrorInput): void

	/** Clear all errors from this field */
	clearErrors(): void

	/** Subscribe to field value changes */
	onChange(listener: EventListener<FieldChangedEvent>): UnsubscribeType

	/** Intercept field value changes (can cancel or modify) */
	onChanging(interceptor: Interceptor<FieldChangingEvent>): UnsubscribeType
}

/**
 * Full interface for scalar field references.
 * Extends FieldRefBase with value access properties.
 *
 * @example
 * ```tsx
 * // In explicit mode, task.title is FieldRef<string>
 * // Full access including value:
 * const title = task.title.value
 * const isDirty = task.title.isDirty
 * ```
 */
export interface FieldRef<T> extends FieldRefBase<T> {
	/** Current value (null in collection phase, real value in runtime) */
	readonly value: T | null

	/** Server value for dirty tracking */
	readonly serverValue: T | null

	/** Whether value differs from server */
	readonly isDirty: boolean
}

// ============================================================================
// HAS-MANY RELATION TYPES
// ============================================================================

/**
 * Base interface for has-many relation references.
 * Works everywhere, can be passed to components.
 * Does NOT include .length, .items, .map - use HasManyRef for those.
 *
 * @example
 * ```tsx
 * // In implicit mode, task.developers is HasManyRefBase
 * // Can be passed to <HasMany>:
 * <HasMany field={task.developers}>{dev => ...}</HasMany>
 *
 * // Can use mutations:
 * task.developers.add()
 * task.developers.remove(id)
 *
 * // Cannot read length directly (use HasManyRef for that):
 * // task.developers.length  // ❌ type error
 * ```
 */
export interface HasManyRefBase<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	/** Internal metadata for collection phase */
	readonly [FIELD_REF_META]: FieldRefMeta<TEntityName>

	/** Whether any item has been modified */
	readonly isDirty: boolean

	/** Add a new item - returns the new entity's ID (temp ID) */
	add(data?: Partial<TEntity>): string

	/** Remove item by ID */
	remove(itemId: string): void

	/** Move item from one position to another */
	move(fromIndex: number, toIndex: number): void

	/** Connect an existing entity to this has-many relation */
	connect(itemId: string): void

	/** Disconnect an entity from this has-many relation */
	disconnect(itemId: string | null): void

	/** Reset the relation to server state */
	reset(): void

	/** Type brand - ensures HasManyRef<Author> is not assignable to HasManyRef<Tag> */
	readonly __entityType: TEntity

	/** Type brand for entity name */
	readonly __entityName: TEntityName

	/** Type brand for schema */
	readonly __schema?: TSchema & any

	/** Runtime brand symbols for validation */
	readonly __brands?: Set<symbol>

	/** List of errors on this relation */
	readonly errors: readonly FieldError[]

	/** Whether this relation has any errors */
	readonly hasError: boolean

	/** Add a client-side error to this relation */
	addError(error: ErrorInput): void

	/** Clear all errors from this relation */
	clearErrors(): void

	/** Subscribe to item connected events */
	onItemConnected(listener: EventListener<HasManyConnectedEvent>): UnsubscribeType

	/** Subscribe to item disconnected events */
	onItemDisconnected(listener: EventListener<HasManyDisconnectedEvent>): UnsubscribeType

	/** Intercept item connection (can cancel) */
	interceptItemConnecting(interceptor: Interceptor<HasManyConnectingEvent>): UnsubscribeType

	/** Intercept item disconnection (can cancel) */
	interceptItemDisconnecting(interceptor: Interceptor<HasManyDisconnectingEvent>): UnsubscribeType
}

/**
 * Full interface for has-many relation references.
 * Extends HasManyRefBase with collection access properties.
 */
export interface HasManyRef<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> extends HasManyRefBase<TEntity, TSelected, TBrand, TEntityName, TSchema> {
	/** Number of items */
	readonly length: number

	/** Direct access to items array */
	readonly items: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>[]

	/** Iterate over items */
	map<R>(fn: (item: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>, index: number) => R): R[]
}

// ============================================================================
// HAS-ONE RELATION TYPES
// ============================================================================

/**
 * Base interface for has-one relation references.
 * Works everywhere, can be passed to components.
 * Does NOT include .$state, .$entity, .$fields, .$data - use HasOneRef for those.
 * DOES include direct field access (e.g., task.project.name).
 *
 * @example
 * ```tsx
 * // In implicit mode, task.project is HasOneRefBase (with direct field access)
 * // Can be passed to <HasOne>:
 * <HasOne field={task.project}>{project => ...}</HasOne>
 *
 * // Can access nested fields (they are also restricted):
 * task.project.name  // FieldRefBase<string>
 *
 * // Can use mutations:
 * task.project.$connect('project-1')
 *
 * // Cannot read state directly (use HasOneRef for that):
 * // task.project.$state  // ❌ type error
 * ```
 */
export interface HasOneRefBase<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	/** Internal metadata for collection phase */
	readonly [FIELD_REF_META]: FieldRefMeta<TEntityName>

	/** Entity ID (placeholder ID if disconnected) */
	readonly id: string

	/** Entity ID (alias with $ prefix) */
	readonly $id: string

	/** Whether relation is dirty */
	readonly $isDirty: boolean

	/** Whether this entity is new */
	readonly $isNew: boolean

	/** Server-assigned ID after persistence */
	readonly $persistedId: string | null

	/** Type brand for entity name */
	readonly __entityName: TEntityName

	/** Type brand for schema */
	readonly __schema?: TSchema & any

	/** Type brand - ensures type safety */
	readonly __entityType: TEntity

	/** Runtime brand symbols for validation */
	readonly __brands?: Set<symbol>

	/** Connect to existing entity */
	$connect(id: string): void

	/** Disconnect relation */
	$disconnect(): void

	/** Mark relation for deletion */
	$delete(): void

	/** Reset the relation to server state */
	$reset(): void

	/** List of errors on this relation */
	readonly $errors: readonly FieldError[]

	/** Whether this relation has any errors */
	readonly $hasError: boolean

	/** Add a client-side error to this relation */
	$addError(error: ErrorInput): void

	/** Clear all errors from this relation */
	$clearErrors(): void

	/** Clear all errors (entity-level, fields, and relations) */
	$clearAllErrors(): void

	/** Subscribe to connection events */
	$onConnect(listener: EventListener<RelationConnectedEvent>): UnsubscribeType

	/** Subscribe to disconnection events */
	$onDisconnect(listener: EventListener<RelationDisconnectedEvent>): UnsubscribeType

	/** Intercept connection (can cancel or modify target) */
	$interceptConnect(interceptor: Interceptor<RelationConnectingEvent>): UnsubscribeType

	/** Intercept disconnection (can cancel) */
	$interceptDisconnect(interceptor: Interceptor<RelationDisconnectingEvent>): UnsubscribeType

	/** Subscribe to any event on the related entity */
	$on<E extends AfterEventTypes>(
		eventType: E,
		listener: EventListener<EventTypeMap[E]>,
	): UnsubscribeType

	/** Intercept any before event on the related entity */
	$intercept<E extends BeforeEventTypes>(
		eventType: E,
		interceptor: Interceptor<EventTypeMap[E]>,
	): UnsubscribeType

	/** Subscribe to persist success events */
	$onPersisted(listener: EventListener<EntityPersistedEvent>): UnsubscribeType

	/** Intercept persist (can cancel) */
	$interceptPersisting(interceptor: Interceptor<EntityPersistingEvent>): UnsubscribeType
}

/**
 * Full interface for has-one relation references.
 * Extends HasOneRefBase with state and entity access properties.
 */
export interface HasOneRef<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> extends HasOneRefBase<TEntity, TSelected, TBrand, TEntityName, TSchema> {
	/** Raw data snapshot of the related entity */
	readonly $data: TSelected | null

	/** Relation state */
	readonly $state: HasOneRelationState

	/** Nested entity fields - only selected fields are accessible */
	readonly $fields: SelectedEntityFields<TEntity, TSelected, TSchema>

	/** Related entity accessor with direct field access */
	readonly $entity: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>
}

/**
 * HasOneRefBase with direct field access via Proxy (for implicit mode).
 */
export type HasOneAccessorBase<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> = HasOneRefBase<TEntity, TSelected, TBrand, TEntityName, TSchema> &
	SelectedEntityFieldsBase<TEntity, TSelected, TSchema>

/**
 * HasOneRef with direct field access via Proxy (for explicit mode).
 */
export type HasOneAccessor<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> = HasOneRef<TEntity, TSelected, TBrand, TEntityName, TSchema> &
	SelectedEntityFields<TEntity, TSelected, TSchema>

// ============================================================================
// ENTITY TYPES
// ============================================================================

/**
 * Base interface for entity references.
 * Works everywhere, can be passed to components.
 * Does NOT include .$data, .$fields - use EntityRef for those.
 */
export interface EntityRefBase<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	/** Entity ID */
	readonly id: string

	/** Whether entity is dirty */
	readonly $isDirty: boolean

	/** Server-assigned ID after persistence */
	readonly $persistedId: string | null

	/** Whether this entity is new */
	readonly $isNew: boolean

	/** Type brand - ensures type safety */
	readonly __entityType: TEntity

	/** Type brand for schema */
	readonly __schema?: TSchema & any

	/** Type brand for entity name */
	readonly __entityName: TEntityName

	/** Runtime brand symbols for validation */
	readonly __brands?: Set<symbol>

	/** List of entity-level errors */
	readonly $errors: readonly FieldError[]

	/** Whether this entity has any errors */
	readonly $hasError: boolean

	/** Add a client-side error to this entity */
	$addError(error: ErrorInput): void

	/** Clear entity-level errors */
	$clearErrors(): void

	/** Clear all errors (entity-level, fields, and relations) */
	$clearAllErrors(): void

	/** Subscribe to any event on this entity */
	$on<E extends AfterEventTypes>(
		eventType: E,
		listener: EventListener<EventTypeMap[E]>,
	): UnsubscribeType

	/** Intercept any before event on this entity */
	$intercept<E extends BeforeEventTypes>(
		eventType: E,
		interceptor: Interceptor<EventTypeMap[E]>,
	): UnsubscribeType

	/** Subscribe to persist success events */
	$onPersisted(listener: EventListener<EntityPersistedEvent>): UnsubscribeType

	/** Intercept persist (can cancel) */
	$interceptPersisting(interceptor: Interceptor<EntityPersistingEvent>): UnsubscribeType
}

/**
 * Full interface for entity references.
 * Extends EntityRefBase with data access properties.
 */
export interface EntityRef<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> extends EntityRefBase<TEntity, TSelected, TBrand, TEntityName, TSchema> {
	/** Typed field accessors */
	readonly $fields: SelectedEntityFields<TEntity, TSelected, TSchema>

	/** Raw data snapshot */
	readonly $data: TSelected | null
}

/**
 * EntityRefBase with direct field access via Proxy (for implicit mode).
 */
export type EntityAccessorBase<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> = EntityRefBase<TEntity, TSelected, TBrand, TEntityName, TSchema> &
	SelectedEntityFieldsBase<TEntity, TSelected, TSchema>

/**
 * EntityRef with direct field access via Proxy (for explicit mode).
 */
export type EntityAccessor<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> = EntityRef<TEntity, TSelected, TBrand, TEntityName, TSchema> &
	SelectedEntityFields<TEntity, TSelected, TSchema>

// ============================================================================
// ENTITY FIELDS MAPPING TYPES
// ============================================================================

/**
 * Maps entity fields to their correct Handle types based on structural typing.
 * Uses full types (FieldHandle, HasManyRef, HasOneRef) for backwards compatibility.
 */
export type EntityFields<T> = {
	[K in ScalarKeys<T>]: FieldHandle<T[K]>
} & {
	[K in HasManyKeys<T>]: T[K] extends (infer U)[]
		? U extends object
			? HasManyRef<U>
			: never
		: never
} & {
	[K in HasOneKeys<T>]: HasOneRef<NonNullable<T[K]>>
}

/**
 * Maps entity fields to Base types (restricted, for implicit mode).
 * These types can be passed to components but don't allow direct value access.
 */
export type SelectedEntityFieldsBase<
	TEntity,
	TSelected,
	TSchema extends Record<string, object> = Record<string, object>,
> = {
	[K in ScalarKeys<TEntity> & keyof TSelected]: FieldRefBase<TEntity[K]>
} & {
	[K in HasManyKeys<TEntity> & keyof TSelected]: TEntity[K] extends (infer U)[]
		? U extends object
			? HasManyRefBase<U, ExtractNestedSelection<TSelected, K> extends (infer S)[] ? S : U, AnyBrand, EntityNameFromType<TSchema, U>, TSchema>
			: never
		: never
} & {
	[K in HasOneKeys<TEntity> & keyof TSelected]: HasOneAccessorBase<
		NonNullable<TEntity[K]>,
		ExtractNestedSelection<TSelected, K> extends object ? ExtractNestedSelection<TSelected, K> : NonNullable<TEntity[K]>,
		AnyBrand,
		EntityNameFromType<TSchema, NonNullable<TEntity[K]>>,
		TSchema
	>
}

/**
 * Maps entity fields to Full types (for explicit mode).
 * These types allow direct value access.
 */
export type SelectedEntityFields<
	TEntity,
	TSelected,
	TSchema extends Record<string, object> = Record<string, object>,
> = {
	[K in ScalarKeys<TEntity> & keyof TSelected]: FieldRef<TEntity[K]>
} & {
	[K in HasManyKeys<TEntity> & keyof TSelected]: TEntity[K] extends (infer U)[]
		? U extends object
			? HasManyRef<U, ExtractNestedSelection<TSelected, K> extends (infer S)[] ? S : U, AnyBrand, EntityNameFromType<TSchema, U>, TSchema>
			: never
		: never
} & {
	[K in HasOneKeys<TEntity> & keyof TSelected]: HasOneAccessor<
		NonNullable<TEntity[K]>,
		ExtractNestedSelection<TSelected, K> extends object ? ExtractNestedSelection<TSelected, K> : NonNullable<TEntity[K]>,
		AnyBrand,
		EntityNameFromType<TSchema, NonNullable<TEntity[K]>>,
		TSchema
	>
}

// ============================================================================
// Type Extraction Helpers
// ============================================================================

export type ExtractHasOneEntityName<T> =
	T extends HasOneRef<any, any, any, infer TEntityName, any>
		? TEntityName
		: T extends HasOneRefBase<any, any, any, infer TEntityName, any>
			? TEntityName
			: never

export type ExtractHasManyEntityName<T> =
	T extends HasManyRef<any, any, any, infer TEntityName, any>
		? TEntityName
		: T extends HasManyRefBase<any, any, any, infer TEntityName, any>
			? TEntityName
			: never

