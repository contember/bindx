import React, { type ReactElement, type ReactNode } from 'react'
import {
	type SchemaDefinition,
	SchemaRegistry,
	type SelectionInput,
	type EntityRef,
	type EntityRefBase,
	type EntityAccessor,
	type AnyBrand,
	ContemberSchema,
	type IntersectRoleSchemas,
	type EntityForRoles,
} from '@contember/bindx'
import { useEntityImpl, type UseEntityOptions, type EntityAccessorResult } from './useEntityImpl.js'
import { useEntityListImpl, type UseEntityListOptions, type EntityListAccessorResult } from './useEntityListImpl.js'
import { useStableSelectionMeta } from './useStableSelectionMeta.js'
import {
	createComponentBuilder,
	COMPONENT_MARKER,
	COMPONENT_SELECTIONS,
	type SelectionPropMeta,
} from '../jsx/componentBuilder.js'
import type {
	ComponentBuilder,
	ComponentBuilderState,
	CreateComponentOptions,
} from '../jsx/componentBuilder.types.js'
import { Entity, type EntityProps } from '../jsx/components/Entity.js'
import { EntityList, type EntityListProps } from '../jsx/components/EntityList.js'
import { HasRole as HasRoleBase, type HasRoleComponentProps } from '../jsx/components/HasRole.js'
import {
	createRoleContext,
	createUseRoleContext,
	HasRoleProvider,
	type RoleContextValue,
} from '../roles/RoleContext.js'

// Re-export symbols needed for declaration files
export { COMPONENT_MARKER, COMPONENT_SELECTIONS, type SelectionPropMeta } from '../jsx/componentBuilder.js'

// Re-export types for convenience
export type { EntityFields } from '@contember/bindx'
export type { UseEntityOptions, EntityAccessorResult, LoadingEntityAccessor, ErrorEntityAccessor, NotFoundEntityAccessor, ReadyEntityAccessor } from './useEntityImpl.js'
export type { UseEntityListOptions, EntityListAccessorResult, LoadingEntityListAccessor, ErrorEntityListAccessor, ReadyEntityListAccessor } from './useEntityListImpl.js'

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Constraint for role schema maps.
 */
export type RoleSchemasBase<T> = { [K in keyof T]: Record<string, object> }

/**
 * Input types accepted by createBindx.
 */
export type SchemaInput =
	| SchemaDefinition<Record<string, object>>
	| ContemberSchema
	| ContemberSchemaLike
	| SchemaRegistry

/**
 * Interface for Contember schema compatibility.
 */
export interface ContemberSchemaLike {
	getEntityNames(): string[]
	getEntity(name: string): { fields: Map<string, { __typename: string; name: string; targetEntity?: string; type?: string }> } | undefined
}

function resolveSchemaRegistry(input: SchemaInput): SchemaRegistry {
	if (input instanceof SchemaRegistry) {
		return input
	}

	if (typeof input !== 'object' || input === null) {
		throw new Error('Invalid schema input: expected SchemaDefinition, ContemberSchema, or SchemaRegistry')
	}

	if ('getEntityNames' in input && typeof input.getEntityNames === 'function') {
		return SchemaRegistry.fromContemberSchema(input as ContemberSchema)
	}

	if ('entities' in input && typeof input.entities === 'object') {
		return new SchemaRegistry(input as SchemaDefinition<Record<string, object>>)
	}

	throw new Error('Invalid schema input: expected SchemaDefinition, ContemberSchema, or SchemaRegistry')
}

// ============================================================================
// HasRole Component Types
// ============================================================================

/**
 * Extract available roles from EntityRef/EntityRefBase type.
 */
type ExtractAvailableRoles<T> =
	T extends EntityRef<any, any, any, any, infer TRoles> ? TRoles :
	T extends EntityRefBase<any, any, any, any, infer TRoles> ? TRoles :
	readonly string[]

/**
 * Props for HasRole component.
 */
export interface HasRoleProps<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityRef extends EntityRefBase<any, any, any, any, any>,
	TNewRoles extends readonly (ExtractAvailableRoles<TEntityRef>[number] & keyof TRoleSchemas & string)[],
> {
	/** Roles to narrow scope to */
	roles: TNewRoles
	/** Parent entity reference */
	entity: TEntityRef
	/** Render function receiving entity accessor with narrowed type */
	children: (entity: EntityAccessor<
		EntityForRoles<TRoleSchemas, TNewRoles, TEntityRef['__entityName']>,
		EntityForRoles<TRoleSchemas, TNewRoles, TEntityRef['__entityName']>,
		AnyBrand,
		TEntityRef['__entityName'],
		TNewRoles,
		IntersectRoleSchemas<TRoleSchemas, TNewRoles>
	>) => ReactNode
}

/**
 * HasRole component type.
 */
export type HasRoleComponent<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> = <
	TEntityRef extends EntityRefBase<any, any, any, any, any>,
	const TNewRoles extends readonly (ExtractAvailableRoles<TEntityRef>[number] & keyof TRoleSchemas & string)[],
>(
	props: HasRoleProps<TRoleSchemas, TEntityRef, TNewRoles>,
) => ReactElement | null

// ============================================================================
// Role-Aware Types (for multi-role createBindx)
// ============================================================================

type AllRoleNames<TRoleSchemas> = keyof TRoleSchemas & string

export interface RoleAwareEntityByProps<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
	TRoles extends readonly (AllRoleNames<TRoleSchemas>)[],
> {
	name: TEntityName
	by: Record<string, unknown>
	roles: TRoles
	children: (entity: EntityAccessor<
		EntityForRoles<TRoleSchemas, TRoles, TEntityName>,
		EntityForRoles<TRoleSchemas, TRoles, TEntityName>,
		AnyBrand,
		TEntityName,
		TRoles,
		IntersectRoleSchemas<TRoleSchemas, TRoles>
	>) => ReactNode
	loading?: ReactNode
	error?: (error: Error) => ReactNode
	notFound?: ReactNode
}

export interface RoleAwareEntityCreateProps<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
	TRoles extends readonly (AllRoleNames<TRoleSchemas>)[],
> {
	name: TEntityName
	create: true
	roles?: TRoles
	children: (entity: EntityAccessor<
		EntityForRoles<TRoleSchemas, TRoles, TEntityName>,
		EntityForRoles<TRoleSchemas, TRoles, TEntityName>,
		AnyBrand,
		TEntityName,
		TRoles,
		IntersectRoleSchemas<TRoleSchemas, TRoles>
	>) => ReactNode
	error?: (error: Error) => ReactNode
	onPersisted?: (id: string) => void
}

export type RoleAwareEntityProps<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
	TRoles extends readonly (AllRoleNames<TRoleSchemas>)[],
> =
	| RoleAwareEntityByProps<TRoleSchemas, TEntityName, TRoles>
	| RoleAwareEntityCreateProps<TRoleSchemas, TEntityName, TRoles>

export type RoleAwareEntityComponent<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> = <
	TEntityName extends string,
	const TRoles extends readonly (AllRoleNames<TRoleSchemas>)[],
>(
	props: RoleAwareEntityProps<TRoleSchemas, TEntityName, TRoles>,
) => ReactElement | null

export interface RoleAwareEntityListProps<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
	TRoles extends readonly (AllRoleNames<TRoleSchemas>)[],
> {
	name: TEntityName
	roles?: TRoles
	filter?: Record<string, unknown>
	orderBy?: readonly Record<string, unknown>[]
	limit?: number
	offset?: number
	children: (entity: EntityAccessor<
		EntityForRoles<TRoleSchemas, TRoles, TEntityName>,
		EntityForRoles<TRoleSchemas, TRoles, TEntityName>,
		AnyBrand,
		TEntityName,
		TRoles,
		IntersectRoleSchemas<TRoleSchemas, TRoles>
	>, index: number) => ReactNode
	loading?: ReactNode
	error?: (error: Error) => ReactNode
	empty?: ReactNode
}

export type RoleAwareEntityListComponent<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> = <
	TEntityName extends string,
	const TRoles extends readonly (AllRoleNames<TRoleSchemas>)[],
>(
	props: RoleAwareEntityListProps<TRoleSchemas, TEntityName, TRoles>,
) => ReactElement | null

export type RoleAwareUseEntity<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> = <
	TEntityName extends string,
	TResult extends object,
	const TRoles extends readonly (AllRoleNames<TRoleSchemas>)[] = readonly (AllRoleNames<TRoleSchemas>)[],
>(
	entityType: TEntityName,
	options: UseEntityOptions & { roles?: TRoles },
	definer: SelectionInput<EntityForRoles<TRoleSchemas, TRoles, TEntityName>, TResult>,
) => EntityAccessorResult<EntityForRoles<TRoleSchemas, TRoles, TEntityName>, TResult>

export type RoleAwareUseEntityList<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> = <
	TEntityName extends string,
	TResult extends object,
	const TRoles extends readonly (AllRoleNames<TRoleSchemas>)[] = readonly (AllRoleNames<TRoleSchemas>)[],
>(
	entityType: TEntityName,
	options: UseEntityListOptions & { roles?: TRoles },
	definer: SelectionInput<EntityForRoles<TRoleSchemas, TRoles, TEntityName>, TResult>,
) => EntityListAccessorResult<TResult>

export type RoleAwareCreateComponent<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> = {
	(): ComponentBuilder<
		IntersectRoleSchemas<TRoleSchemas, readonly (AllRoleNames<TRoleSchemas>)[]>,
		// eslint-disable-next-line @typescript-eslint/ban-types
		ComponentBuilderState<IntersectRoleSchemas<TRoleSchemas, readonly (AllRoleNames<TRoleSchemas>)[]>, {}, object, readonly string[]>
	>
	<const TRoles extends readonly (AllRoleNames<TRoleSchemas>)[]>(
		options: { roles: TRoles },
	): ComponentBuilder<
		IntersectRoleSchemas<TRoleSchemas, TRoles>,
		// eslint-disable-next-line @typescript-eslint/ban-types
		ComponentBuilderState<IntersectRoleSchemas<TRoleSchemas, TRoles>, {}, object, TRoles>
	>
}

// ============================================================================
// Unified Bindx Return Type (for multi-role usage)
// ============================================================================

export interface UnifiedBindx<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> {
	schemaRegistry: SchemaRegistry
	useEntity: RoleAwareUseEntity<TRoleSchemas>
	useEntityList: RoleAwareUseEntityList<TRoleSchemas>
	Entity: RoleAwareEntityComponent<TRoleSchemas>
	EntityList: RoleAwareEntityListComponent<TRoleSchemas>
	createComponent: RoleAwareCreateComponent<TRoleSchemas>
	HasRole: HasRoleComponent<TRoleSchemas>
	RoleAwareProvider: typeof HasRoleProvider
	useRoleContext: () => RoleContextValue<TRoleSchemas>
}

// ============================================================================
// createBindx Implementation
// ============================================================================

/**
 * Creates type-safe bindx hooks and components for a specific schema.
 *
 * @example
 * ```ts
 * const schema = defineSchema<{
 *   Article: Article
 *   Author: Author
 * }>({...})
 *
 * export const { useEntity, useEntityList, Entity, createComponent } = createBindx(schema)
 * ```
 */
export function createBindx<TModels extends { [K in keyof TModels]: object }>(
	schemaDefinition: SchemaDefinition<TModels>,
) {
	const schemaRegistry = new SchemaRegistry(schemaDefinition)

	// Create role context for HasRole support
	type SingleRoleSchemas = { _default: TModels }
	const RoleContextInstance = createRoleContext<SingleRoleSchemas>()
	const useRoleContext = createUseRoleContext(RoleContextInstance)

	/**
	 * Hook to fetch and manage a single entity with full type inference.
	 */
	function useEntity<TEntityName extends keyof TModels & string, TResult extends object>(
		entityType: TEntityName,
		options: UseEntityOptions,
		definer: SelectionInput<TModels[TEntityName], TResult>,
	): EntityAccessorResult<TModels[TEntityName], TResult> {
		const selectionMeta = useStableSelectionMeta(definer)

		return useEntityImpl<TModels[TEntityName], TResult>(
			entityType,
			options,
			selectionMeta,
			schemaRegistry as SchemaRegistry<Record<string, object>>,
		)
	}

	/**
	 * Hook to fetch and manage a list of entities with full type inference.
	 */
	function useEntityList<TEntityName extends keyof TModels & string, TResult extends object>(
		entityType: TEntityName,
		options: UseEntityListOptions,
		definer: SelectionInput<TModels[TEntityName], TResult>,
	): EntityListAccessorResult<TResult> {
		const selectionMeta = useStableSelectionMeta(definer)

		return useEntityListImpl<TResult>(
			entityType,
			options,
			selectionMeta,
			schemaRegistry as SchemaRegistry<Record<string, object>>,
		)
	}

	// Create typed Entity component interface
	type TypedEntityComponent = <K extends keyof TModels & string>(
		props: EntityProps<TModels, K>
	) => ReactElement | null
	const TypedEntity = Entity as TypedEntityComponent

	// Create typed EntityList component interface
	type TypedEntityListComponent = <K extends keyof TModels & string>(
		props: EntityListProps<TModels, K>
	) => ReactElement | null
	const TypedEntityList = EntityList as TypedEntityListComponent

	/**
	 * Creates a component builder for defining bindx components.
	 */
	// eslint-disable-next-line @typescript-eslint/ban-types
	function createComponent(): ComponentBuilder<TModels, ComponentBuilderState<TModels, {}, object, readonly string[]>>
	function createComponent<TRoles extends readonly string[]>(
		options: CreateComponentOptions<TRoles>,
	// eslint-disable-next-line @typescript-eslint/ban-types
	): ComponentBuilder<TModels, ComponentBuilderState<TModels, {}, object, TRoles>>
	function createComponent(options?: CreateComponentOptions<readonly string[]>): ComponentBuilder<TModels, ComponentBuilderState<TModels>> {
		const roles = options?.roles ?? []
		return createComponentBuilder<TModels>(
			schemaRegistry as SchemaRegistry<Record<string, object>>,
			roles,
		) as ComponentBuilder<TModels, ComponentBuilderState<TModels>>
	}

	// HasRole with typed props for this schema
	const TypedHasRole = HasRoleBase as HasRoleComponent<SingleRoleSchemas>

	return {
		useEntity,
		useEntityList,
		Entity: TypedEntity,
		EntityList: TypedEntityList,
		createComponent,
		schemaRegistry,
		schema: schemaRegistry, // Backwards compatibility
		HasRole: TypedHasRole,
		RoleAwareProvider: HasRoleProvider,
		useRoleContext,
	}
}

// ============================================================================
// createRoleAwareBindx Implementation (for multi-role usage)
// ============================================================================

/**
 * Creates type-safe bindx hooks and components with multi-role support.
 *
 * @example
 * ```ts
 * interface RoleSchemas {
 *   public: { Article: PublicArticle }
 *   editor: { Article: EditorArticle }
 *   admin: { Article: AdminArticle }
 * }
 *
 * const { Entity, HasRole } = createRoleAwareBindx<RoleSchemas>(schema)
 *
 * <Entity name="Article" by={{ id }} roles={['editor', 'admin']}>
 *   {article => (
 *     <div>
 *       {article.title.value}
 *       <HasRole roles={['admin']} entity={article}>
 *         {adminArticle => <span>{adminArticle.internalNotes.value}</span>}
 *       </HasRole>
 *     </div>
 *   )}
 * </Entity>
 * ```
 */
export function createRoleAwareBindx<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>>(
	schemaInput: SchemaInput,
): UnifiedBindx<TRoleSchemas> {
	const schemaRegistry = resolveSchemaRegistry(schemaInput)

	// Create role context
	const RoleContextInstance = createRoleContext<TRoleSchemas>()
	const useRoleContext = createUseRoleContext(RoleContextInstance)

	/**
	 * Hook to fetch and manage a single entity with role-based typing.
	 */
	function useEntity<
		TEntityName extends string,
		TResult extends object,
		const TRoles extends readonly (AllRoleNames<TRoleSchemas>)[] = readonly (AllRoleNames<TRoleSchemas>)[],
	>(
		entityType: TEntityName,
		options: UseEntityOptions & { roles?: TRoles },
		definer: SelectionInput<EntityForRoles<TRoleSchemas, TRoles, TEntityName>, TResult>,
	): EntityAccessorResult<EntityForRoles<TRoleSchemas, TRoles, TEntityName>, TResult> {
		const selectionMeta = useStableSelectionMeta(definer)

		return useEntityImpl<EntityForRoles<TRoleSchemas, TRoles, TEntityName>, TResult>(
			entityType,
			options,
			selectionMeta,
			schemaRegistry as SchemaRegistry<Record<string, object>>,
		)
	}

	/**
	 * Hook to fetch and manage a list of entities with role-based typing.
	 */
	function useEntityList<
		TEntityName extends string,
		TResult extends object,
		const TRoles extends readonly (AllRoleNames<TRoleSchemas>)[] = readonly (AllRoleNames<TRoleSchemas>)[],
	>(
		entityType: TEntityName,
		options: UseEntityListOptions & { roles?: TRoles },
		definer: SelectionInput<EntityForRoles<TRoleSchemas, TRoles, TEntityName>, TResult>,
	): EntityListAccessorResult<TResult> {
		const { roles: _roles, ...restOptions } = options

		const selectionMeta = useStableSelectionMeta(definer)

		return useEntityListImpl<TResult>(
			entityType,
			restOptions,
			selectionMeta,
			schemaRegistry as SchemaRegistry<Record<string, object>>,
		)
	}

	// Type the Entity component
	const TypedEntity = Entity as RoleAwareEntityComponent<TRoleSchemas>

	// Type the EntityList component
	const TypedEntityList = EntityList as RoleAwareEntityListComponent<TRoleSchemas>

	/**
	 * Creates a component builder with role support.
	 */
	function createComponent(): ComponentBuilder<
		IntersectRoleSchemas<TRoleSchemas, readonly (AllRoleNames<TRoleSchemas>)[]>,
		// eslint-disable-next-line @typescript-eslint/ban-types
		ComponentBuilderState<IntersectRoleSchemas<TRoleSchemas, readonly (AllRoleNames<TRoleSchemas>)[]>, {}, object, readonly string[]>
	>
	function createComponent<const TRoles extends readonly (AllRoleNames<TRoleSchemas>)[]>(
		options: { roles: TRoles },
	): ComponentBuilder<
		IntersectRoleSchemas<TRoleSchemas, TRoles>,
		// eslint-disable-next-line @typescript-eslint/ban-types
		ComponentBuilderState<IntersectRoleSchemas<TRoleSchemas, TRoles>, {}, object, TRoles>
	>
	function createComponent(options?: { roles?: readonly string[] }): any {
		const roles = options?.roles ?? []
		return createComponentBuilder<Record<string, object>>(
			schemaRegistry as SchemaRegistry<Record<string, object>>,
			roles,
		)
	}

	// HasRole with typed props for this schema
	const TypedHasRole = HasRoleBase as HasRoleComponent<TRoleSchemas>

	return {
		schemaRegistry,
		useEntity: useEntity as RoleAwareUseEntity<TRoleSchemas>,
		useEntityList: useEntityList as RoleAwareUseEntityList<TRoleSchemas>,
		Entity: TypedEntity,
		EntityList: TypedEntityList,
		createComponent: createComponent as RoleAwareCreateComponent<TRoleSchemas>,
		HasRole: TypedHasRole,
		RoleAwareProvider: HasRoleProvider,
		useRoleContext,
	}
}
