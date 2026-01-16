/**
 * Unified type definitions for the Handle system.
 *
 * This module provides type-safe field accessor mapping that correctly
 * distinguishes between scalar fields, hasOne relations, and hasMany relations.
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
// Unified EntityFields Type
// ============================================================================

/**
 * Maps entity fields to their correct Handle types based on structural typing.
 *
 * - Scalar fields (primitives, 'id') -> FieldHandle<T>
 * - HasOne relations (objects) -> HasOneRef<T>
 * - HasMany relations (arrays of objects) -> HasManyRef<T>
 *
 * @example
 * ```typescript
 * interface Article {
 *   id: string           // -> FieldHandle<string>
 *   title: string        // -> FieldHandle<string>
 *   author: Author       // -> HasOneRef<Author>
 *   tags: Tag[]          // -> HasManyRef<Tag>
 * }
 *
 * type Fields = EntityFields<Article>
 * // Fields.id: FieldHandle<string>
 * // Fields.title: FieldHandle<string>
 * // Fields.author: HasOneRef<Author>
 * // Fields.tags: HasManyRef<Tag>
 * ```
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

// ============================================================================
// Selection-Aware EntityFields Type
// ============================================================================

/**
 * Extracts the nested selection type for a relation field.
 * If the selected type has a field K, extract its type, otherwise never.
 */
type ExtractNestedSelection<TSelected, K extends PropertyKey> =
	K extends keyof TSelected ? TSelected[K] : never

/**
 * Reverse lookup: finds entity name (schema key) from entity type.
 * Given a schema and an entity type, returns the key that maps to that type.
 *
 * @example
 * ```typescript
 * type Schema = { Article: Article; Author: Author }
 * type Name = EntityNameFromType<Schema, Author> // "Author"
 * ```
 */
export type EntityNameFromType<TSchema extends Record<string, object>, TEntityType> = {
	[K in keyof TSchema]: TSchema[K] extends TEntityType ? K : never
}[keyof TSchema] & string

/**
 * Maps entity fields to Handle types, but only for fields present in TSelected.
 * This enables compile-time checking that only fetched fields are accessed.
 *
 * HasOne relations return HasOneAccessor which supports direct field access:
 * - `entity.author.name` instead of `entity.author.$entity.$fields.name`
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset (determines which fields are accessible)
 * @typeParam TAvailableRoles - Available roles to propagate to nested relations
 * @typeParam TSchema - The schema for reverse entity name lookup
 *
 * @example
 * ```typescript
 * interface Author {
 *   id: string
 *   name: string
 *   email: string
 *   bio: string
 * }
 *
 * // Only name and email were selected
 * type Selected = { name: string; email: string }
 *
 * type Fields = SelectedEntityFields<Author, Selected>
 * // Fields.name: FieldHandle<string>  ✓
 * // Fields.email: FieldHandle<string> ✓
 * // Fields.id: never (not selected)
 * // Fields.bio: never (not selected)
 * ```
 */
export type SelectedEntityFields<
	TEntity,
	TSelected,
	TAvailableRoles extends readonly string[] = readonly string[],
	TSchema extends Record<string, object> = Record<string, object>,
> = {
	// Scalar fields: only include if key exists in TSelected
	[K in ScalarKeys<TEntity> & keyof TSelected]: FieldHandle<TEntity[K]>
} & {
	// HasMany fields: only include if key exists in TSelected, with nested selection
	[K in HasManyKeys<TEntity> & keyof TSelected]: TEntity[K] extends (infer U)[]
		? U extends object
			? HasManyRef<U, ExtractNestedSelection<TSelected, K> extends (infer S)[] ? S : U, AnyBrand, EntityNameFromType<TSchema, U>, TAvailableRoles, TSchema>
			: never
		: never
} & {
	// HasOne fields: only include if key exists in TSelected, with nested selection
	// Returns HasOneAccessor for direct field access support
	[K in HasOneKeys<TEntity> & keyof TSelected]: HasOneAccessor<
		NonNullable<TEntity[K]>,
		ExtractNestedSelection<TSelected, K> extends object ? ExtractNestedSelection<TSelected, K> : NonNullable<TEntity[K]>,
		AnyBrand,
		EntityNameFromType<TSchema, NonNullable<TEntity[K]>>,
		TAvailableRoles,
		TSchema
	>
}

// ============================================================================
// Symbols
// ============================================================================

/**
 * Marker symbol for field reference metadata
 */
export const FIELD_REF_META = Symbol('FIELD_REF_META')

// ============================================================================
// Helper Types for Ref Interface Compatibility
// ============================================================================

/**
 * Base metadata interface for all field references.
 * Used by JSX components for selection collection.
 *
 * @typeParam TEntityName - Entity name as string literal for type-safe extraction
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

// ============================================================================
// Ref Interfaces (framework-agnostic)
// ============================================================================

/**
 * Reference to a scalar field - works in both collection and runtime phases.
 *
 * Properties are available both with and without $ prefix (via proxy):
 * - `field.value` and `field.$value` are equivalent
 * - `field.setValue(v)` and `field.$setValue(v)` are equivalent
 */
export interface FieldRef<T> {
	/** Internal metadata for collection phase */
	readonly [FIELD_REF_META]: FieldRefMeta

	/** Current value (null in collection phase, real value in runtime) */
	readonly value: T | null

	/** Server value for dirty tracking */
	readonly serverValue: T | null

	/** Whether value differs from server */
	readonly isDirty: boolean

	/** Update the value */
	setValue(value: T | null): void

	/** Input binding props */
	readonly inputProps: {
		value: T | null
		setValue: (value: T | null) => void
	}

	/** List of errors on this field */
	readonly errors: readonly FieldError[]

	/** Whether this field has any errors */
	readonly hasError: boolean

	/** Add a client-side error to this field */
	addError(error: ErrorInput): void

	/** Clear all errors from this field */
	clearErrors(): void

	// ==================== Event Subscriptions ====================

	/** Subscribe to field value changes */
	onChange(listener: EventListener<FieldChangedEvent>): UnsubscribeType

	/** Intercept field value changes (can cancel or modify) */
	onChanging(interceptor: Interceptor<FieldChangingEvent>): UnsubscribeType
}

/**
 * Reference to a has-many relation - selection-aware version.
 *
 * Properties are available both with and without $ prefix (via proxy):
 * - `hasMany.items` and `hasMany.$items` are equivalent
 * - `hasMany.add()` and `hasMany.$add()` are equivalent
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 * @typeParam TBrand - Component brand type for validation (defaults to AnyBrand)
 * @typeParam TEntityName - Entity name as string literal for type narrowing
 * @typeParam TAvailableRoles - Available roles for role-based type checking (defaults to readonly string[])
 * @typeParam TSchema - Schema for entity name lookup in nested relations
 */
export interface HasManyRef<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TAvailableRoles extends readonly string[] = readonly string[],
	TSchema extends Record<string, object> = Record<string, object>,
> {
	/** Internal metadata for collection phase */
	readonly [FIELD_REF_META]: FieldRefMeta<TEntityName>

	/** Number of items */
	readonly length: number

	/** Whether any item has been modified */
	readonly isDirty: boolean

	/** Direct access to items array - returns selection-aware entity accessors with direct field access */
	readonly items: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TAvailableRoles, TSchema>[]

	/** Iterate over items - returns selection-aware entity accessors with direct field access */
	map<R>(fn: (item: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TAvailableRoles, TSchema>, index: number) => R): R[]

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

	/** Type brand for entity name - carries the entity name as a type */
	readonly __entityName: TEntityName

	/**
	 * Type brand for available roles - constrains what roles can be used in HasRole.
	 */
	readonly __availableRoles: readonly TAvailableRoles[number][]

	/**
	 * Type brand for schema - carries the schema type for relation lookups.
	 * Uses intersection with `any` to make it bivariant, allowing entities from
	 * different sources (Entity callbacks, relation accessors) to be passed
	 * to components regardless of schema specificity.
	 */
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

	// ==================== Event Subscriptions ====================

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
 * Reference to a has-one relation - selection-aware version.
 *
 * Supports direct field access for shorter chains:
 * - `hasOne.fieldName` returns the field handle for the related entity
 * - Handle properties use $ prefix to avoid collision with field names: `$id`, `$connect()`, `$entity`, etc.
 *
 * @example
 * ```typescript
 * // Direct field access on has-one relation:
 * article.author.name.value
 *
 * // Access handle methods with $ prefix:
 * article.author.$connect('author-2')
 * article.author.$disconnect()
 * article.author.$isDirty
 * article.author.$entity  // Get the full EntityRef
 * ```
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 * @typeParam TBrand - Component brand type for validation (defaults to AnyBrand)
 * @typeParam TEntityName - Entity name as string literal for type narrowing
 * @typeParam TAvailableRoles - Available roles for role-based type checking (defaults to readonly string[])
 * @typeParam TSchema - Schema for entity name lookup in nested relations
 */
export interface HasOneRef<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TAvailableRoles extends readonly string[] = readonly string[],
	TSchema extends Record<string, object> = Record<string, object>,
> {
	/** Internal metadata for collection phase */
	readonly [FIELD_REF_META]: FieldRefMeta<TEntityName>

	// ==================== EntityRef-compatible properties ====================
	// These properties make HasOneAccessor structurally compatible with EntityAccessor,
	// allowing you to pass a has-one relation directly where an entity is expected.

	/**
	 * Entity ID (placeholder ID if disconnected).
	 * Compatible with EntityRef.id for structural subtyping.
	 */
	readonly id: string

	/** Raw data snapshot of the related entity */
	readonly $data: TSelected | null

	/** Whether this entity is new (created locally, not yet on server) */
	readonly $isNew: boolean

	/**
	 * Server-assigned ID after persistence.
	 * - null for entities that haven't been persisted yet (temp IDs)
	 * - string (the real ID) after successful persist
	 */
	readonly $persistedId: string | null

	/** Type brand for entity name - carries the entity name as a type */
	readonly __entityName: TEntityName

	/**
	 * Type brand for available roles - constrains what roles can be used in HasRole.
	 */
	readonly __availableRoles: readonly TAvailableRoles[number][]

	/**
	 * Type brand for schema - carries the schema type for relation lookups.
	 * Uses intersection with `any` to make it bivariant, allowing entities from
	 * different sources (Entity callbacks, relation accessors) to be passed
	 * to components regardless of schema specificity.
	 */
	readonly __schema?: TSchema & any

	/** Clear all errors (entity-level, fields, and relations) */
	$clearAllErrors(): void

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

	/** Subscribe to persist success events on the related entity */
	$onPersisted(listener: EventListener<EntityPersistedEvent>): UnsubscribeType

	/** Intercept persist on the related entity (can cancel) */
	$interceptPersisting(interceptor: Interceptor<EntityPersistingEvent>): UnsubscribeType

	// ==================== HasOne-specific properties ====================

	/** Entity ID (placeholder ID if disconnected) - alias for id with $ prefix */
	readonly $id: string

	/** Whether relation is dirty */
	readonly $isDirty: boolean

	/** Relation state */
	readonly $state: HasOneRelationState

	/** Nested entity fields - only selected fields are accessible */
	readonly $fields: SelectedEntityFields<TEntity, TSelected, TAvailableRoles, TSchema>

	/** Related entity accessor with direct field access (always available, may be placeholder with placeholder ID) */
	readonly $entity: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TAvailableRoles, TSchema>

	/** Connect to existing entity */
	$connect(id: string): void

	/** Disconnect relation */
	$disconnect(): void

	/** Mark relation for deletion */
	$delete(): void

	/** Reset the relation to server state */
	$reset(): void

	/** Type brand - ensures HasOneRef<Author> is not assignable to HasOneRef<Tag> */
	readonly __entityType: TEntity

	/** Runtime brand symbols for validation */
	readonly __brands?: Set<symbol>

	/** List of errors on this relation */
	readonly $errors: readonly FieldError[]

	/** Whether this relation has any errors */
	readonly $hasError: boolean

	/** Add a client-side error to this relation */
	$addError(error: ErrorInput): void

	/** Clear all errors from this relation */
	$clearErrors(): void

	// ==================== HasOne Event Subscriptions ====================

	/** Subscribe to connection events */
	$onConnect(listener: EventListener<RelationConnectedEvent>): UnsubscribeType

	/** Subscribe to disconnection events */
	$onDisconnect(listener: EventListener<RelationDisconnectedEvent>): UnsubscribeType

	/** Intercept connection (can cancel or modify target) */
	$interceptConnect(interceptor: Interceptor<RelationConnectingEvent>): UnsubscribeType

	/** Intercept disconnection (can cancel) */
	$interceptDisconnect(interceptor: Interceptor<RelationDisconnectingEvent>): UnsubscribeType
}

/**
 * HasOneRef with direct field access via Proxy.
 * Access fields directly: `hasOne.fieldName` instead of `hasOne.$entity.$fields.fieldName`.
 * Handle properties use $ prefix to avoid collision with field names.
 */
export type HasOneAccessor<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TAvailableRoles extends readonly string[] = readonly string[],
	TSchema extends Record<string, object> = Record<string, object>,
> =
	HasOneRef<TEntity, TSelected, TBrand, TEntityName, TAvailableRoles, TSchema> & SelectedEntityFields<TEntity, TSelected, TAvailableRoles, TSchema>

/**
 * Reference to an entity - provides typed field access.
 * Selection-aware: only selected fields are accessible.
 *
 * Supports direct field access for shorter chains:
 * - `entity.fieldName` returns the field handle directly
 * - Handle properties use $ prefix to avoid collision with field names: `$data`, `$isDirty`, etc.
 * - The `id` property is special - it returns the entity ID (cannot collide with field names).
 *
 * @example
 * ```typescript
 * // Direct field access:
 * article.title.value
 * article.author.name.value  // Through has-one relation
 *
 * // Handle properties with $ prefix:
 * article.$data
 * article.$isDirty
 * article.$fields  // Explicit access to fields proxy
 * ```
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 * @typeParam TBrand - Component brand type for validation (defaults to AnyBrand)
 * @typeParam TEntityName - The entity name as a string literal type (defaults to string)
 * @typeParam TAvailableRoles - Available roles for HasRole (defaults to readonly string[] for backwards compatibility)
 * @typeParam TSchema - Schema for entity name lookup in nested relations
 */
export interface EntityRef<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TAvailableRoles extends readonly string[] = readonly string[],
	TSchema extends Record<string, object> = Record<string, object>,
> {
	/**
	 * Entity ID (placeholder ID for placeholder entities).
	 * Special case: `id` is always the entity ID, cannot collide with field names.
	 */
	readonly id: string

	/** Typed field accessors - only selected fields are accessible */
	readonly $fields: SelectedEntityFields<TEntity, TSelected, TAvailableRoles, TSchema>

	/** Raw data snapshot */
	readonly $data: TSelected | null

	/** Whether entity is dirty */
	readonly $isDirty: boolean

	/**
	 * Server-assigned ID after persistence.
	 * - null for entities that haven't been persisted yet (temp IDs)
	 * - string (the real ID) after successful persist
	 */
	readonly $persistedId: string | null

	/** Whether this entity is new (created locally, not yet on server) */
	readonly $isNew: boolean

	/** Type brand - ensures EntityRef<Author> is not assignable to EntityRef<Tag> */
	readonly __entityType: TEntity

	/**
	 * Type brand for schema - carries the schema type for relation lookups.
	 * Uses intersection with `any` to make it bivariant, allowing entities from
	 * different sources (Entity callbacks, relation accessors) to be passed
	 * to components regardless of schema specificity.
	 */
	readonly __schema?: TSchema & any

	/** Type brand for entity name - carries the entity name as a type */
	readonly __entityName: TEntityName

	/**
	 * Type brand for available roles - constrains what roles can be used in HasRole.
	 * Uses readonly array of union elements for covariance:
	 * EntityRef<..., ['admin']> is assignable to EntityRef<..., ['admin', 'client']>
	 * because readonly 'admin'[] is assignable to readonly ('admin' | 'client')[].
	 */
	readonly __availableRoles: readonly TAvailableRoles[number][]

	/** Runtime brand symbols for validation */
	readonly __brands?: Set<symbol>

	/** List of entity-level errors (not including field or relation errors) */
	readonly $errors: readonly FieldError[]

	/** Whether this entity has any errors (entity-level, fields, or relations) */
	readonly $hasError: boolean

	/** Add a client-side error to this entity */
	$addError(error: ErrorInput): void

	/** Clear entity-level errors */
	$clearErrors(): void

	/** Clear all errors (entity-level, fields, and relations) */
	$clearAllErrors(): void

	// ==================== Event Subscriptions ====================

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
 * EntityRef with direct field access via Proxy.
 * Access fields directly: `entity.fieldName` instead of `entity.$fields.fieldName`.
 * Handle properties use $ prefix to avoid collision with field names.
 */
export type EntityAccessor<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TAvailableRoles extends readonly string[] = readonly string[],
	TSchema extends Record<string, object> = Record<string, object>,
> = EntityRef<TEntity, TSelected, TBrand, TEntityName, TAvailableRoles, TSchema> & SelectedEntityFields<TEntity, TSelected, TAvailableRoles, TSchema>

// ============================================================================
// Role-Aware Type Helpers
// ============================================================================

/**
 * Constraint for role schema maps that works with interfaces (no index signature required).
 * Used for EntityRefFor type helper.
 */
type RoleSchemasBaseForRef<T> = { [K in keyof T]: { [E: string]: object } }

/**
 * Helper type to extract entity type with object constraint for role-aware refs.
 */
type EntityForRolesObjectForRef<
	TRoleSchemas extends RoleSchemasBaseForRef<TRoleSchemas>,
	TRoles extends readonly (keyof TRoleSchemas)[],
	TEntityName extends string,
> = import('../roles/types.js').EntityForRoles<TRoleSchemas, TRoles, TEntityName> extends object
	? import('../roles/types.js').EntityForRoles<TRoleSchemas, TRoles, TEntityName>
	: object

/**
 * Type helper for creating correctly typed EntityRef for role-aware components.
 *
 * This allows declaring component props with specific role requirements,
 * enabling type-safe JSX autocomplete for fields available to those roles.
 *
 * @typeParam TRoleSchemas - The role schema map (e.g., { admin: { Article: AdminArticle }, public: { Article: PublicArticle } })
 * @typeParam TRoles - Tuple of role names that the entity must have
 * @typeParam TEntityName - The entity name
 * @typeParam TSelected - Optional selection subset (defaults to full entity for roles)
 * @typeParam TSchema - Schema for entity name lookup (defaults to intersected schemas)
 *
 * @example
 * ```typescript
 * interface AdminArticleCardProps {
 *   article: EntityRefFor<RoleSchemas, ['admin'], 'Article'>
 * }
 *
 * const AdminArticleCard = createComponent<AdminArticleCardProps>({...
 * ```
 */
export type EntityRefFor<
	TRoleSchemas extends RoleSchemasBaseForRef<TRoleSchemas>,
	TRoles extends readonly (keyof TRoleSchemas & string)[],
	TEntityName extends string,
	TSelected extends object = EntityForRolesObjectForRef<TRoleSchemas, TRoles, TEntityName>,
	TSchema extends Record<string, object> = import('../roles/types.js').IntersectRoleSchemas<TRoleSchemas, TRoles>,
> = EntityRef<
	EntityForRolesObjectForRef<TRoleSchemas, TRoles, TEntityName>,
	TSelected,
	AnyBrand,
	TEntityName,
	TRoles,
	TSchema
>

// ============================================================================
// Type Extraction Helpers
// ============================================================================

/**
 * Extract entity name from HasOneRef type parameter.
 * Returns the TEntityName type parameter as a string literal type.
 *
 * @example
 * ```typescript
 * type Name = ExtractHasOneEntityName<HasOneRef<Author, Author, AnyBrand, 'Author', ['admin']>>
 * // Name = 'Author'
 * ```
 */
export type ExtractHasOneEntityName<T> =
	T extends HasOneRef<any, any, any, infer TEntityName, any, any>
		? TEntityName
		: never

/**
 * Extract roles from HasOneRef type parameter.
 * Returns the TAvailableRoles type parameter.
 *
 * @example
 * ```typescript
 * type Roles = ExtractHasOneRoles<HasOneRef<Author, Author, AnyBrand, 'Author', ['admin', 'client']>>
 * // Roles = ['admin', 'client']
 * ```
 */
export type ExtractHasOneRoles<T> =
	T extends HasOneRef<any, any, any, any, infer TRoles, any>
		? TRoles
		: never

/**
 * Extract entity name from HasManyRef type parameter.
 * Returns the TEntityName type parameter as a string literal type.
 *
 * @example
 * ```typescript
 * type Name = ExtractHasManyEntityName<HasManyRef<Tag, Tag, AnyBrand, 'Tag', ['admin']>>
 * // Name = 'Tag'
 * ```
 */
export type ExtractHasManyEntityName<T> =
	T extends HasManyRef<any, any, any, infer TEntityName, any, any>
		? TEntityName
		: never

/**
 * Extract roles from HasManyRef type parameter.
 * Returns the TAvailableRoles type parameter.
 *
 * @example
 * ```typescript
 * type Roles = ExtractHasManyRoles<HasManyRef<Tag, Tag, AnyBrand, 'Tag', ['admin', 'client']>>
 * // Roles = ['admin', 'client']
 * ```
 */
export type ExtractHasManyRoles<T> =
	T extends HasManyRef<any, any, any, any, infer TRoles, any>
		? TRoles
		: never
