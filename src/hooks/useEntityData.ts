import { useEffect, useMemo, useReducer, useRef, useState, useCallback } from 'react'
import type { SelectionMeta } from '../selection/types.js'
import type { BackendAdapter } from '../adapter/types.js'
import type { IdentityMap } from '../store/IdentityMap.js'
import { EntityLoader, type EntityLoadResult } from '../core/EntityLoader.js'
import { resolveSelectionMeta, buildQuery, type SelectionInput } from '../core/SelectionResolver.js'
import { useBackendAdapter, useIdentityMap } from './BackendAdapterContext.js'

/**
 * State for entity data loading
 */
export type EntityDataState<T> =
	| { status: 'loading' }
	| { status: 'success'; data: T }
	| { status: 'error'; error: Error }
	| { status: 'not_found' }

/**
 * Options for useEntityData hook
 */
export interface UseEntityDataOptions {
	entityType: string
	id: string
	useCache?: boolean
}

/**
 * Result of useEntityData hook
 */
export interface UseEntityDataResult<T> {
	state: EntityDataState<T>
	reload: () => void
	notifyChange: () => void
	selectionMeta: SelectionMeta
	identityMap: IdentityMap
	adapter: BackendAdapter
}

/**
 * Low-level hook for loading entity data.
 * Used by both useEntity and Entity component.
 *
 * Responsibilities:
 * - Resolves selection input to SelectionMeta
 * - Manages loading/error/success state
 * - Handles caching through IdentityMap
 * - Provides reload capability
 * - Subscribes to identity map changes
 */
export function useEntityData<TModel, TResult extends object>(
	options: UseEntityDataOptions,
	selection: SelectionInput<TModel, TResult>,
): UseEntityDataResult<TResult> {
	const adapter = useBackendAdapter()
	const identityMap = useIdentityMap()

	// Force re-render when data changes
	const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

	const notifyChange = useCallback(() => {
		forceUpdate()
	}, [])

	// Resolve selection metadata - memoize to prevent re-creation
	const selectionMeta = useMemo(() => resolveSelectionMeta(selection), [])

	// Create loader instance
	const loaderRef = useRef<EntityLoader | null>(null)
	if (!loaderRef.current) {
		loaderRef.current = new EntityLoader(adapter, identityMap)
	}

	// Loading state
	const [state, setState] = useState<EntityDataState<TResult>>({ status: 'loading' })

	// Load version for reload functionality
	const [loadVersion, setLoadVersion] = useState(0)

	const reload = useCallback(() => {
		setLoadVersion(v => v + 1)
	}, [])

	// Fetch entity
	useEffect(() => {
		let cancelled = false

		setState({ status: 'loading' })

		async function load() {
			const loader = loaderRef.current!
			const query = buildQuery(selection)

			const result = await loader.loadOne<TResult>({
				entityType: options.entityType,
				id: options.id,
				query,
				useCache: options.useCache,
			})

			if (cancelled) return

			switch (result.status) {
				case 'success':
					setState({ status: 'success', data: result.data })
					break
				case 'error':
					setState({ status: 'error', error: result.error })
					break
				case 'not_found':
					setState({ status: 'not_found' })
					break
			}
		}

		load()

		return () => {
			cancelled = true
		}
	}, [options.entityType, options.id, options.useCache, loadVersion])

	// Subscribe to identity map changes
	useEffect(() => {
		if (state.status !== 'success') return

		return identityMap.subscribe(options.entityType, options.id, notifyChange)
	}, [state.status, options.entityType, options.id, identityMap, notifyChange])

	return {
		state,
		reload,
		notifyChange,
		selectionMeta,
		identityMap,
		adapter,
	}
}

/**
 * State for entity list data loading
 */
export type EntityListDataState<T> =
	| { status: 'loading' }
	| { status: 'success'; data: T[] }
	| { status: 'error'; error: Error }

/**
 * Options for useEntityListData hook
 */
export interface UseEntityListDataOptions {
	entityType: string
	filter?: Record<string, unknown>
}

/**
 * Result of useEntityListData hook
 */
export interface UseEntityListDataResult<T> {
	state: EntityListDataState<T>
	reload: () => void
	notifyChange: () => void
	selectionMeta: SelectionMeta
	identityMap: IdentityMap
	adapter: BackendAdapter
}

/**
 * Low-level hook for loading entity list data.
 * Used by useEntityList hook.
 */
export function useEntityListData<TModel, TResult extends object>(
	options: UseEntityListDataOptions,
	selection: SelectionInput<TModel, TResult>,
): UseEntityListDataResult<TResult> {
	const adapter = useBackendAdapter()
	const identityMap = useIdentityMap()

	// Force re-render when data changes
	const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

	const notifyChange = useCallback(() => {
		forceUpdate()
	}, [])

	// Resolve selection metadata
	const selectionMeta = useMemo(() => resolveSelectionMeta(selection), [])

	// Create loader instance
	const loaderRef = useRef<EntityLoader | null>(null)
	if (!loaderRef.current) {
		loaderRef.current = new EntityLoader(adapter, identityMap)
	}

	// Loading state
	const [state, setState] = useState<EntityListDataState<TResult>>({ status: 'loading' })

	// Load version for reload functionality
	const [loadVersion, setLoadVersion] = useState(0)

	const reload = useCallback(() => {
		setLoadVersion(v => v + 1)
	}, [])

	// Stringify filter for dependency tracking
	const filterKey = useMemo(() => JSON.stringify(options.filter ?? {}), [options.filter])

	// Fetch entities
	useEffect(() => {
		let cancelled = false

		setState({ status: 'loading' })

		async function load() {
			const loader = loaderRef.current!
			const query = buildQuery(selection)

			const result = await loader.loadMany<TResult>({
				entityType: options.entityType,
				query,
				filter: options.filter,
			})

			if (cancelled) return

			switch (result.status) {
				case 'success':
					setState({ status: 'success', data: result.data })
					break
				case 'error':
					setState({ status: 'error', error: result.error })
					break
			}
		}

		load()

		return () => {
			cancelled = true
		}
	}, [options.entityType, filterKey, loadVersion])

	return {
		state,
		reload,
		notifyChange,
		selectionMeta,
		identityMap,
		adapter,
	}
}
