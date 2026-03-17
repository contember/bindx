/**
 * DataGrid component — headless data grid context provider with children-based
 * marker analysis, integrated filtering, sorting, and pagination state management.
 *
 * The DataGrid receives a single `children` render function that returns a JSX tree
 * containing column markers, optional toolbar/tile markers, and layout components.
 * It analyzes the tree to extract metadata, manages all state (filtering, sorting,
 * paging, selection), loads data, and provides everything via DataViewContext.
 */

import React, { memo, type ReactElement, type ReactNode, useEffect, useMemo, useCallback, useRef, useState } from 'react'
import type {
	EntityDef,
	EntityAccessor,
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
import { ColumnLeaf, type ColumnLeafProps, analyzeChildren } from './columnLeaf.js'
import { DataGridToolbarContent, type DataGridToolbarContentProps } from './markers.js'
import { DataGridLayout, type DataGridLayoutProps } from './markers.js'
import { useFilteringState, useSortingState, usePagingState, useSelectionState } from './useDataViewState.js'
import { useDataViewKey } from './DataViewKeyProvider.js'
import { DataViewProvider, type DataViewContextValue, type DataViewLoaderState, type DataViewElementData } from './DataViewContext.js'
import { DataViewElement, type DataViewElementProps } from './selectionComponents.js'

/** Well-known filter name for the universal query filter */
export const QUERY_FILTER_NAME = '__query'

/** Set of marker types recognized by the DataGrid's children analysis */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MARKER_TYPES: ReadonlySet<React.ComponentType<any>> = new Set([
	ColumnLeaf,
	DataGridToolbarContent,
	DataGridLayout,
])

/** Marker types for extracting DataViewElement from layout render callbacks */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ELEMENT_MARKER_TYPES: ReadonlySet<React.ComponentType<any>> = new Set([
	DataViewElement,
])

// ============================================================================
// DataGrid Props
// ============================================================================

export interface DataGridProps<TEntity extends object = object> {
	/** Entity definition */
	entity: EntityDef<TEntity>
	/** Children render function: receives entity proxy `it`, returns column markers + layout */
	children: (it: EntityAccessor<TEntity>) => ReactNode
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

function DataGridImpl<TEntity extends object>({
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
}: DataGridProps<TEntity>): ReactElement | null {
	const { schema: schemaRegistry } = useBindxContext()
	const entityType = entity.$name
	const contextKey = useDataViewKey()
	const effectiveStorageKey = storageKey ?? contextKey

	// ---- Loader state tracking ----
	const hasLoadedOnce = useRef(false)
	const [loaderState, setLoaderState] = useState<DataViewLoaderState>('initial')

	// ---- Phase 1: Collection ----
	const { childrenJsx, columns, selection, queryKey, toolbarContent, layoutRenders, layoutElements, effectiveLayouts } = useMemo(() => {
		const scope = new SelectionScope()
		const collector = createCollectorProxy<TEntity>(scope, entityType, schemaRegistry ?? undefined) as unknown as EntityAccessor<TEntity>

		const jsx = children(collector)
		const analysis = analyzeChildren(jsx, MARKER_TYPES)

		const cols = analysis.getAll(ColumnLeaf) as unknown as ColumnLeafProps[]
		const toolbarMarker = analysis.getFirst(DataGridToolbarContent) as DataGridToolbarContentProps | undefined
		const layoutMarkers = analysis.getAll(DataGridLayout) as unknown as DataGridLayoutProps[]

		// Call collectSelection on each column (for relation columns to capture nested field accesses)
		for (const col of cols) {
			col.collectSelection?.(collector)
		}

		// Analyze layout callbacks — call with collector proxy for selection discovery + element extraction
		const renders = new Map<string, (item: DataViewContextValue['items'][number]) => ReactNode>()
		const elements = new Map<string, readonly DataViewElementData[]>()
		for (const marker of layoutMarkers) {
			const layoutCallback = marker.children as (item: EntityAccessor<object>) => ReactNode
			const layoutJsx = layoutCallback(collector as unknown as EntityAccessor<object>)
			const layoutSel = collectSelection(layoutJsx)
			mergeSelections(scope.toSelectionMeta(), layoutSel)
			renders.set(marker.name, layoutCallback)

			// Extract DataViewElement markers from the layout JSX
			const elementAnalysis = analyzeChildren(layoutJsx, ELEMENT_MARKER_TYPES)
			const elementProps = elementAnalysis.getAll(DataViewElement) as unknown as DataViewElementProps[]
			if (elementProps.length > 0) {
				elements.set(marker.name, elementProps.map(it => ({ name: it.name, label: it.label, fallback: it.fallback })))
			}
		}

		const jsxSel = collectSelection(jsx)
		const sel = scope.toSelectionMeta()
		mergeSelections(sel, jsxSel)

		const query = buildQueryFromSelection(sel)
		const key = JSON.stringify({ entityType, query })

		// Auto-configure layouts — always include "table", plus any custom layout markers
		const autoLayouts = layouts ?? [
			{ name: 'table', label: 'Table' },
			...layoutMarkers.map(m => ({ name: m.name, label: m.label })),
		]

		return {
			childrenJsx: jsx,
			columns: cols,
			selection: sel,
			queryKey: key,
			toolbarContent: toolbarMarker?.children,
			layoutRenders: renders,
			layoutElements: elements,
			effectiveLayouts: autoLayouts,
		}
	}, [entityType, schemaRegistry, children, layouts])

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

	const filtering = useFilteringState({ filters: filterDefs, stateStorage, storageKey: effectiveStorageKey })
	const sorting = useSortingState({ sortableFields, initialSorting: initialSortingDirs, stateStorage, storageKey: effectiveStorageKey })
	const paging = usePagingState({
		initialItemsPerPage: itemsPerPage,
		currentPageStateStorage: currentPageStateStorage ?? stateStorage,
		pagingSettingsStorage,
		storageKey: effectiveStorageKey,
	})
	const selectionState = useSelectionState({ layouts: effectiveLayouts, initialSelection, stateStorage, storageKey: effectiveStorageKey })

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
		layoutRenders,
		layoutElements,
	}), [filtering, sorting, paging, selectionState, columns, entityType, items, itemCount, loaderState, reload, highlightIndex, selection, toolbarContent, layoutRenders, layoutElements])

	return (
		<DataViewProvider value={contextValue}>
			{childrenJsx}
		</DataViewProvider>
	)
}

// ============================================================================
// Export
// ============================================================================

export const DataGrid = memo(DataGridImpl) as unknown as typeof DataGridImpl
