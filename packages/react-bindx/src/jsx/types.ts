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
	FieldRef,
	HasManyRef,
	HasOneRef,
	EntityRef,
	EntityAccessor,
	AnyBrand,
} from '@contember/bindx'

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
	FieldRef,
	HasManyRef,
	HasOneRef,
	EntityRef,
	EntityAccessor,
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
 * Props for Field component
 */
export interface FieldProps<T> {
	field: FieldRef<T>
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
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 * @typeParam TBrand - Component brand type for validation (defaults to AnyBrand)
 * @typeParam TEntityName - Entity name as string literal for type narrowing
 * @typeParam TAvailableRoles - Available roles for role-based type checking (defaults to readonly string[])
 * @typeParam TSchema - Schema for entity name lookup in nested relations
 */
export interface HasManyProps<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TAvailableRoles extends readonly string[] = readonly string[],
	TSchema extends Record<string, object> = Record<string, object>,
> {
	field: HasManyRef<TEntity, TSelected, TBrand, TEntityName, TAvailableRoles, TSchema>
	children: (item: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TAvailableRoles, TSchema>, index: number) => ReactNode
	filter?: unknown
	orderBy?: unknown
	limit?: number
	offset?: number
}

/**
 * Props for HasOne component.
 * Selection-aware: children callback receives EntityAccessor with direct field access.
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 * @typeParam TBrand - Component brand type for validation (defaults to AnyBrand)
 * @typeParam TEntityName - Entity name as string literal for type narrowing
 * @typeParam TAvailableRoles - Available roles for role-based type checking (defaults to readonly string[])
 * @typeParam TSchema - Schema for entity name lookup in nested relations
 */
export interface HasOneProps<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TAvailableRoles extends readonly string[] = readonly string[],
	TSchema extends Record<string, object> = Record<string, object>,
> {
	field: HasOneRef<TEntity, TSelected, TBrand, TEntityName, TAvailableRoles, TSchema>
	children: (entity: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TAvailableRoles, TSchema>) => ReactNode
}

/**
 * Props for Entity component.
 * Entity name is preserved for proper HasRole type narrowing.
 * Children receive EntityAccessor with direct field access.
 */
export interface EntityComponentProps<TSchema extends Record<string, object>, K extends keyof TSchema & string> {
	name: K
	id: string
	children: (entity: EntityAccessor<TSchema[K], TSchema[K], import('@contember/bindx').AnyBrand, K, readonly string[], TSchema>) => ReactNode
}

/**
 * Props for If conditional component
 */
export interface IfProps {
	condition: boolean | FieldRef<boolean>
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
