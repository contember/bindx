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
	RoleAwareEntityComponent,
	RoleAwareEntityListProps,
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
	RoleAwareCreateComponentOptions,
	RoleAwareCreateComponent,
	SchemaInput,
	ContemberSchemaLike,
} from './createRoleAwareBindx.js'

export {
	createRoleAwareBindx,
	RoleAwareProvider,
} from './createRoleAwareBindx.js'
