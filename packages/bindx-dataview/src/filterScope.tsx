/**
 * Filter scope components — declarative filter registration and name scoping.
 *
 * Usage:
 * ```tsx
 * <DataViewFilterScope name="title">
 *   <DataViewTextFilterInput />
 * </DataViewFilterScope>
 *
 * <DataViewFilter name="title" filterHandler={createTextFilterHandler('title')}>
 *   <DataViewTextFilterInput />
 * </DataViewFilter>
 *
 * <DataViewTextFilter field="title">
 *   <DataViewTextFilterInput />
 * </DataViewTextFilter>
 *
 * <DataViewHasFilterType name="title">
 *   <span>Title filter is available</span>
 * </DataViewHasFilterType>
 * ```
 */

import React, { type ReactElement } from 'react'
import { DataViewFilterNameProvider } from './filterContext.js'
import { useDataViewContext } from './DataViewContext.js'
import type { FilterHandler, FilterArtifact } from '@contember/bindx'

// ============================================================================
// DataViewFilterScope
// ============================================================================

export interface DataViewFilterScopeProps {
	name: string
	children: React.ReactNode
}

/**
 * Sets the filter name context for all children.
 * Child filter triggers will infer their filter name from this scope.
 */
export function DataViewFilterScope({ name, children }: DataViewFilterScopeProps): ReactElement {
	return (
		<DataViewFilterNameProvider value={name}>
			{children}
		</DataViewFilterNameProvider>
	)
}

// ============================================================================
// DataViewFilter
// ============================================================================

export interface DataViewFilterProps {
	name: string
	filterHandler: FilterHandler<FilterArtifact>
	children?: React.ReactNode
}

/**
 * Registers a filter handler and sets the filter name context.
 *
 * Note: When used inside a DataGrid, filters are already registered
 * from column definitions. This component then just provides the name scope.
 */
export function DataViewFilter({ name, children }: DataViewFilterProps): ReactElement {
	return (
		<DataViewFilterNameProvider value={name}>
			{children}
		</DataViewFilterNameProvider>
	)
}

// ============================================================================
// DataViewHasFilterType
// ============================================================================

export interface DataViewHasFilterTypeProps {
	name: string
	children: React.ReactNode
}

/**
 * Renders children only if a filter with the given name is registered.
 */
export function DataViewHasFilterType({ name, children }: DataViewHasFilterTypeProps): ReactElement | null {
	const { filtering } = useDataViewContext()
	return filtering.filters.has(name) ? <>{children}</> : null
}
