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
}

/**
 * @deprecated Use SelectionMeta from selection/types.ts instead
 */
export type JsxSelectionMeta = SelectionMeta

/**
 * @deprecated Use SelectionFieldMeta from selection/types.ts instead
 */
export type JsxSelectionFieldMeta = SelectionFieldMeta

/**
 * Marker symbol for identifying bindx components
 */
export const BINDX_COMPONENT = Symbol('BINDX_COMPONENT')

/**
 * Symbol for carrying nested selection reference on collector proxies
 * Used when passing relation entities to nested createComponent components
 */
export const NESTED_SELECTION_REF = Symbol('NESTED_SELECTION_REF')


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
 * Selection-aware: children callback receives EntityRef with only selected fields.
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 */
export interface HasManyProps<TEntity, TSelected = TEntity> {
	field: HasManyRef<TEntity, TSelected>
	children: (item: EntityRef<TEntity, TSelected>, index: number) => ReactNode
	filter?: unknown
	orderBy?: unknown
	limit?: number
	offset?: number
}

/**
 * Props for HasOne component.
 * Selection-aware: children callback receives EntityRef with only selected fields.
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 */
export interface HasOneProps<TEntity, TSelected = TEntity> {
	field: HasOneRef<TEntity, TSelected>
	children: (entity: EntityRef<TEntity, TSelected>) => ReactNode
}

/**
 * Props for Entity component.
 * Entity name is preserved for proper HasRole type narrowing.
 */
export interface EntityComponentProps<TSchema, K extends keyof TSchema & string> {
	name: K
	id: string
	children: (entity: EntityRef<TSchema[K], TSchema[K], import('@contember/bindx').AnyBrand, K>) => ReactNode
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
