/**
 * Factory for creating role-aware bindx hooks and components.
 *
 * This provides type-safe data binding with role-based schema narrowing.
 */

import React, { useMemo, memo, useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode, type ReactElement, type ComponentType } from 'react'
import {
	type IntersectRoleSchemas,
	type EntityForRoles,
	type EntityNamesForRoles,
	type EntityRef,
	type EntityAccessor,
	type SelectedEntityFields,
	SchemaRegistry,
	resolveSelectionMeta,
	type SelectionInput,
	type SelectionBuilder,
	type FluentFragment,
	type SelectionMeta,
	type SelectionFieldMeta,
	createSelectionBuilder,
	SELECTION_META,
	ComponentBrand,
	AnyBrand,
	type RolesAreSubset,
	type SchemaDefinition,
	ContemberSchema,
	type EntityWhere,
	type EntityOrderBy,
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
import type { EntityAccessor as JsxEntityAccessor } from '../jsx/types.js'
import {
	COMPONENT_MARKER,
	COMPONENT_SELECTIONS,
	type SelectionPropMeta,
} from '../jsx/index.js'
import {
	assignFragmentProperties,
} from '../jsx/createComponent.js'
import {
	createComponentBuilder,
} from '../jsx/componentBuilder.js'
import type {
	ComponentBuilder,
	ComponentBuilderState,
} from '../jsx/componentBuilder.types.js'
import { createCollectorProxy } from '../jsx/proxy.js'
import { collectSelection } from '../jsx/analyzer.js'
import { SelectionMetaCollector, mergeSelections } from '../jsx/SelectionMeta.js'

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Constraint for role schema maps that works with interfaces (no index signature required).
 */
type RoleSchemasBase<T> = { [K in keyof T]: { [E: string]: object } }

/**
 * Helper type to extract entity type with object constraint.
 * Ensures the result is always an object type, falling back to `object` if the entity doesn't exist.
 */
export type EntityForRolesObject<
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

// ============================================================================
// Implicit Mode Types (role-aware)
// ============================================================================

/**
 * Extract keys from props type where value is EntityRef<any, any>
 */
type RoleAwareEntityPropKeys<P> = {
	[K in keyof P]: P[K] extends EntityRef<infer _T, infer _S, infer _B, infer _N, infer _R> ? K : never
}[keyof P]

/**
 * Extract the full entity type from an EntityRef prop
 */
type RoleAwareEntityFromProp<P, K extends keyof P> = P[K] extends EntityRef<infer T, infer _S, infer _B, infer _N, infer _R> ? T : never

/**
 * Extract the selection type from an EntityRef prop
 */
type RoleAwareSelectionFromProp<P, K extends keyof P> = P[K] extends EntityRef<infer _T, infer S, infer _B, infer _N, infer _R> ? S : never

/**
 * Extract the roles type from an EntityRef prop
 */
type RoleAwareRolesFromProp<P, K extends keyof P> = P[K] extends EntityRef<infer _T, infer _S, infer _B, infer _N, infer R> ? R : readonly string[]

/**
 * Fragment properties for role-aware implicit mode - $propName for each entity prop
 * Includes role information in the fragment type.
 */
export type RoleAwareImplicitFragmentProperties<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	P,
	TRoles extends readonly string[]
> = {
	[K in RoleAwareEntityPropKeys<P> as `$${K & string}`]: FluentFragment<
		RoleAwareEntityFromProp<P, K>,
		RoleAwareSelectionFromProp<P, K>,
		AnyBrand,
		TRoles
	>
}

/**
 * Component type for role-aware implicit mode.
 */
export type RoleAwareImplicitComponent<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	P extends object,
	TRoles extends readonly string[]
> = RoleAwareBindxComponentBase<P, TRoles> & RoleAwareImplicitFragmentProperties<TRoleSchemas, P, TRoles>

/**
 * Options for role-aware createComponent.
 */
export interface RoleAwareCreateComponentOptions<TRoles extends readonly string[]> {
	/** Roles that this component requires. Entity must have ALL these roles available. */
	roles: TRoles
}

/**
 * Role-aware createComponent function type.
 * Uses the new builder pattern for defining components.
 *
 * @example
 * ```typescript
 * // Implicit mode - selection collected from JSX
 * const AdminArticleCard = createComponent({ roles: ['admin'] })
 *   .entity('article', 'Article')
 *   .render(({ article }) => (
 *     <div>{article.fields.internalNotes.value}</div>
 *   ))
 *
 * // Explicit mode - selection defined upfront
 * const AdminArticleCard = createComponent({ roles: ['admin'] })
 *   .entity('article', 'Article', e => e.id().title().internalNotes())
 *   .render(({ article }) => (
 *     <div>{article.data?.internalNotes}</div>
 *   ))
 *
 * // With scalar props
 * const AdminArticleCard = createComponent({ roles: ['admin'] })
 *   .entity('article', 'Article')
 *   .props<{ showNotes?: boolean }>()
 *   .render(({ article, showNotes }) => ...)
 * ```
 */
export type RoleAwareCreateComponent<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> = {
	/**
	 * Creates a component builder with role restrictions.
	 * Returns a fluent builder for defining entity props and the render function.
	 */
	<const TRoles extends readonly (keyof TRoleSchemas & string)[]>(
		options: RoleAwareCreateComponentOptions<TRoles>,
	): ComponentBuilder<
		IntersectRoleSchemas<TRoleSchemas, TRoles>,
		// eslint-disable-next-line @typescript-eslint/ban-types
		ComponentBuilderState<IntersectRoleSchemas<TRoleSchemas, TRoles>, {}, object, TRoles>
	>
}

// ============================================================================
// Entity Component Types
// ============================================================================

// --- By Mode Props (edit/fetch existing entity) ---

/**
 * Base props for Entity "by" mode (fetching existing entity).
 */
interface RoleAwareEntityByPropsBase<TEntityName extends string> {
	/** Entity type name */
	name: TEntityName

	/** Unique field(s) to identify the entity (e.g., { id: '...' } or { slug: '...' }) */
	by: Record<string, unknown>

	/** Loading fallback */
	loading?: ReactNode

	/** Error fallback */
	error?: (error: Error) => ReactNode

	/** Not found fallback */
	notFound?: ReactNode

	/** Discriminator - create mode not allowed */
	create?: never

	/** Discriminator - onPersisted not allowed in by mode */
	onPersisted?: never
}

/**
 * Props for Entity "by" mode with roles specified.
 */
export interface RoleAwareEntityByPropsWithRoles<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
	TRoles extends readonly (keyof TRoleSchemas & string)[],
> extends RoleAwareEntityByPropsBase<TEntityName> {
	/** Roles for entity type narrowing */
	roles: TRoles

	/** Render function receiving typed entity accessor with direct field access */
	children: (entity: EntityAccessor<
		EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>,
		EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>,
		AnyBrand,
		TEntityName,
		TRoles,
		IntersectRoleSchemas<TRoleSchemas, TRoles>
	>) => ReactNode
}

/**
 * Props for Entity "by" mode without roles.
 */
export interface RoleAwareEntityByPropsWithoutRoles<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
> extends RoleAwareEntityByPropsBase<TEntityName> {
	/** Optional roles */
	roles?: undefined

	/** Render function receiving untyped entity accessor */
	children: (entity: EntityAccessor<object, object, AnyBrand, TEntityName, readonly string[]>) => ReactNode
}

// --- Create Mode Props ---

/**
 * Base props for Entity "create" mode (creating new entity).
 */
interface RoleAwareEntityCreatePropsBase<TEntityName extends string> {
	/** Entity type name */
	name: TEntityName

	/** Create a new entity instead of fetching an existing one */
	create: true

	/** Callback when entity is persisted and receives server-assigned ID */
	onPersisted?: (id: string) => void

	/** Error fallback */
	error?: (error: Error) => ReactNode

	/** Discriminator - by not allowed in create mode */
	by?: never

	/** Discriminator - loading not applicable in create mode */
	loading?: never

	/** Discriminator - notFound not applicable in create mode */
	notFound?: never
}

/**
 * Props for Entity "create" mode with roles specified.
 */
export interface RoleAwareEntityCreatePropsWithRoles<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
	TRoles extends readonly (keyof TRoleSchemas & string)[],
> extends RoleAwareEntityCreatePropsBase<TEntityName> {
	/** Roles for entity type narrowing */
	roles: TRoles

	/** Render function receiving typed entity accessor with direct field access */
	children: (entity: EntityAccessor<
		EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>,
		EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>,
		AnyBrand,
		TEntityName,
		TRoles,
		IntersectRoleSchemas<TRoleSchemas, TRoles>
	>) => ReactNode
}

/**
 * Props for Entity "create" mode without roles.
 */
export interface RoleAwareEntityCreatePropsWithoutRoles<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
> extends RoleAwareEntityCreatePropsBase<TEntityName> {
	/** Optional roles */
	roles?: undefined

	/** Render function receiving untyped entity accessor */
	children: (entity: EntityAccessor<object, object, AnyBrand, TEntityName, readonly string[]>) => ReactNode
}

// --- Legacy aliases for backward compatibility ---

/** @deprecated Use RoleAwareEntityByPropsWithRoles instead */
export type RoleAwareEntityPropsWithRoles<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
	TRoles extends readonly (keyof TRoleSchemas & string)[],
> = RoleAwareEntityByPropsWithRoles<TRoleSchemas, TEntityName, TRoles>

/** @deprecated Use RoleAwareEntityByPropsWithoutRoles instead */
export type RoleAwareEntityPropsWithoutRoles<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
> = RoleAwareEntityByPropsWithoutRoles<TRoleSchemas, TEntityName>

// --- Union Types ---

/**
 * All Entity props variants with roles.
 */
export type RoleAwareEntityAllPropsWithRoles<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
	TRoles extends readonly (keyof TRoleSchemas & string)[],
> = RoleAwareEntityByPropsWithRoles<TRoleSchemas, TEntityName, TRoles>
	| RoleAwareEntityCreatePropsWithRoles<TRoleSchemas, TEntityName, TRoles>

/**
 * All Entity props variants without roles.
 */
export type RoleAwareEntityAllPropsWithoutRoles<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
> = RoleAwareEntityByPropsWithoutRoles<TRoleSchemas, TEntityName>
	| RoleAwareEntityCreatePropsWithoutRoles<TRoleSchemas, TEntityName>

/**
 * Props for Entity component with optional roles.
 * This is a conditional type - for generic contexts, use RoleAwareEntityByPropsWithRoles directly.
 */
export type RoleAwareEntityProps<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
	TRoles extends readonly (keyof TRoleSchemas & string)[] | undefined,
> = TRoles extends readonly (keyof TRoleSchemas & string)[]
	? RoleAwareEntityAllPropsWithRoles<TRoleSchemas, TEntityName, TRoles>
	: RoleAwareEntityAllPropsWithoutRoles<TRoleSchemas, TEntityName>

/**
 * Entity component type that accepts optional roles prop.
 * Has overloads for both with-roles and without-roles variants to support generic contexts.
 * Supports both "by" mode (fetch existing) and "create" mode (create new).
 */
export interface RoleAwareEntityComponent<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> {
	// Overload for "by" mode with roles specified
	<
		TEntityName extends string,
		TRoles extends readonly (keyof TRoleSchemas & string)[],
	>(props: RoleAwareEntityByPropsWithRoles<TRoleSchemas, TEntityName, TRoles>): ReactElement | null

	// Overload for "by" mode without roles
	<TEntityName extends string>(
		props: RoleAwareEntityByPropsWithoutRoles<TRoleSchemas, TEntityName>,
	): ReactElement | null

	// Overload for "create" mode with roles specified
	<
		TEntityName extends string,
		TRoles extends readonly (keyof TRoleSchemas & string)[],
	>(props: RoleAwareEntityCreatePropsWithRoles<TRoleSchemas, TEntityName, TRoles>): ReactElement | null

	// Overload for "create" mode without roles
	<TEntityName extends string>(
		props: RoleAwareEntityCreatePropsWithoutRoles<TRoleSchemas, TEntityName>,
	): ReactElement | null

	// General overload with conditional type (for backward compatibility)
	<
		TEntityName extends string,
		const TRoles extends readonly (keyof TRoleSchemas & string)[] | undefined = undefined,
	>(props: RoleAwareEntityProps<TRoleSchemas, TEntityName, TRoles>): ReactElement | null
}

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

	/** Optional filter criteria - type-safe based on entity schema when roles are provided */
	filter?: TRoles extends readonly (keyof TRoleSchemas & string)[]
		? EntityWhere<EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>>
		: Record<string, unknown>

	/** Optional roles - when provided, entity type is narrowed to intersection of these roles */
	roles?: TRoles

	/** Render function receiving typed entity accessor with direct field access and index */
	children: TRoles extends readonly (keyof TRoleSchemas & string)[]
		? (entity: EntityAccessor<
				EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>,
				EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>,
				AnyBrand,
				TEntityName,
				TRoles,
				IntersectRoleSchemas<TRoleSchemas, TRoles>
			>, index: number) => ReactNode
		: (entity: EntityAccessor<object, object, AnyBrand, TEntityName, readonly string[]>, index: number) => ReactNode

	/** Loading fallback */
	loading?: ReactNode

	/** Error fallback */
	error?: (error: Error) => ReactNode

	/** Empty state fallback */
	empty?: ReactNode
}

/**
 * Props for EntityList component with roles specified (non-conditional).
 * Use this when you need to pass props in generic contexts where conditional types can't be resolved.
 */
export interface RoleAwareEntityListPropsWithRoles<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
	TRoles extends readonly (keyof TRoleSchemas & string)[],
> {
	/** Entity type name */
	name: TEntityName

	/** Filter criteria - type-safe based on entity schema */
	filter?: EntityWhere<EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>>

	/** Roles for entity type narrowing */
	roles: TRoles

	/** Render function receiving typed entity accessor with direct field access and index */
	children: (entity: EntityAccessor<
		EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>,
		EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>,
		AnyBrand,
		TEntityName,
		TRoles,
		IntersectRoleSchemas<TRoleSchemas, TRoles>
	>, index: number) => ReactNode

	/** Loading fallback */
	loading?: ReactNode

	/** Error fallback */
	error?: (error: Error) => ReactNode

	/** Empty state fallback */
	empty?: ReactNode
}

/**
 * Props for EntityList component without roles (non-conditional).
 */
export interface RoleAwareEntityListPropsWithoutRoles<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
> {
	/** Entity type name */
	name: TEntityName

	/** Filter criteria */
	filter?: Record<string, unknown>

	/** Optional roles */
	roles?: undefined

	/** Render function receiving untyped entity accessor */
	children: (entity: EntityAccessor<object, object, AnyBrand, TEntityName, readonly string[]>, index: number) => ReactNode

	/** Loading fallback */
	loading?: ReactNode

	/** Error fallback */
	error?: (error: Error) => ReactNode

	/** Empty state fallback */
	empty?: ReactNode
}

/**
 * EntityList component type that accepts optional roles prop.
 * Has overloads for both with-roles and without-roles variants to support generic contexts.
 */
export interface RoleAwareEntityListComponent<TRoleSchemas extends RoleSchemasBase<TRoleSchemas>> {
	// Overload for with roles specified (non-conditional children type)
	<
		TEntityName extends string,
		TRoles extends readonly (keyof TRoleSchemas & string)[],
	>(props: RoleAwareEntityListPropsWithRoles<TRoleSchemas, TEntityName, TRoles>): ReactElement | null

	// Overload for without roles
	<TEntityName extends string>(
		props: RoleAwareEntityListPropsWithoutRoles<TRoleSchemas, TEntityName>,
	): ReactElement | null

	// General overload with conditional type (for backward compatibility)
	<
		TEntityName extends string,
		const TRoles extends readonly (keyof TRoleSchemas & string)[] | undefined = undefined,
	>(props: RoleAwareEntityListProps<TRoleSchemas, TEntityName, TRoles>): ReactElement | null
}

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
 * Extract entity type from EntityRef type.
 */
type ExtractEntityType<T> = T extends EntityRef<infer TEntity, any, any, any, any> ? TEntity : object

/**
 * Helper type that looks up entity type by name in role schemas, or falls back to the input entity type.
 * This enables HasRole to work even when entity name is `string` (e.g., from relation accessors).
 */
type EntityTypeForRolesOrFallback<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TNewRoles extends readonly (keyof TRoleSchemas)[],
	TEntityName extends string,
	TFallback,
> = TEntityName extends keyof IntersectRoleSchemas<TRoleSchemas, TNewRoles>
	? EntityForRolesObject<TRoleSchemas, TNewRoles, TEntityName>
	: TFallback

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

	/** Render function receiving entity accessor with narrowed type and direct field access.
	 * Type is looked up from role schemas if entity name is known, otherwise uses the input entity type.
	 * Schema is passed through for proper entity name resolution in nested relations.
	 */
	children: (
		entity: EntityAccessor<
			EntityTypeForRolesOrFallback<TRoleSchemas, TNewRoles, ExtractEntityName<TEntityRef>, ExtractEntityType<TEntityRef>>,
			EntityTypeForRolesOrFallback<TRoleSchemas, TNewRoles, ExtractEntityName<TEntityRef>, ExtractEntityType<TEntityRef>>,
			AnyBrand,
			ExtractEntityName<TEntityRef>,
			TNewRoles,
			IntersectRoleSchemas<TRoleSchemas, TNewRoles>
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

function resolveSchemaRegistry(input: SchemaInput): SchemaRegistry {
	// Already a SchemaRegistry
	if (input instanceof SchemaRegistry) {
		return input
	}

	if (typeof input !== 'object' || input === null) {
		throw new Error('Invalid schema input: expected SchemaDefinition, ContemberSchema, or SchemaRegistry')
	}

	// ContemberSchema-like (has getEntityNames/getEntity methods)
	if ('getEntityNames' in input && typeof input.getEntityNames === 'function') {
		return SchemaRegistry.fromContemberSchema(input as ContemberSchema)
	}

	// SchemaDefinition (has entities object)
	if ('entities' in input && typeof input.entities === 'object') {
		return new SchemaRegistry(input as SchemaDefinition<Record<string, object>>)
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
	 * Supports both "by" mode (fetch existing) and "create" mode (create new).
	 */
	function EntityComponent<
		TEntityName extends string,
		const TRoles extends readonly (keyof TRoleSchemas & string)[] | undefined = undefined,
	>(props: RoleAwareEntityProps<TRoleSchemas, TEntityName, TRoles>): ReactElement | null {
		// Check if we're in create mode
		const isCreateMode = 'create' in props && props.create === true

		if (isCreateMode) {
			return <EntityCreateModeImpl
				name={props.name}
				roles={(props as any).roles}
				children={props.children as any}
				error={props.error}
				onPersisted={(props as any).onPersisted}
			/>
		}

		const byProps = props as any
		return <EntityByModeImpl
			name={byProps.name}
			by={byProps.by}
			roles={byProps.roles}
			children={byProps.children}
			loading={byProps.loading}
			error={byProps.error}
			notFound={byProps.notFound}
		/>
	}

	/**
	 * Internal props for by mode implementation.
	 */
	interface EntityByModeImplProps {
		name: string
		by: Record<string, unknown>
		roles: readonly string[] | undefined
		children: (entity: JsxEntityAccessor<object>) => ReactNode
		loading?: ReactNode
		error?: (error: Error) => ReactNode
		notFound?: ReactNode
	}

	/**
	 * Internal component for "by" mode (fetching existing entity).
	 */
	function EntityByModeImpl({
		name,
		by,
		roles,
		children: renderFn,
		loading,
		error: errorFallback,
		notFound,
	}: EntityByModeImplProps): ReactElement | null {
		const { store } = useBindxContext()

		// Stable key for the 'by' clause
		const byKey = useMemo(() => JSON.stringify(by), [by])

		// Phase 1: Collect JSX selection (same as standard Entity)
		const { selection, queryKey } = useSelectionCollection({
			entityType: name,
			entityId: byKey,
			children: renderFn,
		})

		// Phase 2: Load data using core hook (same as standard Entity)
		const result = useEntityCore({
			entityType: name,
			by,
			selectionMeta: selection,
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
			const byDescription = Object.entries(by).map(([k, v]) => `${k}="${v}"`).join(', ')
			return <>{notFound ?? <div className="bindx-not-found">{name} with {byDescription} not found</div>}</>
		}

		// Phase 3: Runtime render with real data (same as standard Entity)
		// Get ID from loaded snapshot data
		const entityId = (result.snapshot?.data as Record<string, unknown> | undefined)?.['id'] as string
		const accessor = createRuntimeAccessor<object>(
			name,
			entityId,
			store,
			() => {}, // Changes are automatically handled by useSyncExternalStore
		)

		// Role-aware addition: wrap in Proxy to inject __availableRoles while preserving direct field access
		// We can't use spread because it breaks the Proxy behavior
		const roleAwareAccessor = new Proxy(accessor, {
			get(target, prop) {
				if (prop === '__availableRoles') {
					return roles ?? []
				}
				return Reflect.get(target, prop)
			},
		})

		// Provide entity context for HasRole
		const entityContext: EntityContextValue = {
			entityType: name,
			entityId,
			storeKey: `${name}:${entityId}`,
		}

		return (
			<EntityContext.Provider value={entityContext}>
				{renderFn(roleAwareAccessor as any)}
			</EntityContext.Provider>
		)
	}

	/**
	 * Snapshot type for create mode subscription
	 */
	interface CreateModeSnapshot {
		version: number
		persistedId: string | null
	}

	/**
	 * Internal props for create mode implementation.
	 */
	interface EntityCreateModeImplProps {
		name: string
		roles: readonly string[] | undefined
		children: (entity: JsxEntityAccessor<object>) => ReactNode
		error?: (error: Error) => ReactNode
		onPersisted?: (id: string) => void
	}

	/**
	 * Internal component for "create" mode (creating new entity).
	 */
	function EntityCreateModeImpl({
		name,
		roles,
		children: renderFn,
		error: errorFallback,
		onPersisted,
	}: EntityCreateModeImplProps): ReactElement {
		const { store } = useBindxContext()
		const tempIdRef = useRef<string | null>(null)

		// Create entity once on mount (using ref to ensure only one creation)
		const tempId = useMemo(() => {
			if (tempIdRef.current) {
				return tempIdRef.current
			}
			const id = store.createEntity(name)
			tempIdRef.current = id
			return id
		}, [name, store])

		// Subscribe to store changes for this entity
		const subscribe = useCallback(
			(callback: () => void) => store.subscribeToEntity(name, tempId, callback),
			[store, name, tempId],
		)

		// Cache ref for snapshot stability
		const snapshotCacheRef = useRef<CreateModeSnapshot | null>(null)

		const getSnapshot = useCallback((): CreateModeSnapshot => {
			const entitySnapshot = store.getEntitySnapshot(name, tempId)
			const persistedId = store.getPersistedId(name, tempId)
			const version = entitySnapshot?.version ?? 0

			// Return cached snapshot if values haven't changed
			const cached = snapshotCacheRef.current
			if (cached && cached.version === version && cached.persistedId === persistedId) {
				return cached
			}

			// Create new snapshot and cache it
			const newSnapshot: CreateModeSnapshot = { version, persistedId }
			snapshotCacheRef.current = newSnapshot
			return newSnapshot
		}, [store, name, tempId])

		const { persistedId } = useSyncExternalStore(
			subscribe,
			getSnapshot,
			getSnapshot, // Server snapshot same as client for create mode
		)

		// Track previous persistedId to call onPersisted only once
		const prevPersistedIdRef = useRef<string | null>(null)

		useEffect(() => {
			if (persistedId && persistedId !== prevPersistedIdRef.current) {
				prevPersistedIdRef.current = persistedId
				onPersisted?.(persistedId)
			}
		}, [persistedId, onPersisted])

		// Selection collection still works for building mutations
		useSelectionCollection({
			entityType: name,
			entityId: tempId,
			children: renderFn,
		})

		// Create runtime accessor
		const accessor = createRuntimeAccessor<object>(
			name,
			tempId,
			store,
			() => {}, // Changes are automatically handled by useSyncExternalStore
		)

		// Role-aware addition: wrap in Proxy to inject __availableRoles while preserving direct field access
		const roleAwareAccessor = new Proxy(accessor, {
			get(target, prop) {
				if (prop === '__availableRoles') {
					return roles ?? []
				}
				return Reflect.get(target, prop)
			},
		})

		// Provide entity context for HasRole
		const entityContext: EntityContextValue = {
			entityType: name,
			entityId: tempId,
			storeKey: `${name}:${tempId}`,
		}

		return (
			<EntityContext.Provider value={entityContext}>
				{renderFn(roleAwareAccessor as any)}
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
		const { selection, queryKey } = useSelectionCollectionForList({
			entityType,
			filter,
			children: renderFn as (entity: JsxEntityAccessor<object>, index: number) => ReactNode,
		})

		// Phase 2: Load data using core hook (same as standard EntityList)
		const result = useEntityListCore({
			entityType,
			filter,
			selectionMeta: selection,
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

			// Role-aware addition: wrap in Proxy to inject __availableRoles while preserving direct field access
			const roleAwareAccessor = new Proxy(accessor, {
				get(target, prop) {
					if (prop === '__availableRoles') {
						return (roles ?? []) as TRoles extends readonly string[] ? TRoles : readonly string[]
					}
					return Reflect.get(target, prop)
				},
			})

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

		// Runtime check - does user have ANY of the requested roles?
		const hasAnyRole = requestedRoles.some(role => hasRole(role))
		if (!hasAnyRole) {
			return null // User doesn't have any of the requested roles
		}

		// Create new entity accessor with narrowed available roles using Proxy
		// We can't use spread because it would break the Proxy behavior for direct field access
		const narrowedEntityRef = new Proxy(entity, {
			get(target, prop) {
				if (prop === '__availableRoles') {
					return requestedRoles
				}
				return Reflect.get(target, prop)
			},
		})

		return <>{renderFn(narrowedEntityRef as any)}</>
	}

	// Wrap in memo to make it an object (required for getSelection detection in analyzer)
	const MemoizedHasRole = memo(HasRoleComponent) as typeof HasRoleComponent

	// Add getSelection to HasRoleComponent for JSX analysis
	// This allows the analyzer to collect field selections from HasRole children
	const hasRoleWithSelection = MemoizedHasRole as typeof MemoizedHasRole & SelectionProvider
	hasRoleWithSelection.getSelection = (
		props: Record<string, unknown>,
		collectNested: (element: ReactNode) => void,
	): SelectionFieldMeta[] | null => {
		const typedProps = props as unknown as HasRoleProps<TRoleSchemas, EntityRef<any, any, any, any, any>, readonly string[]>
		// Call children with the entity to trigger field accesses on the collector proxy
		// During collection phase, props.entity is a collector proxy, so accessing fields
		// will record them in the parent scope
		const childrenJsx = typedProps.children(typedProps.entity as any)

		// Analyze the returned JSX for nested component selections
		// The collectNested function actually returns SelectionMeta despite the local interface signature
		const childSelection = (collectNested as (children: ReactNode) => SelectionMeta)(childrenJsx)

		// Return all fields from the child selection
		const result: SelectionFieldMeta[] = []
		for (const field of childSelection.fields.values()) {
			result.push(field)
		}

		return result.length > 0 ? result : null
	}

	/**
	 * Role-aware createComponent - uses the unified builder pattern.
	 * Returns a ComponentBuilder that creates components with role information attached.
	 */
	function roleAwareCreateComponent<
		const TRoles extends readonly (keyof TRoleSchemas & string)[],
	>(
		options: RoleAwareCreateComponentOptions<TRoles>,
	): ComponentBuilder<
		IntersectRoleSchemas<TRoleSchemas, TRoles>,
		// eslint-disable-next-line @typescript-eslint/ban-types
		ComponentBuilderState<IntersectRoleSchemas<TRoleSchemas, TRoles>, {}, object, TRoles>
	> {
		const { roles } = options
		return createComponentBuilder<IntersectRoleSchemas<TRoleSchemas, TRoles>>(
			schemaRegistry as SchemaRegistry<Record<string, object>>,
			roles,
		) as unknown as ComponentBuilder<
			IntersectRoleSchemas<TRoleSchemas, TRoles>,
			// eslint-disable-next-line @typescript-eslint/ban-types
			ComponentBuilderState<IntersectRoleSchemas<TRoleSchemas, TRoles>, {}, object, TRoles>
		>
	}

	return {
		schemaRegistry,
		RoleAwareProvider: HasRoleProvider,
		Entity: EntityComponent as RoleAwareEntityComponent<TRoleSchemas>,
		EntityList: EntityListComponent as RoleAwareEntityListComponent<TRoleSchemas>,
		HasRole: MemoizedHasRole as HasRoleComponent<TRoleSchemas>,
		useEntity: useEntityHook as RoleAwareUseEntity<TRoleSchemas>,
		useEntityList: useEntityListHook as RoleAwareUseEntityList<TRoleSchemas>,
		useRoleContext,
		createComponent: roleAwareCreateComponent as RoleAwareCreateComponent<TRoleSchemas>,
	}
}

// Re-export for backwards compatibility
export { HasRoleProvider as RoleAwareProvider } from './RoleContext.js'

// ============================================================================
// Helper Types for Generic Contexts
// ============================================================================

/**
 * Helper type to get EntityAccessor type for a given entity name and roles.
 * Useful for typing components that render entities in generic contexts.
 *
 * @example
 * ```typescript
 * type CommentAccessor = EntityAccessorForRoles<RoleSchemas, 'Comment', typeof roles>
 *
 * interface MyComponentProps<TEntityName extends string> {
 *   entityName: TEntityName
 *   children: (entity: EntityAccessorForRoles<RoleSchemas, TEntityName, typeof roles>) => ReactNode
 * }
 * ```
 */
export type EntityAccessorForRoles<
	TRoleSchemas extends RoleSchemasBase<TRoleSchemas>,
	TEntityName extends string,
	TRoles extends readonly (keyof TRoleSchemas & string)[],
> = EntityAccessor<
	EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>,
	EntityForRolesObject<TRoleSchemas, TRoles, TEntityName>,
	AnyBrand,
	TEntityName,
	TRoles,
	IntersectRoleSchemas<TRoleSchemas, TRoles>
>

