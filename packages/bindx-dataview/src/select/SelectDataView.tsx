/**
 * SelectDataView — provides a DataView context for select option lists.
 *
 * Analyzes the children render function for field selection, loads data
 * from the options entity, and provides a DataView context for rendering.
 * Children are rendered directly inside the DataView — use DataViewEachRow
 * or DataViewLoaderState to iterate items and show loading states.
 *
 * Usage:
 * ```tsx
 * <Select relation={article.category} options={schema.Category}>
 *   <SelectDataView queryField={['name']}>
 *     <DataViewEachRow>
 *       {(item) => (
 *         <SelectOption entity={item}>
 *           <SelectItemTrigger entity={item}>
 *             <button>{item.name.value}</button>
 *           </SelectItemTrigger>
 *         </SelectOption>
 *       )}
 *     </DataViewEachRow>
 *   </SelectDataView>
 * </Select>
 * ```
 */

import { memo, type ReactElement, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
	EntityAccessor,
	FilterArtifact,
	FilterHandler,
	OrderDirection,
	SortingDirections,
} from '@contember/bindx'
import { SelectionScope, buildQueryFromSelection, createFullTextFilterHandler, FIELD_REF_META } from '@contember/bindx'
import type { FieldRefBase } from '@contember/bindx'
import {
	useBindxContext,
	useEntityList,
	createCollectorProxy,
	mergeSelections,
	collectSelection,
} from '@contember/bindx-react'
import { useSelectOptions } from './selectContext.js'
import { DataViewProvider, type DataViewContextValue, type DataViewLoaderState } from '../DataViewContext.js'
import { useFilteringState, useSortingState, usePagingState, useSelectionState } from '../useDataViewState.js'

export interface SelectDataViewProps {
	/** Children rendered inside the DataView context */
	children: ReactNode
	/** Selection definer — called with collector proxy to discover fields */
	selection?: (it: EntityAccessor<object>) => ReactNode
	/** Field(s) to search across */
	queryField?: FieldRefBase<unknown> | FieldRefBase<unknown>[] | string[]
	/** Initial sort order */
	initialSorting?: Partial<Record<string, OrderDirection>>
	/** Static filter for the options list */
	filter?: Record<string, unknown>
	/** Items per page (null = all). Default: 50 */
	itemsPerPage?: number | null
}

const QUERY_FILTER_NAME = '__query'

function SelectDataViewImpl({
	children,
	selection: selectionDefiner,
	queryField,
	initialSorting,
	filter: staticFilter,
	itemsPerPage = 50,
}: SelectDataViewProps): ReactElement | null {
	const options = useSelectOptions()
	const { schema: schemaRegistry } = useBindxContext()
	const entityType = options.$name

	// ---- Loader state tracking ----
	const hasLoadedOnce = useRef(false)
	const [loaderState, setLoaderState] = useState<DataViewLoaderState>('initial')

	// ---- Build selection from definer ----
	// Use ref for selectionDefiner to avoid re-running on every render
	// (inline arrow functions create new refs each render)
	const selectionDefinerRef = useRef(selectionDefiner)
	selectionDefinerRef.current = selectionDefiner

	const { selection, queryKey } = useMemo(() => {
		const scope = new SelectionScope()
		const collector = createCollectorProxy<object>(scope, entityType, schemaRegistry ?? undefined) as EntityAccessor<object>

		if (selectionDefinerRef.current) {
			const jsx = selectionDefinerRef.current(collector)
			const jsxSel = collectSelection(jsx)
			const sel = scope.toSelectionMeta()
			mergeSelections(sel, jsxSel)
		}

		const sel = scope.toSelectionMeta()
		const query = buildQueryFromSelection(sel)
		const key = JSON.stringify({ entityType, query })

		return { selection: sel, queryKey: key }
	}, [entityType, schemaRegistry])

	// ---- Filter setup ----
	const filterDefs = useMemo((): ReadonlyMap<string, { handler: FilterHandler<FilterArtifact> }> => {
		const map = new Map<string, { handler: FilterHandler<FilterArtifact> }>()

		// Resolve query fields: explicit prop → auto-derive from selection scalars
		let resolvedPaths: string[] | undefined
		if (queryField) {
			const fields = Array.isArray(queryField) ? queryField : [queryField]
			resolvedPaths = fields.map(f => typeof f === 'string' ? f : f[FIELD_REF_META].fieldName)
		} else if (selection.fields.size > 0) {
			// Auto-derive: use all scalar fields from selection as searchable fields
			resolvedPaths = []
			for (const [name, field] of selection.fields) {
				if (!field.nested) resolvedPaths.push(name)
			}
		}

		if (resolvedPaths && resolvedPaths.length > 0) {
			map.set(QUERY_FILTER_NAME, { handler: createFullTextFilterHandler(resolvedPaths) })
		}
		return map
	}, [queryField, selection])

	const sortableFields = useMemo((): ReadonlySet<string> => new Set(), [])

	const initialSortingDirs = useMemo((): SortingDirections | undefined => {
		if (!initialSorting) return undefined
		const dirs: Record<string, OrderDirection> = {}
		for (const [field, dir] of Object.entries(initialSorting)) {
			if (dir) dirs[field] = dir
		}
		return Object.keys(dirs).length > 0 ? dirs : undefined
	}, [initialSorting])

	// ---- State (no persistence for select dropdowns) ----
	const filtering = useFilteringState({ filters: filterDefs })
	const sorting = useSortingState({ sortableFields, initialSorting: initialSortingDirs })
	const paging = usePagingState({ initialItemsPerPage: itemsPerPage })
	const selectionState = useSelectionState({})

	// ---- Build combined filter ----
	const combinedFilter = useMemo((): Record<string, unknown> | undefined => {
		const parts: Record<string, unknown>[] = []
		if (staticFilter) parts.push(staticFilter)
		if (filtering.resolvedWhere) parts.push(filtering.resolvedWhere)
		if (parts.length === 0) return undefined
		if (parts.length === 1) return parts[0]
		return { and: parts }
	}, [staticFilter, filtering.resolvedWhere])

	// ---- Load data ----
	const result = useEntityList(options, {
		filter: combinedFilter,
		orderBy: sorting.resolvedOrderBy,
		limit: paging.queryLimit,
		offset: paging.queryOffset,
		selection,
		queryKey,
	})

	const items = result.$status === 'ready' ? result.items : []
	const itemCount = items.length

	// Update loader state
	useEffect(() => {
		if (result.$status === 'ready') {
			hasLoadedOnce.current = true
			setLoaderState('loaded')
		} else if (result.$status === 'error') {
			setLoaderState('failed')
		} else if (result.$status === 'loading') {
			setLoaderState(hasLoadedOnce.current ? 'refreshing' : 'initial')
		}
	}, [result.$status])

	// Update total count for paging
	useEffect(() => {
		if (result.$status === 'ready' && paging.queryLimit !== undefined && paging.queryOffset !== undefined && itemCount < paging.queryLimit) {
			paging.setTotalCount(paging.queryOffset + itemCount)
		}
	}, [result.$status, itemCount, paging.queryLimit, paging.queryOffset, paging.setTotalCount])

	// ---- Reload ----
	const [, setReloadCounter] = useState(0)
	const reload = useCallback((): void => {
		setReloadCounter(c => c + 1)
	}, [])

	// ---- Row highlighting ----
	const [highlightIndex, setHighlightIndex] = useState<number | null>(null)

	// Reset highlight when filter/sort changes (not on every items reference change)
	const filterKey = filtering.resolvedWhere ? JSON.stringify(filtering.resolvedWhere) : ''
	const sortKey = sorting.resolvedOrderBy ? JSON.stringify(sorting.resolvedOrderBy) : ''
	useEffect(() => {
		setHighlightIndex(null)
	}, [filterKey, sortKey])

	const emptyMap = useMemo(() => new Map(), [])

	const contextValue = useMemo((): DataViewContextValue => ({
		filtering,
		sorting,
		paging,
		selection: selectionState,
		columns: [],
		entityType,
		items,
		itemCount,
		loaderState,
		reload,
		highlightIndex,
		setHighlightIndex,
		selectionMeta: selection,
		toolbarContent: undefined,
		layoutRenders: emptyMap,
		layoutElements: emptyMap,
	}), [filtering, sorting, paging, selectionState, entityType, items, itemCount, loaderState, reload, highlightIndex, selection, emptyMap])

	return (
		<DataViewProvider value={contextValue}>
			{children}
		</DataViewProvider>
	)
}

export const SelectDataView = memo(SelectDataViewImpl) as unknown as typeof SelectDataViewImpl
