/**
 * DataView context — provides filtering, sorting, paging, selection state,
 * and utility methods to descendant components.
 */

import React, { createContext, useContext } from 'react'
import type { FilteringState, SortingStateResult, PagingStateResult, SelectionStateResult } from './useDataViewState.js'
import type { ColumnLeafProps } from './columnLeaf.js'
import type { EntityAccessor, SelectionMeta } from '@contember/bindx'

export type DataViewLoaderState = 'initial' | 'loaded' | 'refreshing' | 'failed'

export type DataViewItem = EntityAccessor<object>

export interface DataViewContextValue {
	readonly filtering: FilteringState
	readonly sorting: SortingStateResult
	readonly paging: PagingStateResult
	readonly selection: SelectionStateResult
	readonly columns: readonly ColumnLeafProps[]
	readonly entityType: string
	readonly items: readonly DataViewItem[]
	readonly itemCount: number
	readonly loaderState: DataViewLoaderState
	readonly reload: () => void
	readonly highlightIndex: number | null
	readonly setHighlightIndex: (index: number | null) => void
	readonly selectionMeta: SelectionMeta
	readonly toolbarContent?: React.ReactNode
}

const DataViewContext = createContext<DataViewContextValue | null>(null)

export function useDataViewContext(): DataViewContextValue {
	const ctx = useContext(DataViewContext)
	if (!ctx) {
		throw new Error('useDataViewContext must be used within a DataViewProvider')
	}
	return ctx
}

export function useOptionalDataViewContext(): DataViewContextValue | null {
	return useContext(DataViewContext)
}

export const DataViewProvider = DataViewContext.Provider
