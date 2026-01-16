/**
 * Typed query parameter types for filter, orderBy, etc.
 *
 * Uses Input.Condition and Input.OrderDirection from @contember/schema
 * for scalar conditions, wrapped in entity-aware types that work with
 * plain TypeScript interfaces.
 */

import { Input } from '@contember/schema'

// ============================================================================
// Re-export Contember types
// ============================================================================

/**
 * Condition operators for scalar values - re-exported from @contember/schema
 */
export type ScalarCondition<T> = Input.Condition<T>

/**
 * Order direction enum values - string literal union from Contember enum
 */
export type OrderDirection = `${Input.OrderDirection}`

// ============================================================================
// Where Types (for filtering)
// ============================================================================

/**
 * Base composed where with AND/OR/NOT logic
 */
export interface ComposedWhere<TEntity> {
	readonly and?: readonly EntityWhere<TEntity>[]
	readonly or?: readonly EntityWhere<TEntity>[]
	readonly not?: EntityWhere<TEntity>
}

/**
 * Checks if a type is a "plain object" (entity) vs a scalar like Date
 * Date and other built-in objects are not treated as relations
 */
type IsPlainObject<T> =
	T extends Date ? false :
	T extends Array<any> ? false :
	T extends Function ? false :
	T extends object ? true :
	false

/**
 * Field-level where clause for an entity
 * Maps each field to its appropriate condition type using Input.Condition
 */
export type FieldsWhere<TEntity> = {
	readonly [K in keyof TEntity]?:
		NonNullable<TEntity[K]> extends Array<infer U>
			? IsPlainObject<U> extends true
				? EntityWhere<U> | null  // has-many: filter on related items (array of entities)
				: Input.Condition<NonNullable<TEntity[K]>> | null  // scalar array: use Input.Condition on the array (supports hasSome, contains, etc.)
			: IsPlainObject<NonNullable<TEntity[K]>> extends true
				? EntityWhere<NonNullable<TEntity[K]>> | null  // has-one: filter on related entity
				: Input.Condition<NonNullable<TEntity[K]>> | null  // scalar: use Input.Condition
}

/**
 * Full where type for an entity - combines composed and field conditions
 */
export type EntityWhere<TEntity> = ComposedWhere<TEntity> & FieldsWhere<TEntity>

// ============================================================================
// OrderBy Types (for sorting)
// ============================================================================

/**
 * Order by clause for an entity
 * Each scalar field can have a direction, relations can have nested ordering
 */
export type EntityOrderBy<TEntity> = {
	readonly [K in keyof TEntity]?:
		NonNullable<TEntity[K]> extends Array<any>
			? never  // has-many cannot be ordered by directly
			: IsPlainObject<NonNullable<TEntity[K]>> extends true
				? EntityOrderBy<NonNullable<TEntity[K]>> | null  // has-one: nested ordering
				: OrderDirection | null  // scalar: direction (including Date)
} & {
	readonly _random?: boolean
	readonly _randomSeeded?: number
}

// ============================================================================
// HasMany Options with Typed Parameters
// ============================================================================

/**
 * Options for has-many relation selection with typed filter/orderBy
 *
 * @typeParam TItem - The related entity type (array item type)
 * @typeParam TAlias - Optional alias for the field
 */
export interface TypedHasManyOptions<
	TItem,
	TAlias extends string = string,
> {
	readonly as?: TAlias
	readonly filter?: EntityWhere<TItem>
	readonly orderBy?: readonly EntityOrderBy<TItem>[]
	readonly limit?: number
	readonly offset?: number
}

/**
 * Alias-only options (for scalar or has-one with alias)
 */
export interface AliasOptions<TAlias extends string = string> {
	readonly as?: TAlias
}

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Extracts the item type from an array type
 */
export type ArrayItemType<T> = T extends Array<infer U> ? U : never

/**
 * Checks if a type is an array
 */
export type IsArray<T> = T extends Array<any> ? true : false

/**
 * Extracts non-nullable type
 */
export type NonNullableType<T> = Exclude<T, null | undefined>
