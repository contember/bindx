/**
 * Factory for creating role-aware bindx hooks and components.
 *
 * This provides type-safe data binding with role-based schema narrowing.
 */

import React, { useMemo, memo, type ReactNode, type ReactElement, type ComponentType } from 'react'
import {
	type IntersectRoleSchemas,
	type EntityForRoles,
	type EntityNamesForRoles,
	type EntityRef,
	type SelectedEntityFields,
	SchemaRegistry,
	resolveSelectionMeta,
	type SelectionInput,
	type SelectionBuilder,
	type FluentFragment,
	type SelectionMeta,
	createSelectionBuilder,
	SELECTION_META,
	ComponentBrand,
	AnyBrand,
	type RolesAreSubset,
	type SchemaDefinition,
	ContemberSchema,
} from '@contember/bindx'
import {
	createRoleContext,
	createUseRoleContext,
	EntityContext,
	type RoleContextValue,
	type EntityContextValue,
	useHasRoleContext,
	HasRoleProvider,
} from './RoleContext.js'
import { useBindxContext } from '../hooks/BackendAdapterContext.js'
import { useEntityImpl } from '../hooks/useEntityImpl.js'
import { useEntityListImpl } from '../hooks/useEntityListImpl.js'
import { useSelectionCollection } from '../hooks/useSelectionCollection.js'
import { useSelectionCollectionForList } from '../hooks/useSelectionCollectionForList.js'
import { useEntityCore } from '../hooks/useEntityCore.js'
import { useEntityListCore } from '../hooks/useEntityListCore.js'
import { createRuntimeAccessor } from '../jsx/proxy.js'
import type { UseEntityOptions, EntityAccessorResult, UseEntityListOptions, EntityListAccessorResult } from '../hooks/index.js'
import type { EntityRef as JsxEntityRef } from '../jsx/types.js'
import {
	COMPONENT_MARKER,
	COMPONENT_SELECTIONS,
	type SelectionPropMeta,
} from '../jsx/index.js'
import {
	assignFragmentProperties,
} from '../jsx/createComponent.js'

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Constraint for role schema maps that works with interfaces (no index signature required).
 */
type RoleSchemasBase<T> = { [K in keyof T]: { [E: string]: object } }

/**
 * Helper type to extract entity type with object constraint.
 */
type EntityForRolesObject<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TRoles extends readonly (keyof TRoleSchemas)[],
	TEntityName extends string,
> = EntityForRoles<TRoleSchemas, TRoles, TEntityName> extends object
	? EntityForRoles<TRoleSchemas, TRoles, TEntityName>
	: object

// ============================================================================
// Role-Aware Fragment Factory Types
// ============================================================================

/**
 * Fragment factory that is aware of roles.
 * Creates typed SelectionBuilders restricted to specific roles.
 */
export interface RoleAwareFragmentFactory<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TRoles extends readonly (keyof TRoleSchemas & string)[],
> {
	/**
	 * Creates a typed SelectionBuilder for the specified entity,
	 * using the intersection of all specified roles.
	 */
	fragment<E extends EntityNamesForRoles<TRoleSchemas, TRoles>>(
		entityName: E,
	): SelectionBuilder<EntityForRolesObject<TRoleSchemas, TRoles, E>>
}

/**
 * Extract model type from SelectionBuilder
 */
type ExtractBuilderModel<T> = T extends SelectionBuilder<infer M, infer _R, infer _N> ? M : never

/**
 * Extract result type from SelectionBuilder
 */
type ExtractBuilderResult<T> = T extends SelectionBuilder<infer _M, infer R, infer _N> ? R : never

/**
 * Convert fragment config to props types with role-narrowed entity types.
 */
export type RoleAwareFragmentConfigToProps<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TConfig,
	TRoles extends readonly (keyof TRoleSchemas & string)[],
> = {
	[K in keyof TConfig]: TConfig[K] extends SelectionBuilder<infer _M, infer R, infer _N>
		? EntityRef<
				EntityForRolesObject<TRoleSchemas, TRoles, string>,
				R,
				AnyBrand,
				string,
				TRoles
			>
		: never
}

/**
 * Fragment properties for role-aware explicit mode.
 * Includes role information in the fragment type.
 */
export type RoleAwareFragmentConfigToFragments<
	TConfig,
	TRoles extends readonly string[],
> = {
	[K in keyof TConfig as `$${K & string}`]: TConfig[K] extends SelectionBuilder<infer M, infer R, infer _N>
		? FluentFragment<M, R, AnyBrand, TRoles>
		: never
}

/**
 * Combined props = scalar props + entity props from fragments with roles.
 */
type RoleAwareCombinedPropsWithFragments<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TScalarProps extends object,
	TConfig,
	TRoles extends readonly (keyof TRoleSchemas & string)[],
> = TScalarProps & RoleAwareFragmentConfigToProps<TRoleSchemas, TConfig, TRoles>

/**
 * Selection provider interface for JSX analysis
 */
interface SelectionProvider {
	getSelection: (
		props: Record<string, unknown>,
		collectNested: (element: ReactNode) => void,
	) => { fieldName: string; alias: string; path: string[]; isRelation: boolean; isArray: boolean; nested?: SelectionMeta }[] | null
}

/**
 * Base component type with markers
 */
type RoleAwareBindxComponentBase<TProps extends object, TRoles extends readonly string[]> = ComponentType<TProps> &
	SelectionProvider & {
		readonly [COMPONENT_MARKER]: true
		readonly [COMPONENT_SELECTIONS]: Map<string, SelectionPropMeta>
		readonly __componentRoles: TRoles
	}

/**
 * Component type for role-aware explicit mode with fragments.
 */
export type RoleAwareExplicitFragmentComponent<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TScalarProps extends object,
	TConfig,
	TRoles extends readonly (keyof TRoleSchemas & string)[],
> = RoleAwareBindxComponentBase<
	RoleAwareCombinedPropsWithFragments<TRoleSchemas, TScalarProps, TConfig, TRoles>,
	TRoles
> & RoleAwareFragmentConfigToFragments<TConfig, TRoles>

/**
 * Options for role-aware createComponent.
 */
export interface RoleAwareCreateComponentOptions<TRoles extends readonly string[]> {
	/** Roles that this component requires. Entity must have ALL these roles available. */
	roles: TRoles
}

/**
 * Role-aware createComponent function type.
 */
export type RoleAwareCreateComponent<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> = {
	/**
	 * Creates a component with explicit role restrictions and fragment definitions.
	 *
	 * @example
	 * ```typescript
	 * const AdminArticleCard = createComponent({
	 *   roles: ['admin'] as const,
	 * }, (it) => ({
	 *   article: it.fragment('Article').internalNotes().title(),
	 * }), ({ article }) => (
	 *   <div>{article.data?.internalNotes}</div>
	 * ))
	 * ```
	 */
	<
		const TRoles extends readonly (keyof TRoleSchemas & string)[],
		TConfig extends Record<string, SelectionBuilder<object, object, object>>,
	>(
		options: RoleAwareCreateComponentOptions<TRoles>,
		definer: (factory: RoleAwareFragmentFactory<TRoleSchemas, TRoles>) => TConfig,
		render: (props: RoleAwareCombinedPropsWithFragments<TRoleSchemas, object, TConfig, TRoles>) => ReactNode,
	): RoleAwareExplicitFragmentComponent<TRoleSchemas, object, TConfig, TRoles>

	/**
	 * Creates a component with scalar props, role restrictions, and fragment definitions.
	 *
	 * @example
	 * ```typescript
	 * const AdminArticleCard = createComponent<{ showNotes?: boolean }>()({
	 *   roles: ['admin'] as const,
	 * }, (it) => ({
	 *   article: it.fragment('Article').internalNotes().title(),
	 * }), ({ article, showNotes }) => (
	 *   <div>
	 *     <h1>{article.data?.title}</h1>
	 *     {showNotes && <p>{article.data?.internalNotes}</p>}
	 *   </div>
	 * ))
	 * ```
	 */
	<TScalarProps extends object>(): <
		const TRoles extends readonly (keyof TRoleSchemas & string)[],
		TConfig extends Record<string, SelectionBuilder<object, object, object>>,
	>(
		options: RoleAwareCreateComponentOptions<TRoles>,
		definer: (factory: RoleAwareFragmentFactory<TRoleSchemas, TRoles>) => TConfig,
		render: (props: RoleAwareCombinedPropsWithFragments<TRoleSchemas, TScalarProps, TConfig, TRoles>) => ReactNode,
	) => RoleAwareExplicitFragmentComponent<TRoleSchemas, TScalarProps, TConfig, TRoles>
}

// ============================================================================
// Entity Component Types
// ============================================================================

/**
 * Props for Entity component with optional roles.
 */
export interface RoleAwareEntityProps<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
	TRoles extends readonly (keyof TRoleSchemas & string)[] | undefined,
> {
	/** Entity type name */
	name: TEntityName

	/** Entity ID */
	id: string

	/** Optional roles - when provided, entity type is narrowed to intersection of these roles */
	roles?: TRoles

	/** Render function receiving typed entity ref */
	children: TRoles extends readonly (keyof TRoleSchemas & string)[]
		? (entity: EntityRef<
				EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>,
				EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>,
				AnyBrand,
				TEntityName,
				TRoles
			>) => ReactNode
		: (entity: EntityRef<object, object, AnyBrand, TEntityName, readonly string[]>) => ReactNode

	/** Loading fallback */
	loading?: ReactNode

	/** Error fallback */
	error?: (error: Error) => ReactNode

	/** Not found fallback */
	notFound?: ReactNode
}

/**
 * Entity component type that accepts optional roles prop.
 */
export type RoleAwareEntityComponent<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> = <
	TEntityName extends string,
	const TRoles extends readonly (keyof TRoleSchemas & string)[] | undefined = undefined,
>(
	props: RoleAwareEntityProps<TRoleSchemas, TEntityName, TRoles>,
) => ReactElement | null

// ============================================================================
// EntityList Component Types
// ============================================================================

/**
 * Props for EntityList component with optional roles.
 */
export interface RoleAwareEntityListProps<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
	TRoles extends readonly (keyof TRoleSchemas & string)[] | undefined,
> {
	/** Entity type name */
	name: TEntityName

	/** Optional filter criteria */
	filter?: Record<string, unknown>

	/** Optional roles - when provided, entity type is narrowed to intersection of these roles */
	roles?: TRoles

	/** Render function receiving typed entity ref and index */
	children: TRoles extends readonly (keyof TRoleSchemas & string)[]
		? (entity: EntityRef<
				EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>,
				EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>,
				AnyBrand,
				TEntityName,
				TRoles
			>, index: number) => ReactNode
		: (entity: EntityRef<object, object, AnyBrand, TEntityName, readonly string[]>, index: number) => ReactNode

	/** Loading fallback */
	loading?: ReactNode

	/** Error fallback */
	error?: (error: Error) => ReactNode

	/** Empty state fallback */
	empty?: ReactNode
}

/**
 * EntityList component type that accepts optional roles prop.
 */
export type RoleAwareEntityListComponent<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> = <
	TEntityName extends string,
	const TRoles extends readonly (keyof TRoleSchemas & string)[] | undefined = undefined,
>(
	props: RoleAwareEntityListProps<TRoleSchemas, TEntityName, TRoles>,
) => ReactElement | null

// ============================================================================
// HasRole Component Types
// ============================================================================

/**
 * Extract available roles from EntityRef type.
 */
type ExtractAvailableRoles<T> = T extends EntityRef<any, any, any, any, infer TRoles> ? TRoles : readonly string[]

/**
 * Extract entity name from EntityRef type.
 */
type ExtractEntityName<T> = T extends EntityRef<any, any, any, infer TName, any> ? TName : string

/**
 * Props for HasRole component.
 */
export interface HasRoleProps<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityRef extends EntityRef<any, any, any, any, any>,
	TNewRoles extends readonly (ExtractAvailableRoles<TEntityRef>[number] & string)[],
> {
	/** Roles to narrow scope to */
	roles: TNewRoles

	/** Parent entity reference */
	entity: TEntityRef

	/** Render function receiving entity ref with narrowed type */
	children: (
		entity: EntityRef<
			EntityForRolesObject<TRoleSchemas, TNewRoles, ExtractEntityName<TEntityRef>>,
			EntityForRolesObject<TRoleSchemas, TNewRoles, ExtractEntityName<TEntityRef>>,
			AnyBrand,
			ExtractEntityName<TEntityRef>,
			TNewRoles
		>,
	) => ReactNode
}

/**
 * HasRole component type.
 */
export type HasRoleComponent<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> = <
	TEntityRef extends EntityRef<any, any, any, any, any>,
	const TNewRoles extends readonly (ExtractAvailableRoles<TEntityRef>[number] & string)[],
>(
	props: HasRoleProps<TRoleSchemas, TEntityRef, TNewRoles>,
) => ReactElement | null

// ============================================================================
// useEntity Hook Type
// ============================================================================

/**
 * Role-aware useEntity hook type.
 */
export type RoleAwareUseEntity<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> = <
	TEntityName extends string,
	TResult extends object,
	const TRoles extends readonly (keyof TRoleSchemas & string)[] | undefined = undefined,
>(
	entityType: TEntityName,
	options: UseEntityOptions & { roles?: TRoles },
	definer: TRoles extends readonly (keyof TRoleSchemas & string)[]
		? SelectionInput<EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>, TResult>
		: SelectionInput<object, TResult>,
) => EntityAccessorResult<
	TRoles extends readonly (keyof TRoleSchemas & string)[]
		? EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>
		: object,
	TResult
>

/**
 * Role-aware useEntityList hook type.
 */
export type RoleAwareUseEntityList<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> = <
	TEntityName extends string,
	TResult extends object,
	const TRoles extends readonly (keyof TRoleSchemas & string)[] | undefined = undefined,
>(
	entityType: TEntityName,
	options: UseEntityListOptions & { roles?: TRoles },
	definer: TRoles extends readonly (keyof TRoleSchemas & string)[]
		? SelectionInput<EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>, TResult>
		: SelectionInput<object, TResult>,
) => EntityListAccessorResult<TResult>

// ============================================================================
// Factory Return Type
// ============================================================================

export interface RoleAwareBindx<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> {
	/** The schema registry */
	schemaRegistry: SchemaRegistry

	/** Provider for hasRole function - wrap at app level */
	RoleAwareProvider: typeof HasRoleProvider

	/** Entity component with optional roles prop */
	Entity: RoleAwareEntityComponent<TRoleSchemas>

	/** EntityList component with optional roles prop */
	EntityList: RoleAwareEntityListComponent<TRoleSchemas>

	/** HasRole component for conditional rendering and type narrowing */
	HasRole: HasRoleComponent<TRoleSchemas>

	/** Hook for fetching entities with optional roles */
	useEntity: RoleAwareUseEntity<TRoleSchemas>

	/** Hook for fetching entity lists with optional roles */
	useEntityList: RoleAwareUseEntityList<TRoleSchemas>

	/** Hook to access role context */
	useRoleContext: () => RoleContextValue<TRoleSchemas>

	/**
	 * Creates a role-aware component with typed fragments.
	 *
	 * @example
	 * ```typescript
	 * const AdminArticleCard = createComponent({
	 *   roles: ['admin'] as const,
	 * }, (it) => ({
	 *   article: it.fragment('Article').internalNotes().title(),
	 * }), ({ article }) => (
	 *   <div>{article.data?.internalNotes}</div>
	 * ))
	 *
	 * // Using fragment - type error if scope doesn't include 'admin'
	 * <Entity name="Article" id={id} roles={['editor', 'admin']}>
	 *   {article => <AdminArticleCard article={article} />}
	 * </Entity>
	 * ```
	 */
	createComponent: RoleAwareCreateComponent<TRoleSchemas>
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Interface for binding-common's Schema class compatibility.
 * If the input has these methods, it's treated as a ContemberSchema-like object.
 */
export interface ContemberSchemaLike {
	getEntityNames(): string[]
	getEntity(name: string): { fields: Map<string, { __typename: string; name: string; targetEntity?: string; type?: string }> } | undefined
}

/**
 * Input types accepted by createRoleAwareBindx.
 * Can be a SchemaDefinition, ContemberSchema (from API), binding-common Schema, or SchemaRegistry.
 */
export type SchemaInput =
	| SchemaDefinition<Record<string, object>>
	| ContemberSchema
	| ContemberSchemaLike
	| SchemaRegistry

function isContemberSchemaLike(input: unknown): input is ContemberSchemaLike {
	return (
		typeof input === 'object' &&
		input !== null &&
		'getEntityNames' in input &&
		typeof (input as ContemberSchemaLike).getEntityNames === 'function' &&
		'getEntity' in input &&
		typeof (input as ContemberSchemaLike).getEntity === 'function'
	)
}

function isSchemaRegistry(input: unknown): input is SchemaRegistry {
	return input instanceof SchemaRegistry
}

function isSchemaDefinition(input: unknown): input is SchemaDefinition<Record<string, object>> {
	return (
		typeof input === 'object' &&
		input !== null &&
		'entities' in input &&
		typeof (input as SchemaDefinition<Record<string, object>>).entities === 'object'
	)
}

function resolveSchemaRegistry(input: SchemaInput): SchemaRegistry {
	if (isSchemaRegistry(input)) {
		return input
	}

	if (isContemberSchemaLike(input)) {
		return SchemaRegistry.fromContemberSchema(input as ContemberSchema)
	}

	if (isSchemaDefinition(input)) {
		return new SchemaRegistry(input)
	}

	throw new Error('Invalid schema input: expected SchemaDefinition, ContemberSchema, or SchemaRegistry')
}

/**
 * Creates role-aware bindx hooks and components.
 *
 * @example
 * ```typescript
 * interface RoleSchemas {
 *   public: { Article: PublicArticle; Author: PublicAuthor }
 *   editor: { Article: EditorArticle; Author: EditorAuthor }
 *   admin: { Article: AdminArticle; Author: AdminAuthor }
 * }
 *
 * // From SchemaDefinition (generated)
 * const bindx = createRoleAwareBindx<RoleSchemas>(schemaDefinition)
 *
 * // From ContemberSchema (loaded from API)
 * const schema = await SchemaLoader.loadSchema(client)
 * const bindx = createRoleAwareBindx<RoleSchemas>(schema)
 *
 * // From binding-common's Schema (via useEnvironment)
 * const schema = useEnvironment().getSchema()
 * const bindx = createRoleAwareBindx<RoleSchemas>(schema)
 *
 * // Usage - provider at app level:
 * <RoleAwareProvider hasRole={(role) => userRoles.has(role)}>
 *   <App />
 * </RoleAwareProvider>
 *
 * // Usage - Entity with roles:
 * <Entity name="Article" id={id} roles={['editor', 'admin']}>
 *   {article => (
 *     <>
 *       <div>{article.data?.title}</div>
 *       <HasRole roles={['admin']} entity={article}>
 *         {adminArticle => <div>{adminArticle.data?.internalNotes}</div>}
 *       </HasRole>
 *     </>
 *   )}
 * </Entity>
 * ```
 */
export function createRoleAwareBindx<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>>(
	schema: SchemaInput,
): RoleAwareBindx<TRoleSchemas> {
	// Resolve the schema registry from whatever input was provided
	const schemaRegistry = resolveSchemaRegistry(schema)

	// Create the role context
	const RoleContextInstance = createRoleContext<TRoleSchemas>()
	const useRoleContext = createUseRoleContext(RoleContextInstance)

	/**
	 * Role-aware useEntity hook.
	 */
	function useEntityHook<
		TEntityName extends string,
		TResult extends object,
		const TRoles extends readonly (keyof TRoleSchemas & string)[] | undefined = undefined,
	>(
		entityType: TEntityName,
		options: UseEntityOptions & { roles?: TRoles },
		definer: SelectionInput<object, TResult>,
	): EntityAccessorResult<object, TResult> {
		const selectionMeta = useMemo(
			() => resolveSelectionMeta(definer),
			// eslint-disable-next-line react-hooks/exhaustive-deps
			[entityType],
		)

		return useEntityImpl<object, TResult>(
			entityType,
			options,
			selectionMeta,
			schemaRegistry as SchemaRegistry<Record<string, object>>,
		)
	}

	/**
	 * Role-aware useEntityList hook.
	 */
	function useEntityListHook<
		TEntityName extends string,
		TResult extends object,
		const TRoles extends readonly (keyof TRoleSchemas & string)[] | undefined = undefined,
	>(
		entityType: TEntityName,
		options: UseEntityListOptions & { roles?: TRoles },
		definer: SelectionInput<object, TResult>,
	): EntityListAccessorResult<TResult> {
		const { roles: _roles, ...restOptions } = options

		const selectionMeta = useMemo(
			() => resolveSelectionMeta(definer),
			// eslint-disable-next-line react-hooks/exhaustive-deps
			[entityType],
		)

		return useEntityListImpl<TResult>(
			entityType,
			restOptions,
			selectionMeta,
			schemaRegistry as SchemaRegistry<Record<string, object>>,
		)
	}

	/**
	 * Entity component with optional roles prop.
	 * Uses proper JSX selection collection like standard Entity.
	 */
	function EntityComponent<
		TEntityName extends string,
		const TRoles extends readonly (keyof TRoleSchemas & string)[] | undefined = undefined,
	>({
		name,
		id,
		roles,
		children: renderFn,
		loading,
		error: errorFallback,
		notFound,
	}: RoleAwareEntityProps<TRoleSchemas, TEntityName, TRoles>): ReactElement | null {
		const { store } = useBindxContext()
		const entityType = name as string

		// Phase 1: Collect JSX selection (same as standard Entity)
		const { standardSelection, queryKey } = useSelectionCollection({
			entityType,
			entityId: id,
			children: renderFn as (entity: JsxEntityRef<object>) => ReactNode,
		})

		// Phase 2: Load data using core hook (same as standard Entity)
		const result = useEntityCore({
			entityType,
			id,
			selectionMeta: standardSelection,
			queryKey,
		})

		// Render based on status
		if (result.status === 'loading') {
			return <>{loading ?? <div className="bindx-loading">Loading...</div>}</>
		}

		if (result.status === 'error') {
			if (errorFallback) {
				return <>{errorFallback(result.error!)}</>
			}
			return <div className="bindx-error"><strong>Error:</strong> {result.error!.message}</div>
		}

		if (result.status === 'not_found') {
			return <>{notFound ?? <div className="bindx-not-found">{entityType} with id &quot;{id}&quot; not found</div>}</>
		}

		// Phase 3: Runtime render with real data (same as standard Entity)
		const accessor = createRuntimeAccessor<object>(
			entityType,
			id,
			store,
			() => {}, // Changes are automatically handled by useSyncExternalStore
		)

		// Role-aware addition: inject __availableRoles
		const roleAwareAccessor = {
			...accessor,
			__availableRoles: (roles ?? []) as TRoles extends readonly string[] ? TRoles : readonly string[],
		}

		// Provide entity context for HasRole
		const entityContext: EntityContextValue = {
			entityType,
			entityId: id,
			storeKey: `${entityType}:${id}`,
		}

		return (
			<EntityContext.Provider value={entityContext}>
				{(renderFn as unknown as (entity: typeof roleAwareAccessor) => ReactNode)(roleAwareAccessor)}
			</EntityContext.Provider>
		)
	}

	/**
	 * EntityList component with optional roles prop.
	 * Uses proper JSX selection collection like standard EntityList.
	 */
	function EntityListComponent<
		TEntityName extends string,
		const TRoles extends readonly (keyof TRoleSchemas & string)[] | undefined = undefined,
	>({
		name,
		filter,
		roles,
		children: renderFn,
		loading,
		error: errorFallback,
		empty,
	}: RoleAwareEntityListProps<TRoleSchemas, TEntityName, TRoles>): ReactElement | null {
		const { store } = useBindxContext()
		const entityType = name as string

		// Phase 1: Collect JSX selection (same as standard EntityList)
		const { standardSelection, queryKey } = useSelectionCollectionForList({
			entityType,
			filter,
			children: renderFn as (entity: JsxEntityRef<object>, index: number) => ReactNode,
		})

		// Phase 2: Load data using core hook (same as standard EntityList)
		const result = useEntityListCore({
			entityType,
			filter,
			selectionMeta: standardSelection,
			queryKey,
		})

		// Render based on status
		if (result.status === 'loading') {
			return <>{loading ?? <div className="bindx-loading">Loading...</div>}</>
		}

		if (result.status === 'error') {
			if (errorFallback) {
				return <>{errorFallback(result.error!)}</>
			}
			return <div className="bindx-error"><strong>Error:</strong> {result.error!.message}</div>
		}

		// Empty state
		if (result.items.length === 0) {
			return <>{empty ?? <div className="bindx-empty">No {entityType} items found</div>}</>
		}

		// Phase 3: Runtime render with real data (same as standard EntityList)
		const items = result.items.map((item, index) => {
			const accessor = createRuntimeAccessor<object>(
				entityType,
				item.id,
				store,
				() => {}, // Changes are automatically handled by useSyncExternalStore
			)

			// Role-aware addition: inject __availableRoles
			const roleAwareAccessor = {
				...accessor,
				__availableRoles: (roles ?? []) as TRoles extends readonly string[] ? TRoles : readonly string[],
			}

			return (
				<React.Fragment key={item.id}>
					{(renderFn as unknown as (entity: typeof roleAwareAccessor, index: number) => ReactNode)(roleAwareAccessor, index)}
				</React.Fragment>
			)
		})

		return <>{items}</>
	}

	/**
	 * HasRole component - conditionally renders with narrowed role scope.
	 * Reads hasRole function from context (HasRoleProvider).
	 */
	function HasRoleComponent<
		TEntityRef extends EntityRef<any, any, any, any, any>,
		const TNewRoles extends readonly (ExtractAvailableRoles<TEntityRef>[number] & string)[],
	>({
		roles: requestedRoles,
		entity,
		children: renderFn,
	}: HasRoleProps<TRoleSchemas, TEntityRef, TNewRoles>): ReactElement | null {
		const hasRoleContext = useHasRoleContext()

		if (!hasRoleContext) {
			throw new Error('HasRole requires RoleAwareProvider (HasRoleProvider) to be present in the component tree')
		}

		const { hasRole } = hasRoleContext

		// Validate: requested roles must be subset of available roles
		const availableRoles = entity.__availableRoles
		if (availableRoles.length > 0) {
			const invalidRoles = requestedRoles.filter(
				role => !availableRoles.includes(role),
			)
			if (invalidRoles.length > 0) {
				throw new Error(
					`HasRole: roles [${invalidRoles.map(String).join(', ')}] are not available. ` +
					`Available roles: [${availableRoles.map(String).join(', ')}]`,
				)
			}
		}

		// Runtime check - does user have ALL requested roles?
		const missingRoles = requestedRoles.filter(role => !hasRole(role))
		if (missingRoles.length > 0) {
			return null // User doesn't have all required roles
		}

		// Create new entity ref with narrowed available roles
		const narrowedEntityRef = {
			...entity,
			__availableRoles: requestedRoles,
		}

		return <>{renderFn(narrowedEntityRef as any)}</>
	}

	/**
	 * Role-aware createComponent implementation.
	 */
	function createComponentImpl<
		const TRoles extends readonly (keyof TRoleSchemas & string)[],
		TScalarProps extends object,
		TConfig extends Record<string, SelectionBuilder<object, object, object>>,
	>(
		optionsOrNothing?: RoleAwareCreateComponentOptions<TRoles>,
	): unknown {
		// Signature 2: createComponent<ScalarProps>() - returns builder
		if (optionsOrNothing === undefined) {
			return <
				const TRoles2 extends readonly (keyof TRoleSchemas & string)[],
				TConfig2 extends Record<string, SelectionBuilder<object, object, object>>,
			>(
				options: RoleAwareCreateComponentOptions<TRoles2>,
				definer: (factory: RoleAwareFragmentFactory<TRoleSchemas, TRoles2>) => TConfig2,
				render: (props: RoleAwareCombinedPropsWithFragments<TRoleSchemas, TScalarProps, TConfig2, TRoles2>) => ReactNode,
			) => {
				return createRoleAwareComponent<TRoles2, TScalarProps, TConfig2>(options, definer, render)
			}
		}

		// Will be called with definer and render in the actual implementation
		// This function returns a builder for the two-arg case
		return (
			definer: (factory: RoleAwareFragmentFactory<TRoleSchemas, TRoles>) => TConfig,
			render: (props: RoleAwareCombinedPropsWithFragments<TRoleSchemas, TScalarProps, TConfig, TRoles>) => ReactNode,
		) => {
			return createRoleAwareComponent<TRoles, TScalarProps, TConfig>(
				optionsOrNothing as RoleAwareCreateComponentOptions<TRoles>,
				definer,
				render,
			)
		}
	}

	/**
	 * Creates a role-aware component with explicit fragment definitions.
	 */
	function createRoleAwareComponent<
		const TRoles extends readonly (keyof TRoleSchemas & string)[],
		TScalarProps extends object,
		TConfig extends Record<string, SelectionBuilder<object, object, object>>,
	>(
		options: RoleAwareCreateComponentOptions<TRoles>,
		definer: (factory: RoleAwareFragmentFactory<TRoleSchemas, TRoles>) => TConfig,
		render: (props: RoleAwareCombinedPropsWithFragments<TRoleSchemas, TScalarProps, TConfig, TRoles>) => ReactNode,
	): RoleAwareExplicitFragmentComponent<TRoleSchemas, TScalarProps, TConfig, TRoles> {
		const { roles } = options
		const selectionsMap = new Map<string, SelectionPropMeta>()

		// Generate unique brand for this component
		const componentBrand = new ComponentBrand(`role_aware_${roles.join('_')}_${Math.random().toString(36).slice(2)}`)

		// Create the role-aware fragment factory
		// The runtime doesn't actually use the entity name, but the type system uses it for inference
		const fragmentFactory = {
			fragment<E extends EntityNamesForRoles<TRoleSchemas, TRoles>>(_entityName: E) {
				return createSelectionBuilder<EntityForRolesObject<TRoleSchemas, TRoles, E>>()
			},
		} as RoleAwareFragmentFactory<TRoleSchemas, TRoles>

		// Execute definer to get fragment config
		const config = definer(fragmentFactory)

		// Process each fragment in config
		for (const [propName, builder] of Object.entries(config)) {
			// Get SelectionMeta from the builder
			const selection = (builder as SelectionBuilder<object, object, object>)[SELECTION_META]

			const fragment: FluentFragment<unknown, object, typeof componentBrand, TRoles> = {
				__meta: selection,
				__resultType: {} as object,
				__modelType: undefined as unknown,
				__isFragment: true,
				__brand: componentBrand,
				__brands: new Set([componentBrand.brandSymbol]),
				__availableRoles: roles,
				__roles: roles,
			}

			selectionsMap.set(propName, { selection, fragment })
		}

		// Create React component
		function ComponentImpl(props: RoleAwareCombinedPropsWithFragments<TRoleSchemas, TScalarProps, TConfig, TRoles>): ReactNode {
			return render(props)
		}

		const MemoizedComponent = memo(ComponentImpl) as unknown as
			RoleAwareBindxComponentBase<RoleAwareCombinedPropsWithFragments<TRoleSchemas, TScalarProps, TConfig, TRoles>, TRoles>

		// SelectionProvider for JSX analysis
		MemoizedComponent.getSelection = (_props, _collectNested) => {
			const fields: { fieldName: string; alias: string; path: string[]; isRelation: boolean; isArray: boolean; nested?: SelectionMeta }[] = []
			for (const [_propName, meta] of selectionsMap) {
				for (const [_key, field] of meta.selection.fields) {
					fields.push({ ...field })
				}
			}
			return fields.length > 0 ? fields : null
		}

		// Add markers (role-aware version uses COMPONENT_MARKER/COMPONENT_SELECTIONS but not BINDX_COMPONENT)
		const comp = MemoizedComponent as unknown as Record<symbol, unknown>
		comp[COMPONENT_MARKER] = true
		comp[COMPONENT_SELECTIONS] = selectionsMap
		;(MemoizedComponent as unknown as { __componentRoles: TRoles }).__componentRoles = roles

		// Add $propName properties
		assignFragmentProperties(MemoizedComponent, selectionsMap)

		return MemoizedComponent as unknown as RoleAwareExplicitFragmentComponent<TRoleSchemas, TScalarProps, TConfig, TRoles>
	}

	// Wrapper function to match the overloaded signature
	function roleAwareCreateComponent<
		const TRoles extends readonly (keyof TRoleSchemas & string)[],
		TConfig extends Record<string, SelectionBuilder<object, object, object>>,
	>(
		options: RoleAwareCreateComponentOptions<TRoles>,
		definer: (factory: RoleAwareFragmentFactory<TRoleSchemas, TRoles>) => TConfig,
		render: (props: RoleAwareCombinedPropsWithFragments<TRoleSchemas, object, TConfig, TRoles>) => ReactNode,
	): RoleAwareExplicitFragmentComponent<TRoleSchemas, object, TConfig, TRoles>
	function roleAwareCreateComponent<TScalarProps extends object>(): <
		const TRoles extends readonly (keyof TRoleSchemas & string)[],
		TConfig extends Record<string, SelectionBuilder<object, object, object>>,
	>(
		options: RoleAwareCreateComponentOptions<TRoles>,
		definer: (factory: RoleAwareFragmentFactory<TRoleSchemas, TRoles>) => TConfig,
		render: (props: RoleAwareCombinedPropsWithFragments<TRoleSchemas, TScalarProps, TConfig, TRoles>) => ReactNode,
	) => RoleAwareExplicitFragmentComponent<TRoleSchemas, TScalarProps, TConfig, TRoles>
	function roleAwareCreateComponent<
		const TRoles extends readonly (keyof TRoleSchemas & string)[],
		TScalarProps extends object = object,
		TConfig extends Record<string, SelectionBuilder<object, object, object>> = Record<string, SelectionBuilder<object, object, object>>,
	>(
		options?: RoleAwareCreateComponentOptions<TRoles>,
		definer?: (factory: RoleAwareFragmentFactory<TRoleSchemas, TRoles>) => TConfig,
		render?: (props: RoleAwareCombinedPropsWithFragments<TRoleSchemas, TScalarProps, TConfig, TRoles>) => ReactNode,
	): unknown {
		// Signature 2: createComponent<ScalarProps>() - returns builder function
		if (options === undefined) {
			return <
				const TRoles2 extends readonly (keyof TRoleSchemas & string)[],
				TConfig2 extends Record<string, SelectionBuilder<object, object, object>>,
			>(
				innerOptions: RoleAwareCreateComponentOptions<TRoles2>,
				innerDefiner: (factory: RoleAwareFragmentFactory<TRoleSchemas, TRoles2>) => TConfig2,
				innerRender: (props: RoleAwareCombinedPropsWithFragments<TRoleSchemas, TScalarProps, TConfig2, TRoles2>) => ReactNode,
			) => {
				return createRoleAwareComponent<TRoles2, TScalarProps, TConfig2>(innerOptions, innerDefiner, innerRender)
			}
		}

		// Signature 1: createComponent(options, definer, render)
		if (definer && render) {
			return createRoleAwareComponent<TRoles, TScalarProps, TConfig>(options, definer, render)
		}

		throw new Error('Invalid createComponent arguments')
	}

	return {
		schemaRegistry,
		RoleAwareProvider: HasRoleProvider,
		Entity: EntityComponent as RoleAwareEntityComponent<TRoleSchemas>,
		EntityList: EntityListComponent as RoleAwareEntityListComponent<TRoleSchemas>,
		HasRole: HasRoleComponent as HasRoleComponent<TRoleSchemas>,
		useEntity: useEntityHook as RoleAwareUseEntity<TRoleSchemas>,
		useEntityList: useEntityListHook as RoleAwareUseEntityList<TRoleSchemas>,
		useRoleContext,
		createComponent: roleAwareCreateComponent as RoleAwareCreateComponent<TRoleSchemas>,
	}
}

// Re-export for backwards compatibility
export { HasRoleProvider as RoleAwareProvider } from './RoleContext.js'
