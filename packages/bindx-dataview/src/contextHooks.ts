/**
 * Fine-grained context hooks matching Contember's react-dataview API.
 *
 * These hooks provide convenient access to specific parts of the DataView context,
 * matching Contember's pattern of separate state/methods hooks per concern.
 */

import { useMemo } from 'react'
import { useDataViewContext } from './DataViewContext.js'
import type { FilteringState, SortingStateResult, PagingStateResult, SelectionStateResult } from './useDataViewState.js'
import type {
	SortingState,
	SortingDirectionAction,
	PagingState,
	PagingInfo,
	OrderDirection,
	FilterHandler,
	FilterArtifact,
	DataViewLayout,
	FieldRefBase,
} from '@contember/bindx'

// ============================================================================
// Sorting
// ============================================================================

export interface DataViewSortingMethods {
	setOrderBy<T>(field: FieldRefBase<T>, action: SortingDirectionAction, append?: boolean): void
}

export function useDataViewSortingState(): SortingState {
	return useDataViewContext().sorting.state
}

export function useDataViewSortingMethods(): DataViewSortingMethods {
	const { sorting } = useDataViewContext()
	return useMemo(() => ({ setOrderBy: sorting.setOrderBy }), [sorting.setOrderBy])
}

export function useDataViewSortingDirection<T>(field: FieldRefBase<T>): OrderDirection | null {
	return useDataViewContext().sorting.directionOf(field)
}

// ============================================================================
// Paging
// ============================================================================

export interface DataViewPagingMethods {
	goToPage(page: number | 'first' | 'next' | 'previous' | 'last'): void
	setItemsPerPage(count: number | null): void
	refreshTotalCount(): void
}

export function useDataViewPagingState(): PagingState {
	return useDataViewContext().paging.state
}

export function useDataViewPagingInfo(): PagingInfo {
	return useDataViewContext().paging.info
}

export function useDataViewPagingMethods(): DataViewPagingMethods {
	const { paging } = useDataViewContext()
	return useMemo((): DataViewPagingMethods => ({
		goToPage: (page: number | 'first' | 'next' | 'previous' | 'last'): void => {
			if (page === 'first') paging.first()
			else if (page === 'last') paging.last()
			else if (page === 'next') paging.next()
			else if (page === 'previous') paging.previous()
			else paging.goTo(page)
		},
		setItemsPerPage: paging.setItemsPerPage,
		refreshTotalCount: paging.refreshTotalCount,
	}), [paging])
}

// ============================================================================
// Filtering
// ============================================================================

export interface DataViewFilteringMethods {
	setFilter(name: string, artifact: FilterArtifact): void
}

export function useDataViewFilteringState(): FilteringState {
	return useDataViewContext().filtering
}

export function useDataViewFilteringMethods(): DataViewFilteringMethods {
	const { filtering } = useDataViewContext()
	return useMemo(() => ({ setFilter: filtering.setArtifact }), [filtering.setArtifact])
}

export function useDataViewFilterHandlerRegistry(): ReadonlyMap<string, { handler: FilterHandler<FilterArtifact> }> {
	return useDataViewContext().filtering.filters
}

// ============================================================================
// Selection
// ============================================================================

export interface DataViewSelectionState {
	readonly layout: string | undefined
	readonly visibility: Record<string, boolean | undefined>
	readonly layouts: readonly DataViewLayout[]
}

export interface DataViewSelectionMethods {
	setLayout(layout: string | undefined): void
	setVisibility(name: string, visible: boolean): void
}

export function useDataViewSelectionState(): DataViewSelectionState {
	const { selection } = useDataViewContext()
	return useMemo((): DataViewSelectionState => ({
		layout: selection.currentLayout,
		visibility: selection.state.values.visibility ?? {},
		layouts: selection.state.layouts,
	}), [selection.currentLayout, selection.state.values.visibility, selection.state.layouts])
}

export function useDataViewSelectionMethods(): DataViewSelectionMethods {
	const { selection } = useDataViewContext()
	return useMemo(() => ({
		setLayout: selection.setLayout,
		setVisibility: selection.setVisibility,
	}), [selection.setLayout, selection.setVisibility])
}

// ============================================================================
// Elements (visibility-togglable items)
// ============================================================================

export interface DataViewElementData {
	readonly name: string
	readonly label?: React.ReactNode
	readonly fallback?: boolean
}

export function useDataViewElements(): readonly DataViewElementData[] {
	const { columns } = useDataViewContext()
	return useMemo(
		() => columns
			.filter(c => c.fieldName !== null)
			.map(c => ({
				name: c.name,
				label: c.header,
				fallback: true,
			})),
		[columns],
	)
}
