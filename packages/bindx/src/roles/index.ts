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
} from './types.js'

export { isValidRole } from './types.js'

export { RoleSchemaRegistry } from './RoleSchemaRegistry.js'
