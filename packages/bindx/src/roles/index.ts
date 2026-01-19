/**
 * Role-based schema module for Bindx.
 *
 * Provides type-safe role-aware entity access with schema narrowing.
 *
 * @packageDocumentation
 */

export type {
	UnionToIntersection,
	RoleSchemaMap,
	RoleNames,
	IntersectRoleSchemas,
	IntersectSchemaEntities,
	PickCommonProperties,
	EntityForRoles,
	SchemaForRole,
	EntityNamesForRoles,
	RoleSchemaDefinitions,
	RoleBindxConfig,
	RolesAreSubset,
	RequireRoleSubset,
	AssertRoleCompatibility,
	SingleSchemaRoles,
	IsSingleSchema,
	AllRoles,
	DefaultRole,
} from './types.js'

export { isValidRole, DEFAULT_ROLE } from './types.js'

export { RoleSchemaRegistry } from './RoleSchemaRegistry.js'
