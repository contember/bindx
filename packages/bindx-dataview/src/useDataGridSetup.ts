/**
 * Shared setup logic for DataGrid and HasManyDataGrid.
 * Handles collection phase (JSX analysis), state management, and filter building.
 */

import React, { type ReactNode, useMemo } from 'react'
import type {
	EntityAccessor,
	OrderDirection,
	FilterHandler,
	FilterArtifact,
	SortingDirections,
	DataViewLayout,
	SelectionMeta,
	SelectionValues,
	SchemaRegistry,
} from '@contember/bindx'
import { createFullTextFilterHandler, SelectionScope, buildQueryFromSelection } from '@contember/bindx'
import {
	createCollectorProxy,
	mergeSelections,
	collectSelection,
} from '@contember/bindx-react'
import { ColumnLeaf, type ColumnLeafProps, analyzeChildren } from './columnLeaf.js'
import { DataGridToolbarContent, type DataGridToolbarContentProps } from './markers.js'
import { DataGridLayout, type DataGridLayoutProps } from './markers.js'
import { useFilteringState, useSortingState, usePagingState, useSelectionState } from './useDataViewState.js'
import type { StateStorageOrName } from './stateStorage.js'
import type { DataViewContextValue, DataViewElementData } from './DataViewContext.js'
import { DataViewElement, type DataViewElementProps } from './selectionComponents.js'

export const QUERY_FILTER_NAME = '__query'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MARKER_TYPES: ReadonlySet<React.ComponentType<any>> = new Set([
	ColumnLeaf,
	DataGridToolbarContent,
	DataGridLayout,
])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ELEMENT_MARKER_TYPES: ReadonlySet<React.ComponentType<any>> = new Set([
	DataViewElement,
])

export interface DataGridCommonProps<TEntity extends object> {
	children: (it: EntityAccessor<TEntity>) => ReactNode
	initialSorting?: Partial<Record<string, OrderDirection>>
	itemsPerPage?: number | null
	filter?: Record<string, unknown>
	layouts?: readonly DataViewLayout[]
	initialSelection?: SelectionValues
	stateStorage?: StateStorageOrName
	currentPageStateStorage?: StateStorageOrName
	pagingSettingsStorage?: StateStorageOrName
	storageKey?: string
}

export interface DataGridSetupResult {
	childrenJsx: ReactNode
	columns: ColumnLeafProps[]
	selection: SelectionMeta
	queryKey: string
	toolbarContent: ReactNode | undefined
	layoutRenders: Map<string, (item: DataViewContextValue['items'][number]) => ReactNode>
	layoutElements: Map<string, readonly DataViewElementData[]>
	effectiveLayouts: readonly DataViewLayout[]
	filtering: ReturnType<typeof useFilteringState>
	sorting: ReturnType<typeof useSortingState>
	paging: ReturnType<typeof usePagingState>
	selectionState: ReturnType<typeof useSelectionState>
	combinedFilter: Record<string, unknown> | undefined
}

export function useDataGridSetup<TEntity extends object>({
	entityType,
	schemaRegistry,
	children,
	initialSorting,
	itemsPerPage = 50,
	staticFilter,
	layouts,
	initialSelection,
	stateStorage,
	currentPageStateStorage,
	pagingSettingsStorage,
	storageKey,
}: {
	entityType: string
	schemaRegistry: SchemaRegistry | null
	children: (it: EntityAccessor<TEntity>) => ReactNode
	initialSorting?: Partial<Record<string, OrderDirection>>
	itemsPerPage?: number | null
	staticFilter?: Record<string, unknown>
	layouts?: readonly DataViewLayout[]
	initialSelection?: SelectionValues
	stateStorage?: StateStorageOrName
	currentPageStateStorage?: StateStorageOrName
	pagingSettingsStorage?: StateStorageOrName
	storageKey?: string
}): DataGridSetupResult {
	// ---- Phase 1: Collection ----
	const { childrenJsx, columns, selection, queryKey, toolbarContent, layoutRenders, layoutElements, effectiveLayouts } = useMemo(() => {
		const scope = new SelectionScope()
		// Collector proxy satisfies EntityAccessor interface at runtime for selection collection
		const collector = createCollectorProxy<TEntity>(scope, entityType, schemaRegistry ?? undefined) as EntityAccessor<TEntity>

		const jsx = children(collector)
		const analysis = analyzeChildren(jsx, MARKER_TYPES)

		const cols = analysis.getAll<ColumnLeafProps>(ColumnLeaf)
		const toolbarMarker = analysis.getFirst<DataGridToolbarContentProps>(DataGridToolbarContent)
		const layoutMarkers = analysis.getAll<DataGridLayoutProps>(DataGridLayout)

		for (const col of cols) {
			col.collectSelection?.(collector)
		}

		const renders = new Map<string, (item: DataViewContextValue['items'][number]) => ReactNode>()
		const elements = new Map<string, readonly DataViewElementData[]>()
		for (const marker of layoutMarkers) {
			const layoutCallback = marker.children as (item: EntityAccessor<object>) => ReactNode
			const layoutJsx = layoutCallback(collector as EntityAccessor<object>)
			const layoutSel = collectSelection(layoutJsx)
			mergeSelections(scope.toSelectionMeta(), layoutSel)
			renders.set(marker.name, layoutCallback)

			const elementAnalysis = analyzeChildren(layoutJsx, ELEMENT_MARKER_TYPES)
			const elementProps = elementAnalysis.getAll<DataViewElementProps>(DataViewElement)
			if (elementProps.length > 0) {
				elements.set(marker.name, elementProps.map(it => ({ name: it.name, label: it.label, fallback: it.fallback })))
			}
		}

		const jsxSel = collectSelection(jsx)
		const sel = scope.toSelectionMeta()
		mergeSelections(sel, jsxSel)

		const query = buildQueryFromSelection(sel)
		const key = JSON.stringify({ entityType, query })

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
	const selectionState = useSelectionState({ layouts: effectiveLayouts, initialSelection, stateStorage, storageKey })

	// ---- Phase 3: Build combined filter ----
	const combinedFilter = useMemo((): Record<string, unknown> | undefined => {
		const parts: Record<string, unknown>[] = []
		if (staticFilter) parts.push(staticFilter as Record<string, unknown>)
		if (filtering.resolvedWhere) parts.push(filtering.resolvedWhere)
		if (parts.length === 0) return undefined
		if (parts.length === 1) return parts[0]
		return { and: parts }
	}, [staticFilter, filtering.resolvedWhere])

	return {
		childrenJsx,
		columns,
		selection,
		queryKey,
		toolbarContent,
		layoutRenders,
		layoutElements,
		effectiveLayouts,
		filtering,
		sorting,
		paging,
		selectionState,
		combinedFilter,
	}
}
