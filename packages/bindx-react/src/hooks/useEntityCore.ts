import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useBindxContext } from './BackendAdapterContext.js'
import { useStoreSubscription } from './useStoreSubscription.js'
import { setEntityData, setLoadState } from '@contember/bindx'
import { buildQueryFromSelection } from '@contember/bindx'
import type { SelectionMeta, EntityUniqueWhere } from '@contember/bindx'
import type { EntitySnapshot, LoadStatus } from '@contember/bindx'

/**
 * Options for useEntityCore hook.
 */
export interface UseEntityCoreOptions {
	/** Entity type name */
	entityType: string
	/** Unique field(s) to identify the entity (e.g., { id: '...' } or { slug: '...' }) */
	by: EntityUniqueWhere
	/** Pre-resolved selection metadata */
	selectionMeta: SelectionMeta
	/** Optional query key for cache invalidation (used by JSX pattern) */
	queryKey?: string
	/** Whether to use cached data if available */
	cache?: boolean
}

/**
 * Load state from store
 */
interface LoadState {
	status: LoadStatus
	error?: Error
}

/**
 * Result from useEntityCore hook.
 */
export interface EntityCoreResult {
	/** Current load status */
	status: 'loading' | 'error' | 'not_found' | 'ready'
	/** Error if status is 'error' */
	error?: Error
	/** Entity snapshot when ready */
	snapshot: EntitySnapshot | undefined
	/** Load state from store */
	loadState: LoadState | undefined
	/** Whether entity is being persisted */
	isPersisting: boolean
}

/**
 * Snapshot data for store subscription
 */
interface SubscriptionSnapshot {
	snapshot: EntitySnapshot | undefined
	loadState: LoadState | undefined
	isPersisting: boolean
}

/**
 * Core hook for entity data loading.
 * Handles store subscription, data fetching, and state management.
 *
 * This hook accepts pre-resolved SelectionMeta, allowing it to be used by:
 * - useEntity (which resolves fluent builder to SelectionMeta)
 * - Entity component (which collects JSX selection to SelectionMeta)
 *
 * @internal This hook is for internal use only.
 */
export function useEntityCore(options: UseEntityCoreOptions): EntityCoreResult {
	const { entityType, by, selectionMeta, queryKey, cache } = options
	const { store, dispatcher, batcher } = useBindxContext()

	// Derive ID from 'by' for store operations
	// Use id directly if present, otherwise use the first value from by
	const id = useMemo(() => {
		if ('id' in by && typeof by['id'] === 'string') {
			return by['id']
		}
		const firstValue = Object.values(by)[0]
		return typeof firstValue === 'string' ? firstValue : String(firstValue)
	}, [by])

	// Stable key for the 'by' clause
	const byKey = useMemo(() => JSON.stringify(by), [by])

	// Create stable query key from selection if not provided
	const effectiveQueryKey = useMemo(() => {
		if (queryKey) return queryKey
		const query = buildQueryFromSelection(selectionMeta)
		return JSON.stringify(query)
	}, [queryKey, selectionMeta])

	// Subscribe to store changes
	const subscribe = useCallback(
		(callback: () => void) => {
			return store.subscribeToEntity(entityType, id, callback)
		},
		[store, entityType, id],
	)

	// Get snapshot from store
	const getSnapshot = useCallback((): SubscriptionSnapshot => {
		return {
			snapshot: store.getEntitySnapshot(entityType, id),
			loadState: store.getLoadState(entityType, id),
			isPersisting: store.isPersisting(entityType, id),
		}
	}, [store, entityType, id])

	// Custom equality check for subscription snapshot
	const isEqual = useCallback((a: SubscriptionSnapshot, b: SubscriptionSnapshot): boolean => {
		return (
			a.snapshot === b.snapshot &&
			a.loadState?.status === b.loadState?.status &&
			a.isPersisting === b.isPersisting
		)
	}, [])

	const { snapshot, loadState, isPersisting } = useStoreSubscription({
		subscribe,
		getSnapshot,
		isEqual,
	})

	// Cache ref to track if we've started fetching
	const fetchingRef = useRef<string | null>(null)

	// Load data on mount or when by/selection changes
	useEffect(() => {
		// Check cache first
		if (cache && store.hasEntity(entityType, id)) {
			dispatcher.dispatch(setLoadState(entityType, id, 'success'))
			return
		}

		// Skip if already fetching same data
		const fetchKey = `${entityType}:${byKey}:${effectiveQueryKey}`
		if (fetchingRef.current === fetchKey) {
			return
		}
		fetchingRef.current = fetchKey

		const abortController = new AbortController()

		// Set loading state
		dispatcher.dispatch(setLoadState(entityType, id, 'loading'))

		// Fetch data
		const fetchData = async () => {
			try {
				const spec = buildQueryFromSelection(selectionMeta)
				// Parse byKey to get the by object (avoids stale closure issues)
				const currentBy = JSON.parse(byKey) as Record<string, unknown>
				const result = await batcher.enqueue(
					{ type: 'get', entityType, by: currentBy, spec },
					{ signal: abortController.signal },
				)

				if (abortController.signal.aborted) return

				if (result.type === 'get' && result.data === null) {
					dispatcher.dispatch(setLoadState(entityType, id, 'not_found'))
				} else if (result.type === 'get' && result.data) {
					dispatcher.dispatch(
						setEntityData(entityType, id, result.data, true),
					)
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
			// Clear fetching ref on cleanup
			if (fetchingRef.current === fetchKey) {
				fetchingRef.current = null
			}
		}
	}, [entityType, id, byKey, effectiveQueryKey, cache, batcher, store, dispatcher, selectionMeta])

	// Determine current status
	const result = useMemo((): EntityCoreResult => {
		// Loading state
		if (!loadState || loadState.status === 'loading') {
			return {
				status: 'loading',
				snapshot: undefined,
				loadState,
				isPersisting,
			}
		}

		// Error state
		if (loadState.status === 'error') {
			return {
				status: 'error',
				error: loadState.error,
				snapshot: undefined,
				loadState,
				isPersisting,
			}
		}

		// Not found state
		if (loadState.status === 'not_found') {
			return {
				status: 'not_found',
				snapshot: undefined,
				loadState,
				isPersisting,
			}
		}

		// Ready state (snapshot may still be undefined in edge cases)
		if (snapshot) {
			return {
				status: 'ready',
				snapshot,
				loadState,
				isPersisting,
			}
		}

		// Fallback to loading if no snapshot yet
		return {
			status: 'loading',
			snapshot: undefined,
			loadState,
			isPersisting,
		}
	}, [snapshot, loadState, isPersisting])

	return result
}
