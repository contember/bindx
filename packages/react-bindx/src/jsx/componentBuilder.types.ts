/**
 * Type definitions for the unified createComponent builder API.
 *
 * This provides a fluent builder interface for creating bindx components
 * with support for both implicit (JSX-analyzed) and explicit (selector-based)
 * entity props, scalar props, and optional role constraints.
 */

import type { ReactNode, ComponentType } from 'react'
import type {
	EntityRef,
	EntityAccessor,
	FluentFragment,
	SelectionBuilder,
	AnyBrand,
	SelectionMeta,
} from '@contember/bindx'
import type { SelectionProvider } from './types.js'

// ============================================================================
// Symbols (re-exported from createComponent.ts)
// ============================================================================

export declare const COMPONENT_MARKER: unique symbol
export declare const COMPONENT_BRAND: unique symbol
export declare const COMPONENT_SELECTIONS: unique symbol

// ============================================================================
// Entity Prop Configuration
// ============================================================================

/**
 * Configuration for a single entity prop.
 * Can be implicit (selection from JSX) or explicit (selection from selector).
 */
export interface EntityPropConfig<
	TEntityName extends string = string,
	TSelected extends object = object,
	TIsImplicit extends boolean = boolean,
> {
	readonly entityName: TEntityName
	readonly isImplicit: TIsImplicit
	readonly __selected: TSelected
}

/**
 * Creates an implicit entity prop config type.
 */
export type ImplicitEntityConfig<TEntityName extends string, TEntity extends object> =
	EntityPropConfig<TEntityName, TEntity, true>

/**
 * Creates an explicit entity prop config type.
 */
export type ExplicitEntityConfig<TEntityName extends string, TSelected extends object> =
	EntityPropConfig<TEntityName, TSelected, false>

// ============================================================================
// Interface Entity Prop Configuration
// ============================================================================

/**
 * Configuration for an interface-based entity prop.
 * Unlike EntityPropConfig, this doesn't require a specific entity name.
 * Instead, it constrains the TSelected type to extend TInterface.
 */
export interface InterfaceEntityPropConfig<
	TInterface extends object = object,
	TIsImplicit extends boolean = boolean,
> {
	readonly isInterface: true
	readonly isImplicit: TIsImplicit
	readonly __interface: TInterface
}

/**
 * Creates an implicit interface entity prop config type.
 */
export type ImplicitInterfaceEntityConfig<TInterface extends object> =
	InterfaceEntityPropConfig<TInterface, true>

/**
 * Creates an explicit interface entity prop config type.
 */
export type ExplicitInterfaceEntityConfig<TInterface extends object> =
	InterfaceEntityPropConfig<TInterface, false>

// ============================================================================
// Builder State
// ============================================================================

/**
 * Union type for all entity prop config types.
 */
export type AnyEntityPropConfig = EntityPropConfig | InterfaceEntityPropConfig

/**
 * Accumulated builder state (type-level).
 * Grows as you chain builder methods.
 */
export interface ComponentBuilderState<
	TSchema extends Record<string, object>,
	// eslint-disable-next-line @typescript-eslint/ban-types
	TEntityProps extends Record<string, AnyEntityPropConfig> = {},
	TScalarProps extends object = object,
	TRoles extends readonly string[] = readonly string[],
> {
	readonly __schema: TSchema
	readonly __entityProps: TEntityProps
	readonly __scalarProps: TScalarProps
	readonly __roles: TRoles
}

// ============================================================================
// State Update Helpers
// ============================================================================

/**
 * Add an implicit entity to builder state.
 */
export type AddImplicitEntity<
	TState extends ComponentBuilderState<Record<string, object>>,
	TPropName extends string,
	TEntityName extends string,
> = ComponentBuilderState<
	TState['__schema'],
	TState['__entityProps'] & {
		readonly [K in TPropName]: ImplicitEntityConfig<
			TEntityName,
			TEntityName extends keyof TState['__schema'] ? TState['__schema'][TEntityName] : object
		>
	},
	TState['__scalarProps'],
	TState['__roles']
>

/**
 * Add an explicit entity to builder state.
 */
export type AddExplicitEntity<
	TState extends ComponentBuilderState<Record<string, object>>,
	TPropName extends string,
	TEntityName extends string,
	TSelected extends object,
> = ComponentBuilderState<
	TState['__schema'],
	TState['__entityProps'] & {
		readonly [K in TPropName]: ExplicitEntityConfig<TEntityName, TSelected>
	},
	TState['__scalarProps'],
	TState['__roles']
>

/**
 * Add an implicit interface entity to builder state.
 */
export type AddImplicitInterfaceEntity<
	TState extends ComponentBuilderState<Record<string, object>>,
	TPropName extends string,
	TInterface extends object,
> = ComponentBuilderState<
	TState['__schema'],
	TState['__entityProps'] & {
		readonly [K in TPropName]: ImplicitInterfaceEntityConfig<TInterface>
	},
	TState['__scalarProps'],
	TState['__roles']
>

/**
 * Add an explicit interface entity to builder state.
 */
export type AddExplicitInterfaceEntity<
	TState extends ComponentBuilderState<Record<string, object>>,
	TPropName extends string,
	TInterface extends object,
> = ComponentBuilderState<
	TState['__schema'],
	TState['__entityProps'] & {
		readonly [K in TPropName]: ExplicitInterfaceEntityConfig<TInterface>
	},
	TState['__scalarProps'],
	TState['__roles']
>

/**
 * Add multiple interface entities to builder state.
 * Each key in TInterfaces becomes a prop.
 */
export type AddInterfaces<
	TState extends ComponentBuilderState<Record<string, object>>,
	TInterfaces extends Record<string, object>,
> = ComponentBuilderState<
	TState['__schema'],
	TState['__entityProps'] & {
		readonly [K in keyof TInterfaces]: InterfaceEntityPropConfig<TInterfaces[K]>
	},
	TState['__scalarProps'],
	TState['__roles']
>

/**
 * Type for selectors parameter in interfaces() method.
 * Maps prop names to selector functions.
 */
export type InterfaceSelectorsMap<TInterfaces extends Record<string, object>> = {
	readonly [K in keyof TInterfaces]?: (
		e: SelectionBuilder<TInterfaces[K]>,
	) => SelectionBuilder<TInterfaces[K], TInterfaces[K], object>
}

/**
 * Set scalar props in builder state.
 */
export type SetScalarProps<
	TState extends ComponentBuilderState<Record<string, object>>,
	TNewScalarProps extends object,
> = ComponentBuilderState<
	TState['__schema'],
	TState['__entityProps'],
	TNewScalarProps,
	TState['__roles']
>

// ============================================================================
// Props Building
// ============================================================================

/**
 * Build EntityAccessor props from entity config.
 * Uses EntityAccessor to support direct field access (entity.fieldName.value).
 * Preserves entity name literal and schema for proper type narrowing in HasRole and relations.
 */
export type BuildEntityProps<
	TEntityProps extends Record<string, AnyEntityPropConfig>,
	TSchema extends Record<string, object>,
	TRoles extends readonly string[],
> = {
	readonly [K in keyof TEntityProps]: TEntityProps[K] extends EntityPropConfig<
		infer TEntityName,
		infer TSelected,
		infer _TIsImplicit
	>
		? EntityAccessor<
				TEntityName extends keyof TSchema ? TSchema[TEntityName] : object,
				TSelected,
				AnyBrand,
				TEntityName,  // Preserve entity name literal for HasRole type narrowing
				TRoles,
				TSchema  // Pass schema for relation entity name lookups
			>
		: TEntityProps[K] extends InterfaceEntityPropConfig<infer TInterface, infer _TIsImplicit>
			? EntityAccessor<TInterface, TInterface, AnyBrand, string, TRoles, TSchema>
			: never
}

/**
 * Build complete props type from builder state.
 */
export type BuildProps<TState extends ComponentBuilderState<Record<string, object>>> =
	TState['__scalarProps'] &
		BuildEntityProps<TState['__entityProps'], TState['__schema'], TState['__roles']>

/**
 * Build fragment properties ($propName) from entity config.
 */
export type BuildFragmentProps<
	TEntityProps extends Record<string, AnyEntityPropConfig>,
	TSchema extends Record<string, object>,
	TRoles extends readonly string[],
> = {
	readonly [K in keyof TEntityProps as `$${K & string}`]: TEntityProps[K] extends EntityPropConfig<
		infer TEntityName,
		infer TSelected,
		infer _TIsImplicit
	>
		? FluentFragment<
				TEntityName extends keyof TSchema ? TSchema[TEntityName] : object,
				TSelected,
				AnyBrand,
				TRoles
			>
		: TEntityProps[K] extends InterfaceEntityPropConfig<infer TInterface, infer _TIsImplicit>
			? FluentFragment<TInterface, TInterface, AnyBrand, TRoles>
			: never
}

// ============================================================================
// Result Component Types
// ============================================================================

/**
 * Metadata for entity prop selections.
 */
export interface SelectionPropMeta {
	readonly selection: SelectionMeta
	readonly fragment: FluentFragment<unknown, object>
}

/**
 * Base component type with markers.
 */
export type BindxComponentBase<TProps extends object> = ComponentType<TProps> &
	SelectionProvider & {
		readonly [COMPONENT_MARKER]: true
		readonly [COMPONENT_SELECTIONS]: Map<string, SelectionPropMeta>
		readonly __componentRoles?: readonly string[]
	}

/**
 * Complete bindx component type with fragment properties.
 */
export type BindxComponent<
	TState extends ComponentBuilderState<Record<string, object>>,
> = BindxComponentBase<BuildProps<TState>> &
	BuildFragmentProps<TState['__entityProps'], TState['__schema'], TState['__roles']>

// ============================================================================
// Builder Interface
// ============================================================================

/**
 * Fluent builder for creating bindx components.
 *
 * @typeParam TSchema - The entity schema
 * @typeParam TState - Accumulated builder state
 *
 * @example
 * ```typescript
 * createComponent({ roles: ['admin'] })
 *   .entity('article', 'Article')  // implicit
 *   .entity('author', 'Author', e => e.id().name())  // explicit
 *   .props<{ className?: string }>()
 *   .render(({ article, author, className }) => ...)
 * ```
 */
export interface ComponentBuilder<
	TSchema extends Record<string, object>,
	TState extends ComponentBuilderState<TSchema> = ComponentBuilderState<TSchema>,
> {
	/**
	 * Add an entity prop with implicit selection (collected from JSX).
	 *
	 * @param propName - Name of the prop
	 * @param entityName - Name of the entity in the schema
	 */
	entity<TPropName extends string, TEntityName extends keyof TSchema & string>(
		propName: TPropName,
		entityName: TEntityName,
	): ComponentBuilder<TSchema, AddImplicitEntity<TState, TPropName, TEntityName>>

	/**
	 * Add an entity prop with explicit selection (from selector function).
	 *
	 * @param propName - Name of the prop
	 * @param entityName - Name of the entity in the schema
	 * @param selector - Selection builder function
	 */
	entity<
		TPropName extends string,
		TEntityName extends keyof TSchema & string,
		TSelected extends object,
	>(
		propName: TPropName,
		entityName: TEntityName,
		selector: (e: SelectionBuilder<TSchema[TEntityName]>) => SelectionBuilder<TSchema[TEntityName], TSelected, object>,
	): ComponentBuilder<TSchema, AddExplicitEntity<TState, TPropName, TEntityName, TSelected>>

	/**
	 * Add interface-based entity props that accept any EntityRef with matching fields.
	 * Each key in TInterfaces becomes a prop name, and the value defines required fields.
	 *
	 * Props without selectors use implicit mode (selection collected from JSX).
	 * Props with selectors use explicit mode (selection from selector function).
	 *
	 * @example
	 * ```typescript
	 * interface HasName { name: string }
	 * interface HasArchivedAt { archivedAt: string | null }
	 *
	 * // Implicit mode - selection from JSX
	 * const NameCard = createComponent()
	 *   .interfaces<{ item: HasName }>()
	 *   .render(({ item }) => <span>{item.fields.name.value}</span>)
	 *
	 * // Explicit mode - selection from selector
	 * const ArchiveIndicator = createComponent()
	 *   .interfaces<{ item: HasArchivedAt }>({
	 *     item: e => e.archivedAt(),
	 *   })
	 *   .render(({ item }) => <span>{item.data?.archivedAt ? 'Archived' : 'Active'}</span>)
	 *
	 * // Mixed mode - some implicit, some explicit
	 * const Card = createComponent()
	 *   .interfaces<{ item: HasName; status: HasArchivedAt }>({
	 *     status: e => e.archivedAt(), // explicit
	 *     // item has no selector -> implicit from JSX
	 *   })
	 *   .render(({ item, status }) => ...)
	 * ```
	 */
	interfaces<TInterfaces extends Record<string, object>>(
		selectors?: InterfaceSelectorsMap<TInterfaces>,
	): ComponentBuilder<TSchema, AddInterfaces<TState, TInterfaces>>

	/**
	 * Define additional scalar (non-entity) props.
	 * This is a type-only operation - no runtime effect.
	 *
	 * @example
	 * ```typescript
	 * .props<{ className?: string; onClick?: () => void }>()
	 * ```
	 */
	props<TNewScalarProps extends object>(): ComponentBuilder<TSchema, SetScalarProps<TState, TNewScalarProps>>

	/**
	 * Build the component with the render function.
	 *
	 * @param renderFn - React render function receiving typed props
	 * @returns Bindx component with fragment properties
	 */
	render(renderFn: (props: BuildProps<TState>) => ReactNode): BindxComponent<TState>
}

// ============================================================================
// Factory Types
// ============================================================================

/**
 * Initial builder state with empty entity props and scalar props.
 * Note: Uses {} instead of Record<string, never> to avoid index signature issues
 * when combining with scalar props.
 */
export type InitialBuilderState<
	TSchema extends Record<string, object>,
	TRoles extends readonly string[] = readonly string[],
	// eslint-disable-next-line @typescript-eslint/ban-types
> = ComponentBuilderState<TSchema, {}, object, TRoles>

/**
 * Options for createComponent.
 */
export interface CreateComponentOptions<TRoles extends readonly string[] = readonly string[]> {
	readonly roles?: TRoles
}

/**
 * Type for the createComponent function returned by createBindx.
 */
export interface CreateComponentFn<
	TSchema extends Record<string, object>,
	TRoleNames extends string = never,
> {
	/**
	 * Create a component builder without role constraints.
	 */
	(): ComponentBuilder<TSchema, InitialBuilderState<TSchema>>

	/**
	 * Create a component builder with role constraints.
	 * Entity types are narrowed to fields accessible by the specified roles.
	 */
	<TRoles extends readonly TRoleNames[]>(
		options: CreateComponentOptions<TRoles>,
	): ComponentBuilder<TSchema, InitialBuilderState<TSchema, TRoles>>
}
