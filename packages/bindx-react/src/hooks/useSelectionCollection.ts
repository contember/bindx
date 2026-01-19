import { useMemo, useRef, type ReactNode } from 'react'
import { createCollectorProxy } from '../jsx/proxy.js'
import { collectSelection, debugSelection } from '../jsx/analyzer.js'
import { mergeSelections } from '../jsx/SelectionMeta.js'
import { buildQueryFromSelection, SelectionScope } from '@contember/bindx'
import type { SelectionMeta } from '@contember/bindx'
import type { EntityAccessor } from '../jsx/types.js'

/**
 * Options for useSelectionCollection hook.
 */
export interface UseSelectionCollectionOptions<T> {
	/** Entity type name (for debugging) */
	entityType: string
	/** Entity ID (for dependency tracking) */
	entityId: string
	/** Children render function */
	children: (entity: EntityAccessor<T>) => ReactNode
}

/**
 * Result from useSelectionCollection hook.
 */
export interface SelectionCollectionResult {
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
 * Hook for collecting field selection from JSX children.
 * Implements the two-phase rendering approach:
 * 1. Creates a collector proxy
 * 2. Calls children with the proxy to gather field accesses
 * 3. Analyzes returned JSX for component-level selections
 * 4. Merges both sources of selection
 *
 * @internal This hook is for internal use only.
 */
export function useSelectionCollection<T>(
	options: UseSelectionCollectionOptions<T>,
): SelectionCollectionResult {
	const { entityType, entityId, children } = options

	// Stable children ref - we use a ref to avoid re-running useMemo on every render
	// The children function might be recreated on every render, but if the selection
	// content is the same, we don't need to refetch
	const childrenRef = useRef(children)
	childrenRef.current = children

	// Cache for selection to avoid unnecessary refetches
	const selectionCacheRef = useRef<SelectionCache | null>(null)

	// Collection phase - runs on every render but caches based on content
	const result = useMemo((): SelectionCollectionResult => {
		// Create collector proxy using SelectionScope tree
		const scope = new SelectionScope()
		const collector = createCollectorProxy<T>(scope)

		// Call children with collector to gather field access
		const jsx = childrenRef.current(collector)

		// Analyze the returned JSX for component-level selections
		const jsxSel = collectSelection(jsx)

		// Convert scope to SelectionMeta and merge with JSX selection
		const selection = scope.toSelectionMeta()
		mergeSelections(selection, jsxSel)

		// Debug output can be enabled via global flag
		if (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>)['__BINDX_DEBUG__']) {
			console.log('[Entity] Collected selection for', entityType, ':')
			console.log(debugSelection(selection))
		}

		// Create a stable key from the selection to detect actual changes
		const query = buildQueryFromSelection(selection)
		const newQueryKey = JSON.stringify(query)

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
	}, [entityType, entityId]) // Only depend on entity identity, not children

	return result
}
