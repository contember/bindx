import { useRef, useEffect, useMemo, useCallback } from 'react'
import { useBindxContext } from './BackendAdapterContext.js'
import { useStoreSubscription } from './useStoreSubscription.js'
import { setEntityData } from '@contember/bindx'
import { buildQueryFromSelection } from '@contember/bindx'
import type { SelectionMeta } from '@contember/bindx'

/**
 * Options for useEntityListCore hook.
 */
export interface UseEntityListCoreOptions {
	/** Entity type name */
	entityType: string
	/** Optional filter criteria */
	filter?: Record<string, unknown>
	/** Optional ordering */
	orderBy?: readonly Record<string, unknown>[]
	/** Optional limit */
	limit?: number
	/** Optional offset */
	offset?: number
	/** Pre-resolved selection metadata */
	selectionMeta: SelectionMeta
	/** Optional query key for cache invalidation */
	queryKey?: string
}

/**
 * Item in the entity list result
 */
export interface EntityListCoreItem {
	id: string
	data: Record<string, unknown>
}

/**
 * Result from useEntityListCore hook.
 */
export interface EntityListCoreResult {
	/** Current load status */
	status: 'loading' | 'error' | 'ready'
	/** Error if status is 'error' */
	error?: Error
	/** List items when ready */
	items: EntityListCoreItem[]
}

/**
 * Snapshot data for store subscription
 */
interface ListSubscriptionSnapshot {
	status: 'loading' | 'error' | 'ready'
	items: EntityListCoreItem[]
	error?: Error
}

/**
 * Core hook for entity list data loading.
 * Handles store subscription, data fetching, and state management.
 *
 * This hook accepts pre-resolved SelectionMeta, allowing it to be used by:
 * - EntityList component (which collects JSX selection to SelectionMeta)
 *
 * @internal This hook is for internal use only.
 */
export function useEntityListCore(options: UseEntityListCoreOptions): EntityListCoreResult {
	const { entityType, filter, orderBy, limit, offset, selectionMeta, queryKey } = options
	const { store, dispatcher, batcher } = useBindxContext()

	// Generate stable options key for dependency tracking
	const optionsKey = useMemo(
		() => JSON.stringify({
			filter: filter ?? {},
			orderBy: orderBy ?? [],
			limit,
			offset,
		}),
		[filter, orderBy, limit, offset],
	)

	// Create stable query key from selection if not provided
	const effectiveQueryKey = useMemo(() => {
		if (queryKey) return queryKey
		const query = buildQueryFromSelection(selectionMeta)
		return JSON.stringify({ query, filter, orderBy, limit, offset })
	}, [queryKey, selectionMeta, filter, orderBy, limit, offset])

	// Track list state in a ref
	const listStateRef = useRef<{
		status: 'loading' | 'error' | 'ready'
		items: EntityListCoreItem[]
		error?: Error
	}>({
		status: 'loading',
		items: [],
	})

	// Version for change detection
	const versionRef = useRef(0)

	// Cache for snapshot to ensure referential stability
	const listCacheRef = useRef<{
		version: number
		status: string
		result: EntityListCoreResult
	} | null>(null)

	// Subscribe to store changes
	const subscribe = useCallback(
		(onStoreChange: () => void) => {
			return store.subscribe(onStoreChange)
		},
		[store],
	)

	// Get current snapshot
	const getSnapshot = useCallback((): ListSubscriptionSnapshot => {
		const state = listStateRef.current
		const version = versionRef.current

		// Check if we can reuse cached result
		const cache = listCacheRef.current
		if (cache && cache.version === version && cache.status === state.status) {
			return cache.result
		}

		const result: ListSubscriptionSnapshot = {
			status: state.status,
			items: state.items,
			error: state.error,
		}

		// Cache the result
		listCacheRef.current = {
			version,
			status: state.status,
			result,
		}

		return result
	}, [])

	// Custom equality - reference equality since we cache
	const isEqual = useCallback(
		(a: ListSubscriptionSnapshot, b: ListSubscriptionSnapshot): boolean => {
			return a === b
		},
		[],
	)

	// Use store subscription
	const snapshot = useStoreSubscription({
		subscribe,
		getSnapshot,
		isEqual,
	})

	// Load data
	useEffect(() => {
		const abortController = new AbortController()

		listStateRef.current = { status: 'loading', items: [] }
		versionRef.current++

		const fetchData = async (): Promise<void> => {
			try {
				const spec = buildQueryFromSelection(selectionMeta)
				// Parse optionsKey to get the actual options (avoids stale closure issues)
				const currentOptions = JSON.parse(optionsKey) as {
					filter: Record<string, unknown>
					orderBy: readonly Record<string, unknown>[]
					limit?: number
					offset?: number
				}
				const result = await batcher.enqueue(
					{
						type: 'list',
						entityType,
						filter: currentOptions.filter,
						orderBy: currentOptions.orderBy,
						limit: currentOptions.limit,
						offset: currentOptions.offset,
						spec,
					},
					{ signal: abortController.signal },
				)

				if (abortController.signal.aborted) return

				if (result.type !== 'list') {
					throw new Error('Unexpected query result type')
				}

				// Store each entity in the SnapshotStore
				const items = result.data.map((data) => {
					const id = data['id'] as string
					dispatcher.dispatch(
						setEntityData(entityType, id, data as Record<string, unknown>, true),
					)
					return { id, data: data as Record<string, unknown> }
				})

				listStateRef.current = { status: 'ready', items }
				versionRef.current++
				store.notify()
			} catch (error) {
				if (abortController.signal.aborted) return

				listStateRef.current = {
					status: 'error',
					items: [],
					error: error instanceof Error ? error : new Error(String(error)),
				}
				versionRef.current++
				store.notify()
			}
		}

		fetchData()

		return () => {
			abortController.abort()
		}
	}, [entityType, optionsKey, effectiveQueryKey, batcher, dispatcher, store, selectionMeta])

	return snapshot
}
