/**
 * Typed filter wrapper components — provide filter name scope for specific filter types.
 *
 * Each wrapper sets the filter name context so child trigger components
 * can infer their filter name automatically.
 *
 * Usage:
 * ```tsx
 * <DataViewTextFilter field={it.title}>
 *   <DataViewTextFilterInput />
 *   <DataViewTextFilterMatchModeTrigger mode="contains">
 *     <button>Contains</button>
 *   </DataViewTextFilterMatchModeTrigger>
 * </DataViewTextFilter>
 *
 * <DataViewBooleanFilter field={it.published}>
 *   <DataViewBooleanFilterTrigger value={true} action="toggle">
 *     <button>Published</button>
 *   </DataViewBooleanFilterTrigger>
 * </DataViewBooleanFilter>
 * ```
 */

import React, { type ReactElement } from 'react'
import type { FieldRefBase } from '@contember/bindx'
import { FIELD_REF_META } from '@contember/bindx'
import { DataViewFilterNameProvider } from './filterContext.js'

// ============================================================================
// Common props
// ============================================================================

interface FilterWrapperProps<T> {
	field: FieldRefBase<T>
	name?: string
	children: React.ReactNode
}

function resolveFilterName<T>(name: string | undefined, field: FieldRefBase<T>): string {
	return name ?? field[FIELD_REF_META].fieldName
}

// ============================================================================
// DataViewTextFilter
// ============================================================================

export interface DataViewTextFilterProps<T> extends FilterWrapperProps<T> {}

export function DataViewTextFilter<T>({ field, name, children }: DataViewTextFilterProps<T>): ReactElement {
	return (
		<DataViewFilterNameProvider value={resolveFilterName(name, field)}>
			{children}
		</DataViewFilterNameProvider>
	)
}

// ============================================================================
// DataViewBooleanFilter
// ============================================================================

export interface DataViewBooleanFilterProps<T> extends FilterWrapperProps<T> {}

export function DataViewBooleanFilter<T>({ field, name, children }: DataViewBooleanFilterProps<T>): ReactElement {
	return (
		<DataViewFilterNameProvider value={resolveFilterName(name, field)}>
			{children}
		</DataViewFilterNameProvider>
	)
}

// ============================================================================
// DataViewNumberFilter
// ============================================================================

export interface DataViewNumberFilterProps<T> extends FilterWrapperProps<T> {}

export function DataViewNumberFilter<T>({ field, name, children }: DataViewNumberFilterProps<T>): ReactElement {
	return (
		<DataViewFilterNameProvider value={resolveFilterName(name, field)}>
			{children}
		</DataViewFilterNameProvider>
	)
}

// ============================================================================
// DataViewDateFilter
// ============================================================================

export interface DataViewDateFilterProps<T> extends FilterWrapperProps<T> {}

export function DataViewDateFilter<T>({ field, name, children }: DataViewDateFilterProps<T>): ReactElement {
	return (
		<DataViewFilterNameProvider value={resolveFilterName(name, field)}>
			{children}
		</DataViewFilterNameProvider>
	)
}

// ============================================================================
// DataViewEnumFilter
// ============================================================================

export interface DataViewEnumFilterProps<T> extends FilterWrapperProps<T> {}

export function DataViewEnumFilter<T>({ field, name, children }: DataViewEnumFilterProps<T>): ReactElement {
	return (
		<DataViewFilterNameProvider value={resolveFilterName(name, field)}>
			{children}
		</DataViewFilterNameProvider>
	)
}

// ============================================================================
// DataViewEnumListFilter
// ============================================================================

export interface DataViewEnumListFilterProps<T> extends FilterWrapperProps<T> {}

export function DataViewEnumListFilter<T>({ field, name, children }: DataViewEnumListFilterProps<T>): ReactElement {
	return (
		<DataViewFilterNameProvider value={resolveFilterName(name, field)}>
			{children}
		</DataViewFilterNameProvider>
	)
}

// ============================================================================
// DataViewHasOneFilter
// ============================================================================

export interface DataViewHasOneFilterProps<T> extends FilterWrapperProps<T> {}

export function DataViewHasOneFilter<T>({ field, name, children }: DataViewHasOneFilterProps<T>): ReactElement {
	return (
		<DataViewFilterNameProvider value={resolveFilterName(name, field)}>
			{children}
		</DataViewFilterNameProvider>
	)
}

// ============================================================================
// DataViewHasManyFilter
// ============================================================================

export interface DataViewHasManyFilterProps<T> extends FilterWrapperProps<T> {}

export function DataViewHasManyFilter<T>({ field, name, children }: DataViewHasManyFilterProps<T>): ReactElement {
	return (
		<DataViewFilterNameProvider value={resolveFilterName(name, field)}>
			{children}
		</DataViewFilterNameProvider>
	)
}

// ============================================================================
// DataViewIsDefinedFilter
// ============================================================================

export interface DataViewIsDefinedFilterProps<T> extends FilterWrapperProps<T> {}

export function DataViewIsDefinedFilter<T>({ field, name, children }: DataViewIsDefinedFilterProps<T>): ReactElement {
	return (
		<DataViewFilterNameProvider value={resolveFilterName(name, field)}>
			{children}
		</DataViewFilterNameProvider>
	)
}

// ============================================================================
// DataViewUnionTextFilter
// ============================================================================

export interface DataViewUnionTextFilterProps<T> {
	/** Single field or array of fields to search across */
	fields: FieldRefBase<T> | FieldRefBase<T>[]
	/** Required unique filter name */
	name: string
	children: React.ReactNode
}

export function DataViewUnionTextFilter<T>({ name, children }: DataViewUnionTextFilterProps<T>): ReactElement {
	return (
		<DataViewFilterNameProvider value={name}>
			{children}
		</DataViewFilterNameProvider>
	)
}
