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
 * Maps entity fields to Handle types, but only for fields present in TSelected.
 * This enables compile-time checking that only fetched fields are accessed.
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset (determines which fields are accessible)
 * @typeParam TAvailableRoles - Available roles to propagate to nested relations
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
export type SelectedEntityFields<TEntity, TSelected, TAvailableRoles extends readonly string[] = readonly string[]> = {
	// Scalar fields: only include if key exists in TSelected
	[K in ScalarKeys<TEntity> & keyof TSelected]: FieldHandle<TEntity[K]>
} & {
	// HasMany fields: only include if key exists in TSelected, with nested selection
	[K in HasManyKeys<TEntity> & keyof TSelected]: TEntity[K] extends (infer U)[]
		? U extends object
			? HasManyRef<U, ExtractNestedSelection<TSelected, K> extends (infer S)[] ? S : U, AnyBrand, TAvailableRoles>
			: never
		: never
} & {
	// HasOne fields: only include if key exists in TSelected, with nested selection
	[K in HasOneKeys<TEntity> & keyof TSelected]: HasOneRef<
		NonNullable<TEntity[K]>,
		ExtractNestedSelection<TSelected, K> extends object ? ExtractNestedSelection<TSelected, K> : NonNullable<TEntity[K]>,
		AnyBrand,
		TAvailableRoles
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
 */
export interface FieldRefMeta {
	readonly entityType: string
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
 * Reference to a scalar field - works in both collection and runtime phases
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
 * Reference to a has-many relation - selection-aware version
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 * @typeParam TBrand - Component brand type for validation (defaults to AnyBrand)
 * @typeParam TAvailableRoles - Available roles for role-based type checking (defaults to readonly string[])
 */
export interface HasManyRef<TEntity, TSelected = TEntity, TBrand extends AnyBrand = AnyBrand, TAvailableRoles extends readonly string[] = readonly string[]> {
	/** Internal metadata for collection phase */
	readonly [FIELD_REF_META]: FieldRefMeta

	/** Number of items */
	readonly length: number

	/** Whether any item has been modified */
	readonly isDirty: boolean

	/** Direct access to items array - returns selection-aware entity refs */
	readonly items: EntityRef<TEntity, TSelected, TBrand, string, TAvailableRoles>[]

	/** Iterate over items - returns selection-aware entity refs */
	map<R>(fn: (item: EntityRef<TEntity, TSelected, TBrand, string, TAvailableRoles>, index: number) => R): R[]

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
 * Reference to a has-one relation - selection-aware version
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 * @typeParam TBrand - Component brand type for validation (defaults to AnyBrand)
 * @typeParam TAvailableRoles - Available roles for role-based type checking (defaults to readonly string[])
 */
export interface HasOneRef<TEntity, TSelected = TEntity, TBrand extends AnyBrand = AnyBrand, TAvailableRoles extends readonly string[] = readonly string[]> {
	/** Internal metadata for collection phase */
	readonly [FIELD_REF_META]: FieldRefMeta

	/** Entity ID (placeholder ID if disconnected) */
	readonly id: string

	/** Whether relation is dirty */
	readonly isDirty: boolean

	/** Nested entity fields - only selected fields are accessible */
	readonly fields: SelectedEntityFields<TEntity, TSelected, TAvailableRoles>

	/** Related entity reference (always available, may be placeholder with placeholder ID) */
	readonly entity: EntityRef<TEntity, TSelected, TBrand, string, TAvailableRoles>

	/** Connect to existing entity */
	connect(id: string): void

	/** Disconnect relation */
	disconnect(): void

	/** Mark relation for deletion */
	delete(): void

	/** Reset the relation to server state */
	reset(): void

	/** Type brand - ensures HasOneRef<Author> is not assignable to HasOneRef<Tag> */
	readonly __entityType: TEntity

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

	/** Subscribe to connection events */
	onConnect(listener: EventListener<RelationConnectedEvent>): UnsubscribeType

	/** Subscribe to disconnection events */
	onDisconnect(listener: EventListener<RelationDisconnectedEvent>): UnsubscribeType

	/** Intercept connection (can cancel or modify target) */
	interceptConnect(interceptor: Interceptor<RelationConnectingEvent>): UnsubscribeType

	/** Intercept disconnection (can cancel) */
	interceptDisconnect(interceptor: Interceptor<RelationDisconnectingEvent>): UnsubscribeType
}

/**
 * Reference to an entity - provides typed field access.
 * Selection-aware: only selected fields are accessible.
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 * @typeParam TBrand - Component brand type for validation (defaults to AnyBrand)
 * @typeParam TEntityName - The entity name as a string literal type (defaults to string)
 * @typeParam TAvailableRoles - Available roles for HasRole (defaults to readonly string[] for backwards compatibility)
 *
 * @example
 * ```ts
 * // Full access (backwards compatible)
 * EntityRef<Author>  // All fields accessible
 *
 * // Selection-aware
 * EntityRef<Author, { name: string; email: string }>  // Only name and email accessible
 *
 * // With entity name and roles for role-based access
 * EntityRef<Author, Author, AnyBrand, 'Author', readonly ['editor', 'admin']>
 * ```
 */
export interface EntityRef<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TAvailableRoles extends readonly string[] = readonly string[],
> {
	/** Entity ID (placeholder ID for placeholder entities) */
	readonly id: string

	/** Typed field accessors - only selected fields are accessible */
	readonly fields: SelectedEntityFields<TEntity, TSelected, TAvailableRoles>

	/** Raw data snapshot */
	readonly data: TSelected | null

	/** Whether entity is dirty */
	readonly isDirty: boolean

	/**
	 * Server-assigned ID after persistence.
	 * - null for entities that haven't been persisted yet (temp IDs)
	 * - string (the real ID) after successful persist
	 */
	readonly persistedId: string | null

	/**
	 * Whether this entity is new (created locally, not yet on server).
	 */
	readonly isNew: boolean

	/** Type brand - ensures EntityRef<Author> is not assignable to EntityRef<Tag> */
	readonly __entityType: TEntity

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
	readonly errors: readonly FieldError[]

	/** Whether this entity has any errors (entity-level, fields, or relations) */
	readonly hasError: boolean

	/** Add a client-side error to this entity */
	addError(error: ErrorInput): void

	/** Clear entity-level errors */
	clearErrors(): void

	/** Clear all errors (entity-level, fields, and relations) */
	clearAllErrors(): void

	// ==================== Event Subscriptions ====================

	/** Subscribe to any event on this entity */
	on<E extends AfterEventTypes>(
		eventType: E,
		listener: EventListener<EventTypeMap[E]>,
	): UnsubscribeType

	/** Intercept any before event on this entity */
	intercept<E extends BeforeEventTypes>(
		eventType: E,
		interceptor: Interceptor<EventTypeMap[E]>,
	): UnsubscribeType

	/** Subscribe to persist success events */
	onPersisted(listener: EventListener<EntityPersistedEvent>): UnsubscribeType

	/** Intercept persist (can cancel) */
	interceptPersisting(interceptor: Interceptor<EntityPersistingEvent>): UnsubscribeType
}

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
> = EntityRef<
	EntityForRolesObjectForRef<TRoleSchemas, TRoles, TEntityName>,
	TSelected,
	AnyBrand,
	TEntityName,
	TRoles
>
