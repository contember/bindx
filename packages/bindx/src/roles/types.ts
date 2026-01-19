/**
 * Role-based schema types for Bindx.
 *
 * Provides type-safe role-aware entity access with schema narrowing
 * based on user roles.
 */

import type { SchemaDefinition, EntitySchemaDef } from '../schema/types.js'

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Converts a union type to an intersection type.
 *
 * @example
 * ```typescript
 * type Union = { a: string } | { b: number }
 * type Intersection = UnionToIntersection<Union>
 * // Result: { a: string } & { b: number }
 * ```
 */
export type UnionToIntersection<U> =
	(U extends unknown ? (k: U) => void : never) extends (k: infer I) => void
		? I
		: never

/**
 * Extracts keys that exist in ALL members of a union type.
 * Uses distributive conditional to check each union member.
 *
 * @example
 * ```typescript
 * type A = { id: string; title: string; content: string }
 * type B = { id: string; title: string; notes: string }
 * type Common = KeysInAll<A | B>
 * // Result: 'id' | 'title'
 * ```
 */
type KeysInAll<T, K = keyof T> = T extends unknown
	? K extends keyof T ? K : never
	: never

/**
 * Picks only the common properties from a union of object types.
 * Returns an object with only keys that exist in ALL union members.
 * Property values are unions of the original types.
 *
 * @example
 * ```typescript
 * type A = { id: string; title: string; content: string }
 * type B = { id: string; title: string; notes: string }
 * type Common = PickCommonProperties<A | B>
 * // Result: { id: string; title: string }
 * ```
 */
export type PickCommonProperties<T> = {
	[K in KeysInAll<T>]: T extends { readonly [P in K]: infer V } ? V : never
}

/**
 * Applies PickCommonProperties to each entity in a schema union.
 * For a union of schemas, extracts only common entity names and their common properties.
 *
 * @example
 * ```typescript
 * type SchemaA = { Article: { id: string; title: string }; Author: { id: string } }
 * type SchemaB = { Article: { id: string; content: string }; Author: { id: string } }
 * type Common = IntersectSchemaEntities<SchemaA | SchemaB>
 * // Result: { Article: { id: string }; Author: { id: string } }
 * ```
 */
export type IntersectSchemaEntities<TSchemaUnion> = {
	[K in KeysInAll<TSchemaUnion>]: PickCommonProperties<
		TSchemaUnion extends { readonly [P in K]: infer V } ? V : never
	>
}

// ============================================================================
// Role Schema Types
// ============================================================================

/**
 * Base constraint for role schema maps.
 * Uses a mapped type to allow interfaces without index signatures.
 */
export type RoleSchemasConstraint = {
	[role: string]: { [entity: string]: object }
}

/**
 * Mapping of role names to their respective schema types.
 *
 * @example
 * ```typescript
 * interface MyRoleSchemas {
 *   public: PublicSchema
 *   editor: EditorSchema
 *   admin: AdminSchema
 * }
 * ```
 */
export type RoleSchemaMap<TRoleSchemas> = {
	[K in keyof TRoleSchemas]: TRoleSchemas[K]
}

/**
 * Extracts all role names from a role schema map.
 */
export type RoleNames<TRoleSchemas> = keyof TRoleSchemas & string

/**
 * Intersects schemas from multiple roles.
 * Used when multiple roles are specified - returns fields accessible to ALL roles.
 *
 * This performs a TRUE property intersection: only properties that exist in ALL
 * role schemas are accessible. This is different from TypeScript's & operator
 * which creates a type with ALL properties from all schemas.
 *
 * @example
 * ```typescript
 * interface EditorSchema { Article: { id: string; title: string; content: string } }
 * interface ReviewerSchema { Article: { id: string; title: string; status: string } }
 *
 * type Combined = IntersectRoleSchemas<{ editor: EditorSchema; reviewer: ReviewerSchema }, ['editor', 'reviewer']>
 * // Result: { Article: { id: string; title: string } } (only common properties)
 * ```
 */
export type IntersectRoleSchemas<
	TRoleSchemas,
	TRoles extends readonly (keyof TRoleSchemas)[],
> = IntersectSchemaEntities<TRoleSchemas[TRoles[number]]>

/**
 * Gets the entity type for specific roles.
 *
 * @typeParam TRoleSchemas - Map of role names to their schemas
 * @typeParam TRoles - Tuple of role names to intersect
 * @typeParam TEntityName - Name of the entity to extract
 */
export type EntityForRoles<
	TRoleSchemas,
	TRoles extends readonly (keyof TRoleSchemas)[],
	TEntityName extends string,
> = TEntityName extends keyof IntersectRoleSchemas<TRoleSchemas, TRoles>
	? IntersectRoleSchemas<TRoleSchemas, TRoles>[TEntityName]
	: never

/**
 * Gets the schema type for a specific role.
 */
export type SchemaForRole<TRoleSchemas, TRole extends keyof TRoleSchemas> =
	TRoleSchemas[TRole]

/**
 * Extracts all entity names that exist in ALL specified roles.
 */
export type EntityNamesForRoles<
	TRoleSchemas,
	TRoles extends readonly (keyof TRoleSchemas)[],
> = keyof IntersectRoleSchemas<TRoleSchemas, TRoles> & string

// ============================================================================
// Role Schema Definition Types
// ============================================================================

/**
 * Maps role names to their schema definitions (runtime structure).
 */
export type RoleSchemaDefinitions<TRoleSchemas> = {
	[K in keyof TRoleSchemas]: TRoleSchemas[K] extends { [E: string]: object }
		? SchemaDefinition<TRoleSchemas[K]>
		: never
}

/**
 * Configuration for role-aware bindx.
 */
export interface RoleBindxConfig<TRoleSchemas> {
	/**
	 * Schema definitions for each role.
	 */
	readonly schemas: RoleSchemaDefinitions<TRoleSchemas>

	/**
	 * Function to check if the current user has a specific role.
	 * Used at runtime to determine which branches to render.
	 */
	readonly hasRole: (role: keyof TRoleSchemas) => boolean

	/**
	 * Current roles of the user.
	 * Used for query building - determines which fields to fetch.
	 */
	readonly currentRoles: readonly (keyof TRoleSchemas)[]
}

// ============================================================================
// Role Compatibility Types
// ============================================================================

/**
 * Check if TRequired roles are a subset of TAvailable roles.
 * Returns true if every role in TRequired exists in TAvailable.
 *
 * @example
 * ```typescript
 * type Test1 = RolesAreSubset<['admin'], ['editor', 'admin']> // true
 * type Test2 = RolesAreSubset<['admin'], ['editor']> // false
 * type Test3 = RolesAreSubset<[], ['editor']> // true (empty is subset of all)
 * ```
 */
export type RolesAreSubset<
	TRequired extends readonly string[],
	TAvailable extends readonly string[],
> = TRequired extends readonly []
	? true
	: TRequired extends readonly [infer First extends string, ...infer Rest extends string[]]
		? First extends TAvailable[number]
			? RolesAreSubset<Rest, TAvailable>
			: false
		: boolean

/**
 * Enforces that TRequired roles must be a subset of TAvailable roles.
 * Returns TRequired if valid, never if not.
 *
 * @example
 * ```typescript
 * type Valid = RequireRoleSubset<['admin'], ['editor', 'admin']> // ['admin']
 * type Invalid = RequireRoleSubset<['admin'], ['editor']> // never
 * ```
 */
export type RequireRoleSubset<
	TRequired extends readonly string[],
	TAvailable extends readonly string[],
> = RolesAreSubset<TRequired, TAvailable> extends true ? TRequired : never

/**
 * Asserts that TComponentRoles are compatible with TAvailableRoles.
 * Used for type-level validation when using role-aware components.
 *
 * When component requires ['admin'] and scope has ['editor', 'admin']:
 * - ['admin'] ⊆ ['editor', 'admin'] = true (compatible)
 *
 * When component requires ['admin'] and scope has ['editor']:
 * - ['admin'] ⊆ ['editor'] = false (incompatible)
 */
export type AssertRoleCompatibility<
	TComponentRoles extends readonly string[],
	TAvailableRoles extends readonly string[],
> = RolesAreSubset<TComponentRoles, TAvailableRoles> extends true
	? TComponentRoles
	: ['Error: Component requires roles', TComponentRoles, 'but available roles are', TAvailableRoles]

// ============================================================================
// Type Guards and Assertions
// ============================================================================

/**
 * Type predicate to check if a value is a valid role.
 */
export function isValidRole<TRoleSchemas>(
	roleSchemas: TRoleSchemas,
	role: unknown,
): role is keyof TRoleSchemas {
	return typeof role === 'string' && role in (roleSchemas as object)
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export type { SchemaDefinition, EntitySchemaDef }

// ============================================================================
// Single Schema Support
// ============================================================================

/**
 * Wraps a single schema as a role schema map with a default role.
 * This allows single-schema usage to be a special case of role-aware bindx.
 *
 * @example
 * ```typescript
 * type Models = { Article: ArticleType; Author: AuthorType }
 *
 * // Single schema becomes:
 * type RoleSchemas = SingleSchemaRoles<Models>
 * // = { _default: { Article: ArticleType; Author: AuthorType } }
 *
 * // IntersectRoleSchemas<RoleSchemas, ['_default']> = Models
 * ```
 */
export type SingleSchemaRoles<TModels extends Record<string, object>> = {
	_default: TModels
}

/**
 * Check if TRoleSchemas represents a single-schema case.
 * Returns true if the only key is '_default'.
 *
 * @example
 * ```typescript
 * type Test1 = IsSingleSchema<{ _default: Models }> // true
 * type Test2 = IsSingleSchema<{ admin: AdminModels; public: PublicModels }> // false
 * ```
 */
export type IsSingleSchema<TRoleSchemas> =
	keyof TRoleSchemas extends '_default'
		? '_default' extends keyof TRoleSchemas
			? true
			: false
		: false

/**
 * Gets all role names from a role schema map as a readonly array type.
 *
 * @example
 * ```typescript
 * type Roles = AllRoles<{ admin: AdminModels; public: PublicModels }>
 * // = readonly ('admin' | 'public')[]
 * ```
 */
export type AllRoles<TRoleSchemas> = readonly (keyof TRoleSchemas & string)[]

/**
 * Default role name for single-schema case.
 */
export const DEFAULT_ROLE = '_default' as const

/**
 * Type for the default role name.
 */
export type DefaultRole = typeof DEFAULT_ROLE
