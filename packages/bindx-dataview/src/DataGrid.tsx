/**
 * DataGrid component — headless data grid for top-level entity lists.
 * Uses useEntityList for data loading.
 *
 * For has-many relation grids, use HasManyDataGrid instead.
 */

import { memo, type ReactElement, type ReactNode, useEffect, useMemo, useCallback, useRef, useState } from 'react'
import type {
	EntityDef,
	EntityAccessor,
	OrderDirection,
	DataViewLayout,
	SelectionValues,
	CommonEntity,
} from '@contember/bindx'
import type { StateStorageOrName } from './stateStorage.js'
import {
	useBindxContext,
	useEntityList,
} from '@contember/bindx-react'
import { useDataViewKey } from './DataViewKeyProvider.js'
import { DataViewProvider, type DataViewContextValue, type DataViewLoaderState } from './DataViewContext.js'
import { useDataGridSetup, QUERY_FILTER_NAME } from './useDataGridSetup.js'

export { QUERY_FILTER_NAME }

// ============================================================================
// DataGrid Props
// ============================================================================

export interface DataGridProps<TRoleMap extends Record<string, object> = Record<string, object>> {
	/** Entity definition */
	entity: EntityDef<TRoleMap>
	/** Children render function: receives entity proxy `it`, returns column markers + layout */
	children: (it: EntityAccessor<CommonEntity<TRoleMap>>) => ReactNode
	/** Initial sorting (supports multi-column: { title: 'asc', date: 'desc' }) */
	initialSorting?: Partial<Record<string, OrderDirection>>
	/** Items per page. null = show all. Default: 50 */
	itemsPerPage?: number | null
	/** Static filter (combined with dynamic filters) */
	filter?: Record<string, unknown>
	/** Available layouts */
	layouts?: readonly DataViewLayout[]
	/** Initial selection (layout + visibility) */
	initialSelection?: SelectionValues
	/** State storage for filter/sorting/selection state */
	stateStorage?: StateStorageOrName
	/** State storage for current page */
	currentPageStateStorage?: StateStorageOrName
	/** State storage for page size preference */
	pagingSettingsStorage?: StateStorageOrName
	/** Storage key prefix for isolation */
	storageKey?: string
}

// ============================================================================
// Implementation
// ============================================================================

function DataGridImpl<TRoleMap extends Record<string, object>>({
	entity,
	children,
	initialSorting,
	itemsPerPage = 50,
	filter: staticFilter,
	layouts,
	initialSelection,
	stateStorage,
	currentPageStateStorage,
	pagingSettingsStorage,
	storageKey,
}: DataGridProps<TRoleMap>): ReactElement | null {
	const { schema: schemaRegistry } = useBindxContext()
	const entityType = entity.$name
	const contextKey = useDataViewKey()
	const effectiveStorageKey = storageKey ?? contextKey

	const setup = useDataGridSetup<CommonEntity<TRoleMap>>({
		entityType,
		schemaRegistry,
		children,
		initialSorting,
		itemsPerPage,
		staticFilter,
		layouts,
		initialSelection,
		stateStorage,
		currentPageStateStorage,
		pagingSettingsStorage,
		storageKey: effectiveStorageKey,
	})

	// ---- Loader state tracking ----
	const hasLoadedOnce = useRef(false)
	const [loaderState, setLoaderState] = useState<DataViewLoaderState>('initial')

	// ---- Load data via useEntityList ----
	const result = useEntityList(entity, {
		filter: setup.combinedFilter,
		orderBy: setup.sorting.resolvedOrderBy,
		limit: setup.paging.queryLimit,
		offset: setup.paging.queryOffset,
		selection: setup.selection,
		queryKey: setup.queryKey,
	})

	const items = result.status === 'ready' ? result.items : []
	const itemCount = items.length

	// Update loader state
	useEffect(() => {
		if (result.status === 'ready') {
			hasLoadedOnce.current = true
			setLoaderState('loaded')
		} else if (result.status === 'error') {
			setLoaderState('failed')
		} else if (result.status === 'loading') {
			setLoaderState(hasLoadedOnce.current ? 'refreshing' : 'initial')
		}
	}, [result.status])

	// Update total count when data is ready
	useEffect(() => {
		if (result.status === 'ready' && setup.paging.queryLimit !== undefined && setup.paging.queryOffset !== undefined && itemCount < setup.paging.queryLimit) {
			setup.paging.setTotalCount(setup.paging.queryOffset + itemCount)
		}
	}, [result.status, itemCount, setup.paging.queryLimit, setup.paging.queryOffset, setup.paging.setTotalCount])

	// ---- Reload ----
	const [, setReloadCounter] = useState(0)
	const reload = useCallback((): void => {
		setReloadCounter(c => c + 1)
	}, [])

	// ---- Row highlighting ----
	const [highlightIndex, setHighlightIndex] = useState<number | null>(null)

	useEffect(() => {
		setHighlightIndex(null)
	}, [items])

	const contextValue = useMemo((): DataViewContextValue => ({
		filtering: setup.filtering,
		sorting: setup.sorting,
		paging: setup.paging,
		selection: setup.selectionState,
		columns: setup.columns,
		entityType,
		items,
		itemCount,
		loaderState,
		reload,
		highlightIndex,
		setHighlightIndex,
		selectionMeta: setup.selection,
		toolbarContent: setup.toolbarContent,
		layoutRenders: setup.layoutRenders,
		layoutElements: setup.layoutElements,
	}), [setup.filtering, setup.sorting, setup.paging, setup.selectionState, setup.columns, entityType, items, itemCount, loaderState, reload, highlightIndex, setup.selection, setup.toolbarContent, setup.layoutRenders, setup.layoutElements])

	return (
		<DataViewProvider value={contextValue}>
			{setup.childrenJsx}
		</DataViewProvider>
	)
}

// ============================================================================
// Export
// ============================================================================

export const DataGrid = memo(DataGridImpl) as unknown as typeof DataGridImpl
