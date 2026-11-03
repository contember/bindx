import { useContext, useMemo, useRef, type ReactNode } from 'react'
import { createCollectorProxy } from '../jsx/proxy.js'
import { collectSelection, debugSelection } from '../jsx/analyzer.js'
import { mergeSelections } from '../jsx/SelectionMeta.js'
import { buildQueryFromSelection, SelectionScope } from '@contember/bindx'
import type { SelectionMeta, SchemaRegistry } from '@contember/bindx'
import type { EntityAccessor } from '../jsx/types.js'
import { BindxContext } from './BackendAdapterContext.js'

/**
 * Options for useSelectionCollection hook.
 */
export interface UseSelectionCollectionOptions {
	/** Entity type name (for debugging) */
	entityType: string
	/** Stable key for useMemo dependencies (e.g., entityId or JSON-serialized options) */
	depsKey: string
	/** Collector function — receives a collector proxy, returns JSX for analysis */
	collect: (collector: EntityAccessor<unknown>) => ReactNode
	/**
	 * The user-supplied render function `collect` wraps. A new identity re-runs the
	 * collection: React reuses an <Entity> across conditional branches that differ only
	 * in their children, and those children may read fields the previous ones did not.
	 * The collected result stays the same object while its query does not change.
	 */
	source?: unknown
	/** Extra data to include in the query key (e.g., filter/orderBy for lists) */
	queryKeyExtra?: Record<string, unknown>
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
 * 2. Calls the collect function with the proxy to gather field accesses
 * 3. Analyzes returned JSX for component-level selections
 * 4. Merges both sources of selection
 *
 * Selection is collected once per `depsKey` and `source`. Re-renders driven by the
 * store keep the same `source`, so they do not re-run the collection.
 *
 * **Limitation:** Fields accessed conditionally in the collect function are only
 * captured if they are accessed when the collection runs.
 *
 * @internal This hook is for internal use only.
 */
export function useSelectionCollection(
	options: UseSelectionCollectionOptions,
): SelectionCollectionResult {
	const { entityType, depsKey, collect, source, queryKeyExtra } = options
	const bindxContext = useContext(BindxContext)

	// `collect` is usually an inline closure; `source` decides when collection re-runs.
	const collectRef = useRef(collect)
	collectRef.current = collect

	// Cache for selection to avoid unnecessary refetches
	const selectionCacheRef = useRef<SelectionCache | null>(null)

	const schemaRegistry = bindxContext?.schema ?? null

	// Collection phase - runs on every render but caches based on content
	const result = useMemo((): SelectionCollectionResult => {
		// Create collector proxy using SelectionScope tree
		const scope = new SelectionScope()
		const collector = createCollectorProxy<unknown>(scope, entityType, schemaRegistry as SchemaRegistry<Record<string, object>> | null)

		// Call collect function with the proxy to gather field access
		const jsx = collectRef.current(collector)

		// Analyze the returned JSX for component-level selections
		let jsxSel: SelectionMeta
		try {
			jsxSel = collectSelection(jsx)
		} catch {
			// staticRender of nested components may crash during collection
			jsxSel = { fields: new Map() }
		}

		// Convert scope to SelectionMeta and merge with JSX selection
		const selection = scope.toSelectionMeta()
		mergeSelections(selection, jsxSel)

		// Debug output can be enabled via the debug prop on BindxProvider
		if (bindxContext?.debug) {
			console.log('[Selection] Collected selection for', entityType, ':')
			console.log(debugSelection(selection))
		}

		// Create a stable key from the selection to detect actual changes
		const query = buildQueryFromSelection(selection)
		const newQueryKey = queryKeyExtra
			? JSON.stringify({ query, ...queryKeyExtra })
			: JSON.stringify(query)

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
	}, [entityType, depsKey, source, schemaRegistry])

	return result
}
