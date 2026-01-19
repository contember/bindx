import { useMemo, useRef, type ReactNode } from 'react'
import { createCollectorProxy } from '../jsx/proxy.js'
import { collectSelection } from '../jsx/analyzer.js'
import { mergeSelections } from '../jsx/SelectionMeta.js'
import { buildQueryFromSelection, SelectionScope } from '@contember/bindx'
import type { SelectionMeta } from '@contember/bindx'
import type { EntityAccessor } from '../jsx/types.js'

/**
 * Options for useSelectionCollectionForList hook.
 */
export interface UseSelectionCollectionForListOptions<T> {
	/** Entity type name (for debugging) */
	entityType: string
	/** Optional filter (for dependency tracking) */
	filter?: Record<string, unknown>
	/** Optional ordering (for dependency tracking) */
	orderBy?: readonly Record<string, unknown>[]
	/** Optional limit (for dependency tracking) */
	limit?: number
	/** Optional offset (for dependency tracking) */
	offset?: number
	/** Children render function - receives entity and index */
	children: (entity: EntityAccessor<T>, index: number) => ReactNode
}

/**
 * Result from useSelectionCollectionForList hook.
 */
export interface SelectionCollectionForListResult {
	/** Selection metadata for query building */
	selection: SelectionMeta
	/** Stable query key for dependency tracking */
	queryKey: string
}

/**
 * Cached selection data
 */
interface SelectionCache {
	selection: SelectionMeta
	queryKey: string
}

/**
 * Hook for collecting field selection from JSX children for entity lists.
 * Similar to useSelectionCollection but for list rendering.
 *
 * Calls children once with a collector proxy and index 0 to gather
 * the template selection that will be applied to all items.
 *
 * @internal This hook is for internal use only.
 */
export function useSelectionCollectionForList<T>(
	options: UseSelectionCollectionForListOptions<T>,
): SelectionCollectionForListResult {
	const { entityType, filter, orderBy, limit, offset, children } = options

	// Stable children ref - we use a ref to avoid re-running useMemo on every render
	const childrenRef = useRef(children)
	childrenRef.current = children

	// Cache for selection to avoid unnecessary refetches
	const selectionCacheRef = useRef<SelectionCache | null>(null)

	// Stable options key for dependency tracking
	const optionsKey = JSON.stringify({
		filter: filter ?? {},
		orderBy: orderBy ?? [],
		limit,
		offset,
	})

	// Collection phase - runs on every render but caches based on content
	const result = useMemo((): SelectionCollectionForListResult => {
		// Create collector proxy using SelectionScope tree
		const scope = new SelectionScope()
		const collector = createCollectorProxy<T>(scope)

		// Call children with collector and index 0 to gather field access template
		const jsx = childrenRef.current(collector, 0)

		// Analyze the returned JSX for component-level selections
		const jsxSel = collectSelection(jsx)

		// Convert scope to SelectionMeta and merge with JSX selection
		const selection = scope.toSelectionMeta()
		mergeSelections(selection, jsxSel)

		// Debug output can be enabled via global flag
		if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>)['__BINDX_DEBUG__']) {
			console.log('[EntityList] Collected selection for', entityType, ':')
		}

		// Create a stable key from the selection to detect actual changes
		const query = buildQueryFromSelection(selection)
		const newQueryKey = JSON.stringify({ query, filter, orderBy, limit, offset })

		// If the selection hasn't actually changed, return cached values
		const cache = selectionCacheRef.current
		if (cache && cache.queryKey === newQueryKey) {
			return cache
		}

		// Update cache with new values
		const newCache: SelectionCache = {
			selection,
			queryKey: newQueryKey,
		}
		selectionCacheRef.current = newCache

		return newCache
	}, [entityType, optionsKey]) // Only depend on entity identity and options, not children

	return result
}
