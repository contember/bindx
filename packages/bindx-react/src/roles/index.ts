/**
 * Role-based schema components for React Bindx.
 *
 * @packageDocumentation
 */

export type {
	RoleContextValue,
	EntityContextValue,
	HasRoleProviderValue,
	HasRoleProviderProps,
} from './RoleContext.js'

export {
	EntityContext,
	useEntityContext,
	createRoleContext,
	createUseRoleContext,
	HasRoleProvider,
	useHasRoleContext,
} from './RoleContext.js'

// Re-export everything from createBindx
export {
	createBindx,
	createRoleAwareBindx,
	type HasRoleProps,
	type HasRoleComponent,
	type SchemaInput,
	type ContemberSchemaLike,
	type UnifiedBindx,
	type RoleSchemasBase,
	type RoleAwareEntityByProps,
	type RoleAwareEntityCreateProps,
	type RoleAwareEntityProps,
	type RoleAwareEntityComponent,
	type RoleAwareEntityListProps,
	type RoleAwareEntityListComponent,
	type RoleAwareUseEntity,
	type RoleAwareUseEntityList,
	type RoleAwareCreateComponent,
} from '../hooks/createBindx.js'

// Re-export type helpers from bindx
export type { EntityRefFor, EntityForRoles } from '@contember/bindx'
