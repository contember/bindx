/**
 * Unified type definitions for the Handle system.
 *
 * Type hierarchy: Ref (pointer, no data access) → Accessor (live data, extends Ref).
 *
 * - FieldRef / FieldAccessor
 * - HasManyRef / HasManyAccessor
 * - HasOneRef / HasOneAccessor
 * - EntityRef / EntityAccessor
 */

import type { FieldHandle } from './FieldHandle.js'

// ============================================================================
// Relation State Types
// ============================================================================

export type HasOneRelationState =
	| 'connected'
	| 'disconnected'
	| 'deleted'
	| 'creating'

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

export type { UnsubscribeType as Unsubscribe }

// ============================================================================
// Field Type Detection Utilities
// ============================================================================

export type ScalarKeys<T> = {
	[K in keyof T]: T[K] extends (infer _U)[]
		? never
		: NonNullable<T[K]> extends object
			? K extends 'id'
				? K
				: never
			: K
}[keyof T]

export type HasManyKeys<T> = {
	[K in keyof T]: T[K] extends (infer U)[]
		? U extends object
			? K
			: never
		: never
}[keyof T]

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

export const FIELD_REF_META = Symbol('FIELD_REF_META')

// ============================================================================
// Helper Types
// ============================================================================

export interface FieldRefMeta<TEntityName extends string = string> {
	readonly entityType: TEntityName
	readonly entityId: string
	readonly path: string[]
	readonly fieldName: string
	readonly isArray: boolean
	readonly isRelation: boolean
	readonly enumName?: string
	readonly columnType?: string
	readonly targetType?: string
}

export interface InputProps<T> {
	readonly value: T | null
	readonly setValue: (value: T | null) => void
	readonly onChange: (value: T | null) => void
}

type ExtractNestedSelection<TSelected, K extends PropertyKey> =
	K extends keyof TSelected ? TSelected[K] : never

export type EntityNameFromType<TSchema extends Record<string, object>, TEntityType> = {
	[K in keyof TSchema]: TSchema[K] extends TEntityType ? K : never
}[keyof TSchema] & string

// ============================================================================
// SCALAR FIELD TYPES
// ============================================================================

/**
 * Pointer to a scalar field. No .value access.
 * Safe to pass to components, returned by createComponent() implicit mode.
 */
export interface FieldRef<T> {
	readonly [FIELD_REF_META]: FieldRefMeta
	readonly isTouched: boolean
	touch(): void
	setValue(value: T | null): void
	readonly inputProps: InputProps<T>
	readonly errors: readonly FieldError[]
	readonly hasError: boolean
	addError(error: ErrorInput): void
	clearErrors(): void
	onChange(listener: EventListener<FieldChangedEvent>): UnsubscribeType
	onChanging(interceptor: Interceptor<FieldChangingEvent>): UnsubscribeType
}

/**
 * Live scalar field accessor with value access. Created by hooks (useField).
 */
export interface FieldAccessor<T> extends FieldRef<T> {
	readonly value: T | null
	readonly serverValue: T | null
	readonly isDirty: boolean
}

// ============================================================================
// HAS-MANY RELATION TYPES
// ============================================================================

/**
 * Pointer to a has-many relation. No .items/.length/.map access.
 * Safe to pass to components.
 */
export interface HasManyRef<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	readonly [FIELD_REF_META]: FieldRefMeta<TEntityName>
	readonly isDirty: boolean
	add(data?: Partial<TEntity>): string
	remove(itemId: string): void
	move(fromIndex: number, toIndex: number): void
	connect(itemId: string): void
	disconnect(itemId: string): void
	delete(itemId: string): void
	reset(): void
	readonly __entityType: TEntity
	readonly __selected?: TSelected
	readonly __entityName: TEntityName
	readonly __schema?: TSchema & any
	readonly __brands?: Set<symbol>
	readonly errors: readonly FieldError[]
	readonly hasError: boolean
	addError(error: ErrorInput): void
	clearErrors(): void
	onItemConnected(listener: EventListener<HasManyConnectedEvent>): UnsubscribeType
	onItemDisconnected(listener: EventListener<HasManyDisconnectedEvent>): UnsubscribeType
	interceptItemConnecting(interceptor: Interceptor<HasManyConnectingEvent>): UnsubscribeType
	interceptItemDisconnecting(interceptor: Interceptor<HasManyDisconnectingEvent>): UnsubscribeType
}

/**
 * Live has-many accessor with collection access. Created by hooks (useHasMany).
 */
export interface HasManyAccessor<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> extends HasManyRef<TEntity, TSelected, TBrand, TEntityName, TSchema> {
	readonly length: number
	readonly totalCount: number | undefined
	readonly items: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>[]
	map<R>(fn: (item: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>, index: number) => R): R[]
	getById(id: string): EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>
}

// ============================================================================
// HAS-ONE RELATION TYPES
// ============================================================================

/**
 * Pointer to a has-one relation with proxy field access (fields return Ref variants).
 * Includes $connect/$disconnect/$delete but no $state/$data/$fields/$entity.
 */
export interface HasOneRefInterface<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	readonly [FIELD_REF_META]: FieldRefMeta<TEntityName>
	readonly id: string
	readonly $id: string
	readonly $isDirty: boolean
	readonly $isConnected: boolean
	readonly $isNew: boolean
	readonly $isPersisting: boolean
	readonly $persistedId: string | null
	readonly __entityName: TEntityName
	readonly __schema?: TSchema & any
	readonly __entityType: TEntity
	readonly __selected?: TSelected
	readonly __brands?: Set<symbol>
	$create(data?: Partial<TEntity>): string
	$connect(id: string): void
	$disconnect(): void
	$delete(): void
	$remove(): void
	$reset(): void
	readonly $errors: readonly FieldError[]
	readonly $hasError: boolean
	$addError(error: ErrorInput): void
	$clearErrors(): void
	$clearAllErrors(): void
	$onConnect(listener: EventListener<RelationConnectedEvent>): UnsubscribeType
	$onDisconnect(listener: EventListener<RelationDisconnectedEvent>): UnsubscribeType
	$interceptConnect(interceptor: Interceptor<RelationConnectingEvent>): UnsubscribeType
	$interceptDisconnect(interceptor: Interceptor<RelationDisconnectingEvent>): UnsubscribeType
	$on<E extends AfterEventTypes>(eventType: E, listener: EventListener<EventTypeMap[E]>): UnsubscribeType
	$intercept<E extends BeforeEventTypes>(eventType: E, interceptor: Interceptor<EventTypeMap[E]>): UnsubscribeType
	$onPersisted(listener: EventListener<EntityPersistedEvent>): UnsubscribeType
	$interceptPersisting(interceptor: Interceptor<EntityPersistingEvent>): UnsubscribeType
}

/**
 * HasOneRef = interface props + proxy field access returning Ref variants.
 */
export type HasOneRef<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> = HasOneRefInterface<TEntity, TSelected, TBrand, TEntityName, TSchema> &
	EntityFieldsRef<TEntity, TSelected, TSchema>

/**
 * HasOneAccessor = HasOneRef + $state/$data/$fields/$entity, proxy returns Accessor variants.
 * Includes HasOneRef in definition so TypeScript can infer generic params.
 */
export type HasOneAccessor<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> = HasOneRef<TEntity, TSelected, TBrand, TEntityName, TSchema> & {
	readonly $data: TSelected | null
	readonly $state: HasOneRelationState
	readonly $fields: EntityFieldsAccessor<TEntity, TSelected, TSchema>
	readonly $entity: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>
} & EntityFieldsAccessor<TEntity, TSelected, TSchema>

// ============================================================================
// ENTITY TYPES
// ============================================================================

/**
 * Entity ref interface props (without proxy field access).
 */
export interface EntityRefInterface<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	readonly [FIELD_REF_META]: FieldRefMeta<TEntityName>
	readonly id: string
	readonly $isDirty: boolean
	readonly $isPersisting: boolean
	readonly $persistedId: string | null
	readonly $isNew: boolean
	readonly __entityType: TEntity
	readonly __selected?: TSelected
	readonly __schema?: TSchema & any
	readonly __entityName: TEntityName
	readonly __brands?: Set<symbol>
	readonly $errors: readonly FieldError[]
	readonly $hasError: boolean
	$addError(error: ErrorInput): void
	$clearErrors(): void
	$clearAllErrors(): void
	$on<E extends AfterEventTypes>(eventType: E, listener: EventListener<EventTypeMap[E]>): UnsubscribeType
	$intercept<E extends BeforeEventTypes>(eventType: E, interceptor: Interceptor<EventTypeMap[E]>): UnsubscribeType
	$onPersisted(listener: EventListener<EntityPersistedEvent>): UnsubscribeType
	$interceptPersisting(interceptor: Interceptor<EntityPersistingEvent>): UnsubscribeType
}

/**
 * EntityRef = interface props + proxy field access returning Ref variants.
 */
export type EntityRef<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
	TRoleMap extends Record<string, object> = Record<string, object>,
> = EntityRefInterface<TEntity, TSelected, TBrand, TEntityName, TSchema> &
	EntityFieldsRef<TEntity, TSelected, TSchema> & {
		readonly __roleMap?: TRoleMap
	}

/**
 * EntityAccessor = EntityRef + $data/$fields, proxy returns Accessor variants.
 * Includes EntityRef in definition so TypeScript can infer generic params.
 */
export type EntityAccessor<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
	TRoleMap extends Record<string, object> = Record<string, object>,
> = EntityRef<TEntity, TSelected, TBrand, TEntityName, TSchema, TRoleMap> & {
	readonly $fields: EntityFieldsAccessor<TEntity, TSelected, TSchema>
	readonly $data: TSelected | null
} & EntityFieldsAccessor<TEntity, TSelected, TSchema>

// ============================================================================
// ENTITY FIELDS MAPPING TYPES
// ============================================================================

/**
 * Maps entity fields to their Handle types (internal use).
 */
export type EntityFields<T> = {
	[K in ScalarKeys<T>]: FieldHandle<T[K]>
} & {
	[K in HasManyKeys<T>]: T[K] extends (infer U)[]
		? U extends object
			? HasManyAccessor<U>
			: never
		: never
} & {
	[K in HasOneKeys<T>]: HasOneAccessor<NonNullable<T[K]>>
}

/**
 * Resolves a single field to its Ref type based on field kind.
 */
type FieldRefType<TEntity, TSelected, TSchema extends Record<string, object>, K extends keyof TEntity & keyof TSelected> =
	K extends ScalarKeys<TEntity> ? FieldRef<TEntity[K]> :
	K extends HasManyKeys<TEntity> ? (TEntity[K] extends (infer U)[]
		? U extends object
			? HasManyRef<U, ExtractNestedSelection<TSelected, K> extends (infer S)[] ? S : U, AnyBrand, EntityNameFromType<TSchema, U>, TSchema>
			: never
		: never) :
	K extends HasOneKeys<TEntity> ? HasOneRef<
		NonNullable<TEntity[K]>,
		ExtractNestedSelection<TSelected, K> extends object ? ExtractNestedSelection<TSelected, K> : NonNullable<TEntity[K]>,
		AnyBrand,
		EntityNameFromType<TSchema, NonNullable<TEntity[K]>>,
		TSchema
	> :
	never

/**
 * Resolves a single field to its Accessor type based on field kind.
 */
type FieldAccessorType<TEntity, TSelected, TSchema extends Record<string, object>, K extends keyof TEntity & keyof TSelected> =
	K extends ScalarKeys<TEntity> ? FieldAccessor<TEntity[K]> :
	K extends HasManyKeys<TEntity> ? (TEntity[K] extends (infer U)[]
		? U extends object
			? HasManyAccessor<U, ExtractNestedSelection<TSelected, K> extends (infer S)[] ? S : U, AnyBrand, EntityNameFromType<TSchema, U>, TSchema>
			: never
		: never) :
	K extends HasOneKeys<TEntity> ? HasOneAccessor<
		NonNullable<TEntity[K]>,
		ExtractNestedSelection<TSelected, K> extends object ? ExtractNestedSelection<TSelected, K> : NonNullable<TEntity[K]>,
		AnyBrand,
		EntityNameFromType<TSchema, NonNullable<TEntity[K]>>,
		TSchema
	> :
	never

/**
 * Maps selected entity fields to Ref variants (for implicit mode / createComponent).
 */
export type EntityFieldsRef<
	TEntity,
	TSelected,
	TSchema extends Record<string, object> = Record<string, object>,
> = {
	[K in (ScalarKeys<TEntity> | HasManyKeys<TEntity> | HasOneKeys<TEntity>) & keyof TSelected]: FieldRefType<TEntity, TSelected, TSchema, K & keyof TEntity>
}

/**
 * Maps selected entity fields to Accessor variants (for explicit mode / hooks).
 */
export type EntityFieldsAccessor<
	TEntity,
	TSelected,
	TSchema extends Record<string, object> = Record<string, object>,
> = {
	[K in (ScalarKeys<TEntity> | HasManyKeys<TEntity> | HasOneKeys<TEntity>) & keyof TSelected]: FieldAccessorType<TEntity, TSelected, TSchema, K & keyof TEntity>
}

// ============================================================================
// Type Extraction Helpers
// ============================================================================

export type ExtractRoleMap<T> =
	T extends { readonly __roleMap?: infer TRoleMap extends Record<string, object> }
		? TRoleMap
		: Record<string, object>

export type ExtractHasOneEntityName<T> =
	T extends HasOneAccessor<any, any, any, infer TEntityName, any>
		? TEntityName
		: T extends HasOneRef<any, any, any, infer TEntityName, any>
			? TEntityName
			: never

export type ExtractHasManyEntityName<T> =
	T extends HasManyAccessor<any, any, any, infer TEntityName, any>
		? TEntityName
		: T extends HasManyRef<any, any, any, infer TEntityName, any>
			? TEntityName
			: never
