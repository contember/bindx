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

export type {
	RoleAwareEntityProps,
	RoleAwareEntityPropsWithRoles,
	RoleAwareEntityPropsWithoutRoles,
	RoleAwareEntityByPropsWithRoles,
	RoleAwareEntityByPropsWithoutRoles,
	RoleAwareEntityCreatePropsWithRoles,
	RoleAwareEntityCreatePropsWithoutRoles,
	RoleAwareEntityAllPropsWithRoles,
	RoleAwareEntityAllPropsWithoutRoles,
	RoleAwareEntityComponent,
	RoleAwareEntityListProps,
	RoleAwareEntityListPropsWithRoles,
	RoleAwareEntityListPropsWithoutRoles,
	RoleAwareEntityListComponent,
	HasRoleProps,
	HasRoleComponent,
	RoleAwareUseEntity,
	RoleAwareUseEntityList,
	RoleAwareBindx,
	RoleAwareFragmentFactory,
	RoleAwareFragmentConfigToProps,
	RoleAwareFragmentConfigToFragments,
	RoleAwareExplicitFragmentComponent,
	RoleAwareImplicitFragmentProperties,
	RoleAwareImplicitComponent,
	RoleAwareCreateComponentOptions,
	RoleAwareCreateComponent,
	SchemaInput,
	ContemberSchemaLike,
	// Helper types for generic contexts
	EntityAccessorForRoles,
	EntityForRolesObject,
} from './createRoleAwareBindx.js'

export {
	createRoleAwareBindx,
	RoleAwareProvider,
} from './createRoleAwareBindx.js'

// Re-export EntityRefFor type helper from bindx
export type { EntityRefFor } from '@contember/bindx'
