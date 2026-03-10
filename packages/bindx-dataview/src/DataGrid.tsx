/**
 * DataGrid component — headless data grid context provider with two-pass rendering,
 * integrated filtering, sorting, and pagination state management.
 *
 * The DataGrid extracts column metadata from the `columns` render callback,
 * manages all state (filtering, sorting, paging, selection), loads data,
 * and provides everything via DataViewContext. It does NOT render any UI —
 * use composable components or the bindx-ui package for rendering.
 */

import React, { memo, type ReactElement, useEffect, useMemo, useCallback, useRef, useState } from 'react'
import type {
	EntityDef,
	OrderDirection,
	FilterHandler,
	FilterArtifact,
	SortingDirections,
	DataViewLayout,
	SelectionValues,
} from '@contember/bindx'
import { createFullTextFilterHandler } from '@contember/bindx'
import type { StateStorageOrName } from './stateStorage.js'
import { SelectionScope, buildQueryFromSelection } from '@contember/bindx'
import {
	useBindxContext,
	useEntityList,
	createCollectorProxy,
	mergeSelections,
	collectSelection,
} from '@contember/bindx-react'
import { extractColumnLeaves } from './columnLeaf.js'
import { useFilteringState, useSortingState, usePagingState, useSelectionState } from './useDataViewState.js'
import { DataViewProvider, type DataViewContextValue, type DataViewLoaderState } from './DataViewContext.js'

/** Well-known filter name for the universal query filter */
export const QUERY_FILTER_NAME = '__query'

// ============================================================================
// DataGrid Props
// ============================================================================

export interface DataGridProps {
	/** Entity definition */
	entity: EntityDef
	/** Column definitions: receives entity proxy `it`, returns column components */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	columns: (it: any) => React.ReactNode
	/** Toolbar definition: receives entity proxy `it`, returns toolbar content */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	toolbar?: (it: any) => React.ReactNode
	/** Rendered content within the DataViewProvider context */
	children?: React.ReactNode
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

function DataGridImpl({
	entity,
	columns: columnDefiner,
	toolbar: toolbarDefiner,
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
}: DataGridProps): ReactElement | null {
	const { schema: schemaRegistry } = useBindxContext()
	const entityType = entity.$name

	// ---- Loader state tracking ----
	const hasLoadedOnce = useRef(false)
	const [loaderState, setLoaderState] = useState<DataViewLoaderState>('initial')

	// ---- Phase 1: Collection ----
	const { columns, selection, queryKey, toolbarContent } = useMemo(() => {
		const scope = new SelectionScope()
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const collector = createCollectorProxy<any>(scope, entityType, schemaRegistry ?? undefined)

		const columnJsx = columnDefiner(collector)
		const cols = extractColumnLeaves(columnJsx)

		// Call collectSelection on each column (for relation columns to capture nested field accesses)
		for (const col of cols) {
			col.collectSelection?.(collector)
		}

		const toolbar = toolbarDefiner ? toolbarDefiner(collector) : undefined

		const jsxSel = collectSelection(columnJsx)
		const sel = scope.toSelectionMeta()
		mergeSelections(sel, jsxSel)

		const query = buildQueryFromSelection(sel)
		const key = JSON.stringify({ entityType, query })

		return { columns: cols, selection: sel, queryKey: key, toolbarContent: toolbar }
	}, [entityType, schemaRegistry, columnDefiner, toolbarDefiner])

	// ---- Phase 2: State management ----
	const filterDefs = useMemo((): ReadonlyMap<string, { handler: FilterHandler<FilterArtifact> }> => {
		const map = new Map<string, { handler: FilterHandler<FilterArtifact> }>()
		const textFieldPaths: string[] = []
		for (const col of columns) {
			if (col.filterName && col.filterHandler) {
				map.set(col.filterName, { handler: col.filterHandler })
			}
			if (col.isTextSearchable && col.fieldName) {
				textFieldPaths.push(col.fieldName)
			}
		}
		// Auto-register query filter across all text-searchable columns
		if (textFieldPaths.length > 0) {
			map.set(QUERY_FILTER_NAME, { handler: createFullTextFilterHandler(textFieldPaths) })
		}
		return map
	}, [columns])

	const sortableFields = useMemo((): ReadonlySet<string> => {
		const set = new Set<string>()
		for (const col of columns) {
			if (col.sortingField) {
				set.add(col.sortingField)
			}
		}
		return set
	}, [columns])

	const initialSortingDirs = useMemo((): SortingDirections | undefined => {
		if (!initialSorting) return undefined
		const dirs: Record<string, OrderDirection> = {}
		for (const [field, dir] of Object.entries(initialSorting)) {
			if (dir) dirs[field] = dir
		}
		return Object.keys(dirs).length > 0 ? dirs : undefined
	}, [initialSorting])

	const filtering = useFilteringState({ filters: filterDefs, stateStorage, storageKey })
	const sorting = useSortingState({ sortableFields, initialSorting: initialSortingDirs, stateStorage, storageKey })
	const paging = usePagingState({
		initialItemsPerPage: itemsPerPage,
		currentPageStateStorage: currentPageStateStorage ?? stateStorage,
		pagingSettingsStorage,
		storageKey,
	})
	const selectionState = useSelectionState({ layouts, initialSelection, stateStorage, storageKey })

	// ---- Phase 3: Build combined filter ----
	const combinedFilter = useMemo((): Record<string, unknown> | undefined => {
		const parts: Record<string, unknown>[] = []
		if (staticFilter) parts.push(staticFilter as Record<string, unknown>)
		if (filtering.resolvedWhere) parts.push(filtering.resolvedWhere)
		if (parts.length === 0) return undefined
		if (parts.length === 1) return parts[0]
		return { and: parts }
	}, [staticFilter, filtering.resolvedWhere])

	// ---- Phase 4: Load data ----
	const result = useEntityList(entity, {
		filter: combinedFilter,
		orderBy: sorting.resolvedOrderBy,
		limit: paging.queryLimit,
		offset: paging.queryOffset,
		selection,
		queryKey,
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
		if (result.status === 'ready' && paging.queryLimit !== undefined && paging.queryOffset !== undefined && itemCount < paging.queryLimit) {
			paging.setTotalCount(paging.queryOffset + itemCount)
		}
	}, [result.status, itemCount, paging.queryLimit, paging.queryOffset, paging.setTotalCount])

	// ---- Reload ----
	const [reloadCounter, setReloadCounter] = useState(0)
	const reload = useCallback((): void => {
		setReloadCounter(c => c + 1)
	}, [])

	// ---- Row highlighting ----
	const [highlightIndex, setHighlightIndex] = useState<number | null>(null)

	// Reset highlight on data change
	useEffect(() => {
		setHighlightIndex(null)
	}, [items])

	const contextValue = useMemo((): DataViewContextValue => ({
		filtering,
		sorting,
		paging,
		selection: selectionState,
		columns,
		entityType,
		items,
		itemCount,
		loaderState,
		reload,
		highlightIndex,
		setHighlightIndex,
		selectionMeta: selection,
		toolbarContent,
	}), [filtering, sorting, paging, selectionState, columns, entityType, items, itemCount, loaderState, reload, highlightIndex, selection, toolbarContent])

	return (
		<DataViewProvider value={contextValue}>
			{children}
		</DataViewProvider>
	)
}

// ============================================================================
// Export
// ============================================================================

export const DataGrid = memo(DataGridImpl) as typeof DataGridImpl
