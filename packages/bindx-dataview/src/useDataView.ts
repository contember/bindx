/**
 * useDataView — low-level hook for building custom data views.
 *
 * Manages filtering, sorting, paging, and selection state, and loads data
 * from the backend adapter. This is the hook API that DataGrid
 * uses internally, exposed for building custom grid/list UIs.
 */

import { useMemo } from 'react'
import type {
	EntityDef,
	FilterHandler,
	FilterArtifact,
	SelectionMeta,
	FieldError,
	SortingDirections,
	DataViewLayout,
	SelectionValues,
} from '@contember/bindx'
import { buildQueryFromSelection } from '@contember/bindx'
import { useEntityListCore, type EntityListCoreItem } from '@contember/bindx-react'
import {
	useFilteringState,
	useSortingState,
	usePagingState,
	useSelectionState,
	type FilteringState,
	type SortingStateResult,
	type PagingStateResult,
	type SelectionStateResult,
} from './useDataViewState.js'
import type { StateStorageOrName } from './stateStorage.js'

// ============================================================================
// Types
// ============================================================================

export interface UseDataViewOptions {
	/** Filter definitions: name → { handler, initialArtifact? } */
	filters?: ReadonlyMap<string, { handler: FilterHandler<FilterArtifact>; initialArtifact?: FilterArtifact }>
	/** Fields that can be sorted */
	sortableFields?: ReadonlySet<string>
	/** Initial sorting directions (supports multi-column) */
	initialSorting?: SortingDirections
	/** Items per page. null = show all. Default: 50 */
	itemsPerPage?: number | null
	/** Static filter (always applied) */
	filter?: Record<string, unknown>
	/** Selection metadata for building the query */
	selection: SelectionMeta
	/** Available layouts */
	layouts?: readonly DataViewLayout[]
	/** Initial selection (layout + visibility) */
	initialSelection?: SelectionValues
	/** State storage for filter/sorting/selection state */
	stateStorage?: StateStorageOrName
	/** State storage for current page (typically 'url') */
	currentPageStateStorage?: StateStorageOrName
	/** State storage for page size preference (typically 'session' or 'local') */
	pagingSettingsStorage?: StateStorageOrName
	/** Storage key prefix for isolation */
	storageKey?: string
}

export interface DataViewResult {
	/** Current load status */
	readonly status: 'loading' | 'error' | 'ready'
	/** Error if status is 'error' */
	readonly error?: FieldError
	/** Loaded items */
	readonly items: readonly EntityListCoreItem[]
	/** Filtering state and controls */
	readonly filtering: FilteringState
	/** Sorting state and controls */
	readonly sorting: SortingStateResult
	/** Paging state and controls */
	readonly paging: PagingStateResult
	/** Selection state (visibility + layout) */
	readonly selection: SelectionStateResult
}

// ============================================================================
// Hook
// ============================================================================

const EMPTY_FILTERS = new Map<string, { handler: FilterHandler<FilterArtifact> }>()
const EMPTY_SORTABLE = new Set<string>()

export function useDataView(
	entity: EntityDef,
	options: UseDataViewOptions,
): DataViewResult {
	const entityType = entity.$name
	const {
		filters: filterDefs = EMPTY_FILTERS,
		sortableFields = EMPTY_SORTABLE,
		initialSorting,
		itemsPerPage = 50,
		filter: staticFilter,
		selection,
		layouts,
		initialSelection,
		stateStorage,
		currentPageStateStorage,
		pagingSettingsStorage,
		storageKey,
	} = options

	const filtering = useFilteringState({ filters: filterDefs, stateStorage, storageKey })
	const sorting = useSortingState({ sortableFields, initialSorting, stateStorage, storageKey })
	const paging = usePagingState({
		initialItemsPerPage: itemsPerPage,
		currentPageStateStorage: currentPageStateStorage ?? stateStorage,
		pagingSettingsStorage,
		storageKey,
	})
	const selectionState = useSelectionState({ layouts, initialSelection, stateStorage, storageKey })

	// Combine static + dynamic filters
	const combinedFilter = useMemo((): Record<string, unknown> | undefined => {
		const parts: Record<string, unknown>[] = []
		if (staticFilter) parts.push(staticFilter)
		if (filtering.resolvedWhere) parts.push(filtering.resolvedWhere)
		if (parts.length === 0) return undefined
		if (parts.length === 1) return parts[0]
		return { and: parts }
	}, [staticFilter, filtering.resolvedWhere])

	// Build query key
	const queryKey = useMemo(() => {
		const query = buildQueryFromSelection(selection)
		return JSON.stringify({ entityType, query })
	}, [entityType, selection])

	// Load data
	const result = useEntityListCore({
		entityType,
		filter: combinedFilter,
		orderBy: sorting.resolvedOrderBy,
		limit: paging.queryLimit,
		offset: paging.queryOffset,
		selectionMeta: selection,
		queryKey,
	})

	return {
		status: result.status,
		error: result.error,
		items: result.items,
		filtering,
		sorting,
		paging,
		selection: selectionState,
	}
}
