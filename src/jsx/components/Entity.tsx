import React, { useState, useEffect, useMemo, useCallback, useSyncExternalStore, memo, type ReactElement } from 'react'
import { useBindxContext } from '../../hooks/BackendAdapterContext.js'
import { createCollectorProxy, createRuntimeAccessor } from '../proxy.js'
import { collectSelection, debugSelection } from '../analyzer.js'
import { SelectionMetaCollector, mergeSelections, toSelectionMeta } from '../SelectionMeta.js'
import type { EntityRef, JsxSelectionMeta } from '../types.js'
import type { SelectionMeta } from '../../selection/types.js'
import { buildQueryFromSelection } from '../../selection/buildQuery.js'
import { setEntityData, setLoadState } from '../../core/actions.js'

/**
 * Props for Entity component
 */
export interface EntityProps<TSchema, K extends keyof TSchema> {
	/** Entity type name */
	name: K
	/** Entity ID to fetch */
	id: string
	/** Render function receiving typed entity accessor */
	children: (entity: EntityRef<TSchema[K]>) => React.ReactNode
	/** Loading fallback */
	loading?: React.ReactNode
	/** Error fallback */
	error?: (error: Error) => React.ReactNode
	/** Not found fallback */
	notFound?: React.ReactNode
}

/**
 * State phases for Entity component
 */
type EntityPhase =
	| { phase: 'collecting' }
	| { phase: 'loading'; selection: JsxSelectionMeta }
	| { phase: 'ready'; selection: JsxSelectionMeta }
	| { phase: 'error'; error: Error }
	| { phase: 'not_found' }

/**
 * Entity component - orchestrates the two-pass rendering approach.
 *
 * Phase 1 (Collection): Renders children with collector proxy to determine which fields are needed
 * Phase 2 (Loading): Fetches data based on collected selection
 * Phase 3 (Runtime): Renders children with real data accessors
 *
 * @example
 * ```tsx
 * <Entity name="Author" id="author-1">
 *   {author => (
 *     <>
 *       <Field field={author.fields.name} />
 *       <HasMany field={author.fields.articles}>
 *         {article => <Field field={article.fields.title} />}
 *       </HasMany>
 *     </>
 *   )}
 * </Entity>
 * ```
 */
function EntityImpl<TSchema, K extends keyof TSchema>({
	name,
	id,
	children,
	loading,
	error: errorFallback,
	notFound,
}: EntityProps<TSchema, K>): ReactElement | null {
	const { store, dispatcher, adapter } = useBindxContext()
	const entityType = name as string

	// Stable children ref - we use a ref to avoid re-running useMemo on every render
	// The children function might be recreated on every render, but if the selection
	// content is the same, we don't need to refetch
	const childrenRef = React.useRef(children)
	childrenRef.current = children

	// Cache for selection to avoid unnecessary refetches
	const selectionCache = React.useRef<{
		jsxSelection: SelectionMetaCollector
		standardSelection: SelectionMeta
		queryKey: string
	} | null>(null)

	// Phase 1: Collection - runs on every render but caches based on content
	const { jsxSelection, standardSelection, queryKey } = useMemo(() => {
		// Create collector proxy
		const selection = new SelectionMetaCollector()
		const collector = createCollectorProxy<TSchema[K]>(selection)

		// Call children with collector to gather field access
		const jsx = childrenRef.current(collector)

		// Analyze the returned JSX for component-level selections
		const jsxSel = collectSelection(jsx)
		mergeSelections(selection, jsxSel)

		// Debug output in development
		if (process.env['NODE_ENV'] === 'development') {
			console.log('[Entity] Collected selection for', name, ':')
			console.log(debugSelection(selection))
		}

		// Convert to standard SelectionMeta for the data loading hook
		const standardSel = toSelectionMeta(selection)

		// Create a stable key from the selection to detect actual changes
		const query = buildQueryFromSelection(standardSel)
		const newQueryKey = JSON.stringify(query)

		// If the selection hasn't actually changed, return cached values
		if (selectionCache.current && selectionCache.current.queryKey === newQueryKey) {
			return selectionCache.current
		}

		// Update cache with new values
		selectionCache.current = {
			jsxSelection: selection,
			standardSelection: standardSel,
			queryKey: newQueryKey,
		}

		return selectionCache.current
	}, [name, id]) // Only depend on entity identity, not children

	// Subscribe to store changes
	const subscribe = useCallback(
		(onStoreChange: () => void) => {
			return store.subscribeToEntity(entityType, id, onStoreChange)
		},
		[store, entityType, id],
	)

	// Cache for getSnapshot to ensure referential stability
	const snapshotCache = React.useRef<{
		snapshot: ReturnType<typeof store.getEntitySnapshot>
		loadState: ReturnType<typeof store.getLoadState>
	} | null>(null)

	// Get current state - must return referentially stable values
	const getSnapshot = useCallback(() => {
		const snapshot = store.getEntitySnapshot(entityType, id)
		const loadState = store.getLoadState(entityType, id)

		// Return cached value if nothing changed
		if (
			snapshotCache.current &&
			snapshotCache.current.snapshot === snapshot &&
			snapshotCache.current.loadState === loadState
		) {
			return snapshotCache.current
		}

		// Update cache and return new value
		snapshotCache.current = { snapshot, loadState }
		return snapshotCache.current
	}, [store, entityType, id])

	const { snapshot, loadState } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

	// Load data on mount or when id changes
	useEffect(() => {
		const abortController = new AbortController()

		// Set loading state
		dispatcher.dispatch(setLoadState(entityType, id, 'loading'))

		// Fetch data
		const fetchData = async () => {
			try {
				const query = buildQueryFromSelection(standardSelection)
				const result = await adapter.fetchOne(
					entityType,
					id,
					query,
					{ signal: abortController.signal },
				)

				if (abortController.signal.aborted) return

				if (result === null) {
					dispatcher.dispatch(setLoadState(entityType, id, 'not_found'))
				} else {
					dispatcher.dispatch(setEntityData(entityType, id, result, true))
					dispatcher.dispatch(setLoadState(entityType, id, 'success'))
				}
			} catch (error) {
				if (abortController.signal.aborted) return

				if (error instanceof Error && error.name === 'AbortError') {
					return
				}

				dispatcher.dispatch(
					setLoadState(
						entityType,
						id,
						'error',
						error instanceof Error ? error : new Error(String(error)),
					),
				)
			}
		}

		fetchData()

		return () => {
			abortController.abort()
		}
	}, [entityType, id, adapter, dispatcher, queryKey]) // Use queryKey for stable comparison

	// Determine current phase
	const phase = useMemo((): EntityPhase => {
		if (!loadState || loadState.status === 'loading') {
			return { phase: 'loading', selection: jsxSelection }
		}
		if (loadState.status === 'error') {
			return { phase: 'error', error: loadState.error! }
		}
		if (loadState.status === 'not_found') {
			return { phase: 'not_found' }
		}
		if (snapshot) {
			return { phase: 'ready', selection: jsxSelection }
		}
		return { phase: 'loading', selection: jsxSelection }
	}, [loadState, snapshot, jsxSelection])

	// Render based on phase
	if (phase.phase === 'collecting' || phase.phase === 'loading') {
		return <>{loading ?? <DefaultLoading />}</>
	}

	if (phase.phase === 'error') {
		if (errorFallback) {
			return <>{errorFallback(phase.error)}</>
		}
		return <DefaultError error={phase.error} />
	}

	if (phase.phase === 'not_found') {
		return <>{notFound ?? <DefaultNotFound entityType={entityType} id={id} />}</>
	}

	// Phase 3: Runtime render with real data
	// Create a notify function for the accessor
	const notifyChange = () => {
		// Changes are automatically handled by useSyncExternalStore
	}

	const accessor = createRuntimeAccessor<TSchema[K]>(
		entityType,
		id,
		store,
		notifyChange,
	)

	return <>{children(accessor)}</>
}

// Note: Using type assertion for generic memo component
export const Entity = memo(EntityImpl) as unknown as typeof EntityImpl

/**
 * Default loading component
 */
function DefaultLoading(): ReactElement {
	return <div className="bindx-loading">Loading...</div>
}

/**
 * Default error component
 */
function DefaultError({ error }: { error: Error }): ReactElement {
	return (
		<div className="bindx-error">
			<strong>Error:</strong> {error.message}
		</div>
	)
}

/**
 * Default not found component
 */
function DefaultNotFound({ entityType, id }: { entityType: string; id: string }): ReactElement {
	return (
		<div className="bindx-not-found">
			{entityType} with id &quot;{id}&quot; not found
		</div>
	)
}
