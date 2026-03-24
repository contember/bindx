/**
 * Role-aware type utilities for bindx.
 *
 * The role system allows per-role field access control at the type level.
 * Default (no role) = narrowest scope (fields ALL roles can access).
 * Specifying roles = expanding scope (union of capabilities for those roles).
 */

// ============================================================================
// Core Utility Types
// ============================================================================

/**
 * Converts a union type to an intersection type.
 * Used to merge field sets from multiple roles.
 *
 * @example
 * UnionToIntersection<{ a: 1 } | { b: 2 }> = { a: 1 } & { b: 2 }
 */
export type UnionToIntersection<U> =
	(U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never

// ============================================================================
// Role Map Types
// ============================================================================

/**
 * Extracts all role names from a role map.
 */
export type RoleNames<TRoleMap extends Record<string, object>> = keyof TRoleMap & string

/**
 * Default entity type — the narrowest scope.
 * Returns a union of all role entity types, so only common fields are accessible via keyof.
 *
 * @example
 * CommonEntity<{ admin: { id: string; secret: string }; public: { id: string } }>
 * // = { id: string; secret: string } | { id: string }
 * // Only `id` is accessible (common to all roles)
 */
export type CommonEntity<TRoleMap extends Record<string, object>> = TRoleMap[keyof TRoleMap]

/**
 * Entity type for specific roles — expanded scope.
 * Returns an intersection of the specified roles' entity types,
 * giving access to all fields from any of those roles.
 *
 * @example
 * EntityForRoles<{ admin: { id: string; secret: string }; editor: { id: string; notes: string } }, 'admin'>
 * // = { id: string; secret: string }
 *
 * EntityForRoles<{ admin: { id: string; secret: string }; editor: { id: string; notes: string } }, 'admin' | 'editor'>
 * // = { id: string; secret: string } & { id: string; notes: string }
 * // = { id: string; secret: string; notes: string }
 */
export type EntityForRoles<
	TRoleMap extends Record<string, object>,
	TRoles extends keyof TRoleMap,
> = UnionToIntersection<TRoleMap[TRoles]> & object

/**
 * Resolves the entity type based on whether roles are specified.
 * - No roles (TRoles = never): returns CommonEntity (narrowest)
 * - With roles: returns EntityForRoles (expanded)
 */
export type ResolveEntity<
	TRoleMap extends Record<string, object>,
	TRoles extends string,
> = [TRoles] extends [never]
	? CommonEntity<TRoleMap>
	: EntityForRoles<TRoleMap, TRoles & keyof TRoleMap>

/**
 * Sentinel role name used when no ACL roles are defined.
 * entityDef<Article>('Article') wraps as { _default: Article }.
 */
export const DEFAULT_ROLE = '_default' as const
export type DefaultRole = typeof DEFAULT_ROLE

/**
 * Wraps a single entity type as a single-role map with the _default role.
 */
export type SingleRoleMap<TEntity extends object> = { readonly [K in DefaultRole]: TEntity }
