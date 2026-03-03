import type { ReactNode } from 'react'
import type {
	SelectionMeta,
	SelectionFieldMeta,
	EntityFields,
	FieldRefMeta,
	ScalarKeys,
	HasManyKeys,
	HasOneKeys,
	SelectedEntityFields,
	SelectedEntityFieldsBase,
	// Full types
	FieldRef,
	HasManyRef,
	HasOneRef,
	HasOneAccessor,
	EntityRef,
	EntityAccessor,
	// Base types (for component props - accept both)
	FieldRefBase,
	HasManyRefBase,
	HasOneRefBase,
	HasOneAccessorBase,
	EntityRefBase,
	EntityAccessorBase,
	AnyBrand,
} from '@contember/bindx'
import { Condition } from './conditions.js'

// Re-export unified types for backwards compatibility
export type { SelectionMeta, SelectionFieldMeta }

// Re-export from @contember/bindx
export { FIELD_REF_META } from '@contember/bindx'
export type {
	EntityFields,
	FieldRefMeta,
	ScalarKeys,
	HasManyKeys,
	HasOneKeys,
	SelectedEntityFields,
	SelectedEntityFieldsBase,
	// Full types
	FieldRef,
	HasManyRef,
	HasOneRef,
	HasOneAccessor,
	EntityRef,
	EntityAccessor,
	// Base types
	FieldRefBase,
	HasManyRefBase,
	HasOneRefBase,
	HasOneAccessorBase,
	EntityRefBase,
	EntityAccessorBase,
	AnyBrand,
}

/**
 * Marker symbol for identifying bindx components
 */
export const BINDX_COMPONENT = Symbol('BINDX_COMPONENT')

/**
 * Symbol for direct scope access on collector proxies.
 * Replaces NESTED_SELECTION_REF - carries the SelectionScope directly.
 * Used when passing relation entities to nested createComponent components.
 */
export const SCOPE_REF = Symbol('SCOPE_REF')


/**
 * Props for Field component.
 * Accepts FieldRefBase, so both FieldRef (explicit) and FieldRefBase (implicit) work.
 */
export interface FieldProps<T> {
	field: FieldRefBase<T>
	children?: (accessor: FieldRef<T>) => ReactNode
	format?: (value: T | null) => ReactNode
}

/**
 * Options for HasMany relation
 */
export interface HasManyComponentOptions {
	filter?: unknown
	orderBy?: unknown
	limit?: number
	offset?: number
}

/**
 * Props for HasMany component.
 * Selection-aware: children callback receives EntityAccessor with direct field access.
 * Accepts HasManyRefBase, so both HasManyRef (explicit) and HasManyRefBase (implicit) work.
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 * @typeParam TBrand - Component brand type for validation (defaults to AnyBrand)
 * @typeParam TEntityName - Entity name as string literal for type narrowing
 * @typeParam TSchema - Schema for entity name lookup in nested relations
 */
export interface HasManyProps<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	field: HasManyRefBase<TEntity, TSelected, TBrand, TEntityName, TSchema>
	children: (item: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>, index: number) => ReactNode
	filter?: unknown
	orderBy?: unknown
	limit?: number
	offset?: number
}

/**
 * Props for HasOne component.
 * Selection-aware: children callback receives EntityAccessor with direct field access.
 * Accepts HasOneRefBase, so both HasOneRef (explicit) and HasOneRefBase (implicit) work.
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 * @typeParam TBrand - Component brand type for validation (defaults to AnyBrand)
 * @typeParam TEntityName - Entity name as string literal for type narrowing
 * @typeParam TSchema - Schema for entity name lookup in nested relations
 */
export interface HasOneProps<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	field: HasOneRefBase<TEntity, TSelected, TBrand, TEntityName, TSchema>
	children: (entity: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>) => ReactNode
}

/**
 * Props for Entity component.
 * Entity name is preserved for proper HasRole type narrowing.
 * Children receive EntityAccessor with direct field access.
 */
export interface EntityComponentProps<TSchema extends Record<string, object>, K extends keyof TSchema & string> {
	name: K
	id: string
	children: (entity: EntityAccessor<TSchema[K], TSchema[K], import('@contember/bindx').AnyBrand, K, TSchema>) => ReactNode
}

/**
 * Props for If conditional component.
 *
 * Supports three types of conditions:
 * 1. Boolean literals: `condition={true}` or `condition={someBoolean}`
 * 2. FieldRef<boolean>: `condition={task.isActive}` - field value is used
 * 3. Condition objects: `condition={cond.hasItems(task.developers)}` - composable DSL
 *
 * Using the Condition DSL is recommended for implicit selection mode as it ensures
 * all referenced fields are collected for the GraphQL query.
 */
export interface IfProps {
	/**
	 * Condition to evaluate. Can be:
	 * - A boolean literal
	 * - A FieldRef<boolean>
	 * - A Condition object from the condition builders (hasItems, isEmpty, eq, and, or, not, etc.)
	 */
	condition: boolean | FieldRef<boolean> | Condition
	then: ReactNode
	else?: ReactNode
}

/**
 * Interface for components that can provide selection info
 */
export interface SelectionProvider {
	getSelection(
		props: unknown,
		collectNested: (children: ReactNode) => SelectionMeta,
	): SelectionFieldMeta | SelectionFieldMeta[] | null
}

// Re-export component types
export type {
	EntityPropKeys,
	EntityFromProp,
	SelectionFromProp,
	ImplicitFragmentProperties,
} from './legacyTypes.js'
export { COMPONENT_MARKER, COMPONENT_SELECTIONS } from './componentBuilder.js'
