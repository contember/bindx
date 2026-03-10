/**
 * State management hooks for DataView filtering, sorting, paging, and selection.
 *
 * All hooks support optional state storage (URL, session, local, custom)
 * for persisting state across navigations.
 */

import { useState, useCallback, useMemo } from 'react'
import type {
	FilterHandler,
	FilterArtifact,
	SortingState,
	SortingDirections,
	SortingDirectionAction,
	PagingState,
	PagingInfo,
	OrderDirection,
	DataViewLayout,
	SelectionValues,
	SelectionState,
	FieldRefBase,
} from '@contember/bindx'
import { FIELD_REF_META } from '@contember/bindx'
import { useStoredState, type StateStorageOrName } from './stateStorage.js'

// ============================================================================
// Filter State
// ============================================================================

export interface RegisteredFilter {
	readonly name: string
	readonly handler: FilterHandler<FilterArtifact>
	artifact: FilterArtifact
}

export interface FilteringState {
	readonly filters: ReadonlyMap<string, RegisteredFilter>
	getArtifact(name: string): FilterArtifact | undefined
	setArtifact(name: string, artifact: FilterArtifact): void
	resetFilter(name: string): void
	resetAll(): void
	readonly hasActiveFilters: boolean
	readonly resolvedWhere: Record<string, unknown> | undefined
}

export interface UseFilteringOptions {
	filters: ReadonlyMap<string, { handler: FilterHandler<FilterArtifact>; initialArtifact?: FilterArtifact }>
	/** State storage backend. Default: 'null' (no persistence) */
	stateStorage?: StateStorageOrName
	/** Storage key prefix */
	storageKey?: string
}

export function useFilteringState(options: UseFilteringOptions): FilteringState {
	const { filters: filterDefs, stateStorage = 'null', storageKey = 'dataview' } = options

	const defaultArtifacts = useMemo((): Record<string, FilterArtifact> => {
		const result: Record<string, FilterArtifact> = {}
		for (const [name, def] of filterDefs) {
			result[name] = def.initialArtifact ?? def.handler.defaultArtifact()
		}
		return result
	}, [filterDefs])

	const [artifacts, setArtifacts] = useStoredState<Record<string, FilterArtifact>>(
		stateStorage,
		[storageKey, 'filters'],
		(stored) => stored ?? defaultArtifacts,
	)

	const getArtifact = useCallback(
		(name: string): FilterArtifact | undefined => artifacts[name],
		[artifacts],
	)

	const setArtifact = useCallback(
		(name: string, artifact: FilterArtifact): void => {
			setArtifacts({ ...artifacts, [name]: artifact })
		},
		[artifacts, setArtifacts],
	)

	const resetFilter = useCallback(
		(name: string): void => {
			const def = filterDefs.get(name)
			if (!def) return
			setArtifacts({ ...artifacts, [name]: def.handler.defaultArtifact() })
		},
		[filterDefs, artifacts, setArtifacts],
	)

	const resetAll = useCallback((): void => {
		setArtifacts(defaultArtifacts)
	}, [defaultArtifacts, setArtifacts])

	const hasActiveFilters = useMemo((): boolean => {
		for (const [name, def] of filterDefs) {
			const artifact = artifacts[name]
			if (artifact && def.handler.isActive(artifact)) {
				return true
			}
		}
		return false
	}, [filterDefs, artifacts])

	const resolvedWhere = useMemo((): Record<string, unknown> | undefined => {
		const conditions: Record<string, unknown>[] = []
		for (const [name, def] of filterDefs) {
			const artifact = artifacts[name]
			if (!artifact) continue
			const where = def.handler.toWhere(artifact)
			if (where) conditions.push(where)
		}
		if (conditions.length === 0) return undefined
		if (conditions.length === 1) return conditions[0]
		return { and: conditions }
	}, [filterDefs, artifacts])

	const filters = useMemo((): ReadonlyMap<string, RegisteredFilter> => {
		const map = new Map<string, RegisteredFilter>()
		for (const [name, def] of filterDefs) {
			map.set(name, {
				name,
				handler: def.handler,
				artifact: artifacts[name] ?? def.handler.defaultArtifact(),
			})
		}
		return map
	}, [filterDefs, artifacts])

	return { filters, getArtifact, setArtifact, resetFilter, resetAll, hasActiveFilters, resolvedWhere }
}

// ============================================================================
// Sorting State (Multi-Column)
// ============================================================================

export interface UseSortingOptions {
	sortableFields: ReadonlySet<string>
	initialSorting?: SortingDirections
	stateStorage?: StateStorageOrName
	storageKey?: string
}

export interface SortingStateResult {
	readonly state: SortingState
	setOrderBy<T>(field: FieldRefBase<T>, action: SortingDirectionAction, append?: boolean): void
	clear(): void
	directionOf<T>(field: FieldRefBase<T>): OrderDirection | null
	readonly resolvedOrderBy: readonly Record<string, unknown>[] | undefined
}

function resolveSortAction(
	currentDirection: OrderDirection | null,
	action: SortingDirectionAction,
): OrderDirection | null {
	switch (action) {
		case 'next':
			if (currentDirection === null) return 'asc'
			if (currentDirection === 'asc') return 'desc'
			return null
		case 'toggleAsc':
			return currentDirection === 'asc' ? null : 'asc'
		case 'toggleDesc':
			return currentDirection === 'desc' ? null : 'desc'
		case 'clear':
			return null
		default:
			return action
	}
}

export function useSortingState(options: UseSortingOptions): SortingStateResult {
	const { sortableFields, initialSorting, stateStorage = 'null', storageKey = 'dataview' } = options

	const [directions, setDirections] = useStoredState<SortingDirections>(
		stateStorage,
		[storageKey, 'sorting'],
		(stored) => stored ?? initialSorting ?? {},
	)

	const state = useMemo((): SortingState => ({ directions }), [directions])

	const setOrderBy = useCallback(
		<T>(field: FieldRefBase<T>, action: SortingDirectionAction, append?: boolean): void => {
			const fieldName = field[FIELD_REF_META].fieldName
			if (!sortableFields.has(fieldName)) return
			const currentDir = directions[fieldName] ?? null
			const newDir = resolveSortAction(currentDir, action)

			if (append) {
				const next = { ...directions }
				if (newDir) {
					next[fieldName] = newDir
				} else {
					delete next[fieldName]
				}
				setDirections(next)
			} else if (newDir) {
				setDirections({ [fieldName]: newDir })
			} else {
				setDirections({})
			}
		},
		[sortableFields, directions, setDirections],
	)

	const clear = useCallback((): void => {
		setDirections({})
	}, [setDirections])

	const directionOf = useCallback(
		<T>(field: FieldRefBase<T>): OrderDirection | null => directions[field[FIELD_REF_META].fieldName] ?? null,
		[directions],
	)

	const resolvedOrderBy = useMemo((): readonly Record<string, unknown>[] | undefined => {
		const entries = Object.entries(directions)
		if (entries.length === 0) return undefined
		return entries.map(([field, dir]) => buildNestedOrderBy(field, dir))
	}, [directions])

	return { state, setOrderBy, clear, directionOf, resolvedOrderBy }
}

function buildNestedOrderBy(fieldPath: string, direction: OrderDirection): Record<string, unknown> {
	const parts = fieldPath.split('.')
	let result: Record<string, unknown> = { [parts[parts.length - 1]!]: direction }
	for (let i = parts.length - 2; i >= 0; i--) {
		result = { [parts[i]!]: result }
	}
	return result
}

// ============================================================================
// Paging State
// ============================================================================

export interface UsePagingOptions {
	/** Initial items per page. null = show all. Default: 50 */
	initialItemsPerPage?: number | null
	/** State storage for current page */
	currentPageStateStorage?: StateStorageOrName
	/** State storage for page size preference */
	pagingSettingsStorage?: StateStorageOrName
	/** Storage key prefix */
	storageKey?: string
}

export interface PagingStateResult {
	readonly state: PagingState
	readonly info: PagingInfo
	readonly hasPrevious: boolean
	readonly hasNext: boolean
	goTo(page: number): void
	next(): void
	previous(): void
	first(): void
	last(): void
	setItemsPerPage(count: number | null): void
	setTotalCount(count: number): void
	refreshTotalCount(): void
	readonly queryLimit: number | undefined
	readonly queryOffset: number | undefined
}

export function usePagingState(options: UsePagingOptions = {}): PagingStateResult {
	const {
		initialItemsPerPage = 50,
		currentPageStateStorage = 'null',
		pagingSettingsStorage = 'null',
		storageKey = 'dataview',
	} = options

	const [pageIndex, setPageIndex] = useStoredState<number>(
		currentPageStateStorage,
		[storageKey, 'pageIndex'],
		(stored) => stored ?? 0,
	)

	const [itemsPerPage, setItemsPerPageRaw] = useStoredState<number | null>(
		pagingSettingsStorage,
		[storageKey, 'itemsPerPage'],
		(stored) => stored ?? initialItemsPerPage,
	)

	const state = useMemo((): PagingState => ({
		pageIndex,
		itemsPerPage: itemsPerPage ?? 0,
	}), [pageIndex, itemsPerPage])

	const [totalCount, setTotalCount] = useState<number | null>(null)
	const [refreshCounter, setRefreshCounter] = useState(0)

	const totalPages = useMemo((): number | null => {
		if (totalCount === null || itemsPerPage === null) return null
		return Math.max(1, Math.ceil(totalCount / itemsPerPage))
	}, [totalCount, itemsPerPage])

	const info: PagingInfo = useMemo(() => ({
		totalCount,
		totalPages,
	}), [totalCount, totalPages])

	const hasPrevious = pageIndex > 0
	const hasNext = itemsPerPage === null ? false : (totalPages !== null ? pageIndex < totalPages - 1 : true)

	const goTo = useCallback(
		(page: number): void => setPageIndex(Math.max(0, page)),
		[setPageIndex],
	)

	const next = useCallback((): void => setPageIndex(pageIndex + 1), [pageIndex, setPageIndex])
	const previous = useCallback((): void => setPageIndex(Math.max(0, pageIndex - 1)), [pageIndex, setPageIndex])
	const first = useCallback((): void => setPageIndex(0), [setPageIndex])

	const last = useCallback((): void => {
		if (totalPages === null) return
		setPageIndex(Math.max(0, totalPages - 1))
	}, [totalPages, setPageIndex])

	const setItemsPerPage = useCallback(
		(count: number | null): void => {
			setItemsPerPageRaw(count)
			setPageIndex(0)
		},
		[setItemsPerPageRaw, setPageIndex],
	)

	const refreshTotalCount = useCallback((): void => {
		setRefreshCounter(c => c + 1)
		setTotalCount(null)
	}, [])

	return {
		state,
		info,
		hasPrevious,
		hasNext,
		goTo,
		next,
		previous,
		first,
		last,
		setItemsPerPage,
		setTotalCount,
		refreshTotalCount,
		queryLimit: itemsPerPage ?? undefined,
		queryOffset: itemsPerPage === null ? undefined : pageIndex * itemsPerPage,
	}
}

// ============================================================================
// Selection State (Column Visibility + Layout)
// ============================================================================

export interface UseSelectionOptions {
	layouts?: readonly DataViewLayout[]
	initialSelection?: SelectionValues
	stateStorage?: StateStorageOrName
	storageKey?: string
}

export interface SelectionStateResult {
	readonly state: SelectionState
	setLayout(layout: string | undefined): void
	setVisibility(name: string, visible: boolean | undefined): void
	isVisible(name: string, fallback?: boolean): boolean
	readonly currentLayout: string | undefined
}

const DEFAULT_SELECTION: SelectionValues = { visibility: {} }

export function useSelectionState(options: UseSelectionOptions = {}): SelectionStateResult {
	const { layouts = [], initialSelection, stateStorage = 'null', storageKey = 'dataview' } = options

	const [values, setValues] = useStoredState<SelectionValues>(
		stateStorage,
		[storageKey, 'selection'],
		(stored) => stored ?? initialSelection ?? DEFAULT_SELECTION,
	)

	const state = useMemo((): SelectionState => ({ values, layouts }), [values, layouts])

	const setLayout = useCallback((layout: string | undefined): void => {
		setValues({ ...values, layout })
	}, [values, setValues])

	const setVisibility = useCallback((name: string, visible: boolean | undefined): void => {
		const next = { ...values.visibility }
		if (visible === undefined) {
			delete next[name]
		} else {
			next[name] = visible
		}
		setValues({ ...values, visibility: next })
	}, [values, setValues])

	const isVisible = useCallback((name: string, fallback = true): boolean => {
		return values.visibility[name] ?? fallback
	}, [values.visibility])

	return { state, setLayout, setVisibility, isVisible, currentLayout: values.layout }
}
