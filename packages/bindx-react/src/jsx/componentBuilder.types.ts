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
	EntityAccessorBase,
	FluentFragment,
	SelectionBuilder,
	AnyBrand,
	SelectionMeta,
	EntityDef,
	ResolveEntity,
} from '@contember/bindx'
import type { SelectionProvider } from './types.js'
import type { Condition } from './conditions.js'

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
 * Stores the entity type directly (not entity name).
 */
export interface EntityPropConfig<
	TEntity extends object = object,
	TSelected extends object = object,
	TIsImplicit extends boolean = boolean,
> {
	readonly __entity: TEntity
	readonly isImplicit: TIsImplicit
	readonly __selected: TSelected
}

/**
 * Creates an implicit entity prop config type.
 */
export type ImplicitEntityConfig<TEntity extends object> =
	EntityPropConfig<TEntity, TEntity, true>

/**
 * Creates an explicit entity prop config type.
 */
export type ExplicitEntityConfig<TEntity extends object, TSelected extends object> =
	EntityPropConfig<TEntity, TSelected, false>

// ============================================================================
// Interface Entity Prop Configuration
// ============================================================================

/**
 * Configuration for an interface-based entity prop.
 * Unlike EntityPropConfig, this doesn't require a specific entity type.
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
	// eslint-disable-next-line @typescript-eslint/ban-types
	TEntityProps extends Record<string, AnyEntityPropConfig> = {},
	TScalarProps extends object = object,
	TRoles extends readonly string[] = readonly string[],
> {
	readonly __entityProps: TEntityProps
	readonly __scalarProps: TScalarProps
	readonly __roles: TRoles
}

// ============================================================================
// State Update Helpers
// ============================================================================

/**
 * Add an implicit entity to builder state.
 * Entity type comes directly from the EntityDef.
 */
export type AddImplicitEntity<
	TState extends ComponentBuilderState,
	TPropName extends string,
	TEntity extends object,
> = ComponentBuilderState<
	TState['__entityProps'] & {
		readonly [K in TPropName]: ImplicitEntityConfig<TEntity>
	},
	TState['__scalarProps'],
	TState['__roles']
>

/**
 * Add an explicit entity to builder state.
 * Entity type comes directly from the EntityDef.
 */
export type AddExplicitEntity<
	TState extends ComponentBuilderState,
	TPropName extends string,
	TEntity extends object,
	TSelected extends object,
> = ComponentBuilderState<
	TState['__entityProps'] & {
		readonly [K in TPropName]: ExplicitEntityConfig<TEntity, TSelected>
	},
	TState['__scalarProps'],
	TState['__roles']
>

/**
 * Add an implicit interface entity to builder state.
 */
export type AddImplicitInterfaceEntity<
	TState extends ComponentBuilderState,
	TPropName extends string,
	TInterface extends object,
> = ComponentBuilderState<
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
	TState extends ComponentBuilderState,
	TPropName extends string,
	TInterface extends object,
> = ComponentBuilderState<
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
	TState extends ComponentBuilderState,
	TInterfaces extends Record<string, object>,
> = ComponentBuilderState<
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
	TState extends ComponentBuilderState,
	TNewScalarProps extends object,
> = ComponentBuilderState<
	TState['__entityProps'],
	TNewScalarProps,
	TState['__roles']
>

// ============================================================================
// Props Building
// ============================================================================

/**
 * Build EntityAccessor props from entity config.
 *
 * For explicit selection (selector provided): Returns EntityAccessor with full access
 * - Allows direct field access: `entity.fieldName.value`
 * - Allows relation access: `entity.relation.length`, `entity.relation.$entity`
 *
 * For implicit selection (no selector): Returns EntityAccessorBase with restricted access
 * - Blocks direct field access to enforce declarative patterns
 * - Users must use components: `<Field field={entity.fieldName} />`
 * - Users must use condition DSL: `<If condition={cond.hasItems(entity.relation)} />`
 */
export type BuildEntityProps<
	TEntityProps extends Record<string, AnyEntityPropConfig>,
	TRoles extends readonly string[],
> = {
	readonly [K in keyof TEntityProps]: TEntityProps[K] extends EntityPropConfig<
		infer TEntity,
		infer TSelected,
		infer TIsImplicit
	>
		? TIsImplicit extends true
			// Implicit selection -> restricted EntityAccessorBase (no .value, .length access)
			? EntityAccessorBase<TEntity, TSelected, AnyBrand, string>
			// Explicit selection -> full EntityAccessor (full access)
			: EntityAccessor<TEntity, TSelected, AnyBrand, string>
		: TEntityProps[K] extends InterfaceEntityPropConfig<infer TInterface, infer TIsImplicit>
			? TIsImplicit extends true
				// Implicit interface -> restricted
				? EntityAccessorBase<TInterface, TInterface, AnyBrand, string>
				// Explicit interface -> full access
				: EntityAccessor<TInterface, TInterface, AnyBrand, string>
			: never
}

/**
 * Build complete props type from builder state.
 */
export type BuildProps<TState extends ComponentBuilderState> =
	TState['__scalarProps'] &
		BuildEntityProps<TState['__entityProps'], TState['__roles']>

/**
 * Build fragment properties ($propName) from entity config.
 */
export type BuildFragmentProps<
	TEntityProps extends Record<string, AnyEntityPropConfig>,
	TRoles extends readonly string[],
> = {
	readonly [K in keyof TEntityProps as `$${K & string}`]: TEntityProps[K] extends EntityPropConfig<
		infer TEntity,
		infer TSelected,
		infer _TIsImplicit
	>
		? FluentFragment<TEntity, TSelected, AnyBrand>
		: TEntityProps[K] extends InterfaceEntityPropConfig<infer TInterface, infer _TIsImplicit>
			? FluentFragment<TInterface, TInterface, AnyBrand>
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
	TState extends ComponentBuilderState,
> = BindxComponentBase<BuildProps<TState>> &
	BuildFragmentProps<TState['__entityProps'], TState['__roles']>

// ============================================================================
// Builder Interface
// ============================================================================

/**
 * Fluent builder for creating bindx components.
 *
 * @typeParam TState - Accumulated builder state
 *
 * @example
 * ```typescript
 * createComponent()
 *   .entity('article', schema.Article)  // implicit
 *   .entity('author', schema.Author, e => e.id().name())  // explicit
 *   .props<{ className?: string }>()
 *   .render(({ article, author, className }) => ...)
 * ```
 */
export interface ComponentBuilder<
	TState extends ComponentBuilderState = ComponentBuilderState,
> {
	/**
	 * Add an entity prop with implicit selection (collected from JSX).
	 * Entity type is resolved based on the builder's roles via ResolveEntity.
	 *
	 * @param propName - Name of the prop
	 * @param entity - EntityDef reference
	 */
	entity<TPropName extends string, TRoleMap extends Record<string, object>>(
		propName: TPropName,
		entity: EntityDef<TRoleMap>,
	): ComponentBuilder<AddImplicitEntity<TState, TPropName, ResolveEntity<TRoleMap, TState['__roles'][number]>>>

	/**
	 * Add an entity prop with explicit selection (from selector function).
	 * Entity type is resolved based on the builder's roles via ResolveEntity.
	 *
	 * @param propName - Name of the prop
	 * @param entity - EntityDef reference
	 * @param selector - Selection builder function
	 */
	entity<
		TPropName extends string,
		TRoleMap extends Record<string, object>,
		TSelected extends object,
	>(
		propName: TPropName,
		entity: EntityDef<TRoleMap>,
		selector: (e: SelectionBuilder<ResolveEntity<TRoleMap, TState['__roles'][number]>>) => SelectionBuilder<ResolveEntity<TRoleMap, TState['__roles'][number]>, TSelected, object>,
	): ComponentBuilder<AddExplicitEntity<TState, TPropName, ResolveEntity<TRoleMap, TState['__roles'][number]>, TSelected>>

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
	): ComponentBuilder<AddInterfaces<TState, TInterfaces>>

	/**
	 * Define additional scalar (non-entity) props.
	 * This is a type-only operation - no runtime effect.
	 *
	 * @example
	 * ```typescript
	 * .props<{ className?: string; onClick?: () => void }>()
	 * ```
	 */
	props<TNewScalarProps extends object>(): ComponentBuilder<SetScalarProps<TState, TNewScalarProps>>

	/**
	 * Add a condition that must be true for the component to render.
	 * If the condition is false, the component renders null.
	 *
	 * Fields used in the condition are automatically collected for the GraphQL query.
	 *
	 * @param conditionFn - Function that receives entity props and returns a Condition
	 *
	 * @example
	 * ```typescript
	 * createComponent()
	 *   .entity('task', schema.Task)
	 *   .if(({ task }) => cond.isTruthy(task.project.company.canSeeTimeEstimates))
	 *   .render(({ task }) => (
	 *     // Only renders if canSeeTimeEstimates is truthy
	 *     <div>...</div>
	 *   ))
	 * ```
	 */
	if(conditionFn: (props: BuildEntityProps<TState['__entityProps'], TState['__roles']>) => Condition): ComponentBuilder<TState>

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
	TRoles extends readonly string[] = readonly string[],
	// eslint-disable-next-line @typescript-eslint/ban-types
> = ComponentBuilderState<{}, object, TRoles>

/**
 * Options for createComponent.
 */
export interface CreateComponentOptions<TRoles extends readonly string[] = readonly string[]> {
	readonly roles?: TRoles
}
