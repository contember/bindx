import { useContext, useMemo, useRef, type ReactNode } from 'react'
import { createCollectorProxy } from '../jsx/proxy.js'
import { collectSelection, debugSelection } from '../jsx/analyzer.js'
import { mergeSelections } from '../jsx/SelectionMeta.js'
import { buildQueryFromSelection, SelectionScope } from '@contember/bindx'
import type { SelectionMeta, SelectionFieldMeta, SchemaRegistry } from '@contember/bindx'
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
	 * For one entity type and `depsKey` the selection only grows — fields the new children
	 * no longer read stay selected — so the result changes (and the data is refetched) only
	 * when a field nobody requested before appears. Pass a stable `source` from a parent
	 * that re-renders often: every new identity runs the collection again.
	 */
	source?: unknown
	/**
	 * Whether the selection grows across collections (default `true`). Off, every
	 * collection stands on its own — for a caller that fetches a different selection and
	 * only compares against this one.
	 */
	grow?: boolean
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
	/** What the selection was grown under; a change in any of them starts afresh. */
	entityType: string
	depsKey: string
	schemaRegistry: unknown
}

/** Deep copy, so a merge into it cannot reach selections other code still holds. */
function cloneSelection(selection: SelectionMeta): SelectionMeta {
	const fields = new Map<string, SelectionFieldMeta>()
	for (const [key, field] of selection.fields) {
		fields.set(key, field.nested ? { ...field, nested: cloneSelection(field.nested) } : { ...field })
	}
	return { fields }
}

/**
 * Drops from `target` the has-many entries that `collected` replaces. `<HasMany>` gives
 * each filter / orderBy / limit / offset its own alias, so a field the collected children
 * read under parameters `target` has not seen yet is a replacement: the cached
 * parameterised aliases of that field that the children no longer read go, and a search
 * or a page held in parent state swaps its subquery instead of piling up every earlier
 * one. Without such a new alias nothing is dropped, so a hidden filtered list survives
 * growth elsewhere. Recurses into relations both sides read.
 */
function dropReplacedHasManyAliases(target: SelectionMeta, collected: SelectionMeta): void {
	const replacedFieldNames = new Set<string>()
	for (const [key, field] of collected.fields) {
		if (field.isArray && field.hasManyParams && key !== field.fieldName && !target.fields.has(key)) {
			replacedFieldNames.add(field.fieldName)
		}
	}
	for (const [key, field] of target.fields) {
		const collectedField = collected.fields.get(key)
		if (collectedField) {
			if (field.nested && collectedField.nested) {
				dropReplacedHasManyAliases(field.nested, collectedField.nested)
			}
			continue
		}
		if (field.isArray && key !== field.fieldName && replacedFieldNames.has(field.fieldName)) {
			target.fields.delete(key)
		}
	}
}

/**
 * Whether every field `selection` requests is already requested by `covering`,
 * recursively, with the same relation kind and has-many parameters.
 */
function isSelectionCovered(selection: SelectionMeta, covering: SelectionMeta): boolean {
	for (const [key, field] of selection.fields) {
		const existing = covering.fields.get(key)
		if (!existing || existing.fieldName !== field.fieldName) {
			return false
		}
		if ((field.isRelation && !existing.isRelation) || (field.isArray && !existing.isArray)) {
			return false
		}
		if (field.hasManyParams && JSON.stringify(field.hasManyParams) !== JSON.stringify(existing.hasManyParams)) {
			return false
		}
		if (field.nested && !(existing.nested && isSelectionCovered(field.nested, existing.nested))) {
			return false
		}
	}
	return true
}

/**
 * Hook for collecting field selection from JSX children.
 * Implements the two-phase rendering approach:
 * 1. Creates a collector proxy
 * 2. Calls the collect function with the proxy to gather field accesses
 * 3. Analyzes returned JSX for component-level selections
 * 4. Merges both sources of selection
 *
 * Selection is collected once per `depsKey` and `source` and, unless `grow` is off,
 * only grows for one entity type, `depsKey` and schema registry; a has-many read under
 * new parameters replaces its earlier subquery. Re-renders driven by this entity's own
 * store subscription keep the same `source`, so they do not re-run the collection. An
 * <Entity> nested in another entity's children gets a new inline `children` whenever the
 * outer one re-renders — on every store change it subscribes to — and collects again each
 * time; the result stays cached, so there is no refetch, only the walk.
 *
 * A compiled selection (`useRootSelection`) does not grow: it is replaced on a branch
 * switch and can shrink.
 *
 * **Limitation:** Fields accessed conditionally in the collect function are only
 * captured if they are accessed when the collection runs.
 *
 * @internal This hook is for internal use only.
 */
export function useSelectionCollection(
	options: UseSelectionCollectionOptions,
): SelectionCollectionResult {
	const { entityType, depsKey, collect, source, grow = true, queryKeyExtra } = options
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
		let jsxAnalysed = true
		try {
			jsxSel = collectSelection(jsx)
		} catch {
			// staticRender of nested components may crash during collection
			jsxSel = { fields: new Map() }
			jsxAnalysed = false
		}

		// Convert scope to SelectionMeta and merge with JSX selection
		const collected = scope.toSelectionMeta()
		mergeSelections(collected, jsxSel)

		// Grow, never shrink, for one entity type and depsKey: children that stop reading a
		// field (a hidden section, a switched branch) must not trigger a refetch, and coming
		// back to them must find the field still fetched. A has-many read under new
		// parameters replaces its earlier subquery rather than adding to it.
		const cache = selectionCacheRef.current
		const growsCache = grow
			&& cache !== null
			&& cache.entityType === entityType
			&& cache.depsKey === depsKey
			&& cache.schemaRegistry === schemaRegistry
		if (growsCache && isSelectionCovered(collected, cache.selection)) {
			return cache
		}
		// The collected selection can share nested objects with component selections
		// and the cached one with useEntity, so the union is built in a fresh copy.
		const selection = growsCache ? cloneSelection(cache.selection) : collected
		if (growsCache) {
			// A failed JSX analysis misses the aliased has-manys the children render, so
			// nothing cached may be treated as replaced.
			if (jsxAnalysed) {
				dropReplacedHasManyAliases(selection, collected)
			}
			mergeSelections(selection, collected)
		}

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
		if (cache && cache.queryKey === newQueryKey) {
			if (cache.entityType === entityType && cache.depsKey === depsKey && cache.schemaRegistry === schemaRegistry) {
				return cache
			}
			// Same query under another entity, depsKey or registry: keep the selection and
			// record what it belongs to now, in a new object so the previous result stays intact.
			const rekeyed: SelectionCache = { ...cache, entityType, depsKey, schemaRegistry }
			selectionCacheRef.current = rekeyed
			return rekeyed
		}

		// Update cache with new values
		const newCache: SelectionCache = {
			selection,
			queryKey: newQueryKey,
			entityType,
			depsKey,
			schemaRegistry,
		}
		selectionCacheRef.current = newCache

		return newCache
	}, [entityType, depsKey, source, grow, schemaRegistry])

	return result
}
