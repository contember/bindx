import React, { useRef, useEffect, useMemo, useCallback, useSyncExternalStore, memo, type ReactNode } from 'react'
import type { SchemaDefinition } from '../schema/types.js'
import { SchemaRegistry } from '../schema/SchemaRegistry.js'
import { EntityHandle, HasManyListHandle } from '../handles/EntityHandle.js'
import { useBindxContext } from './BackendAdapterContext.js'
import { resolveSelectionMeta, type SelectionInput } from '../core/SelectionResolver.js'
import type { EntitySnapshot } from '../store/snapshots.js'
import { setEntityData, setLoadState } from '../core/actions.js'
import { buildQueryFromSelection, type QuerySpec } from '../selection/buildQuery.js'
import type { SelectionMeta } from '../selection/types.js'
import type { EntityFields } from '../handles/types.js'
import { createCollectorProxy, createRuntimeAccessor } from '../jsx/proxy.js'
import { collectSelection } from '../jsx/analyzer.js'
import { SelectionMetaCollector, mergeSelections, toSelectionMeta } from '../jsx/SelectionMeta.js'
import type { EntityRef } from '../jsx/types.js'

// Re-export EntityFields for backwards compatibility
export type { EntityFields } from '../handles/types.js'

/**
 * Options for useEntity hook
 */
export interface UseEntityOptions {
	/** Entity ID to fetch */
	id: string
	/** If true, use cached data from store if available (default: false) */
	cache?: boolean
}

/**
 * Options for useEntityList hook
 */
export interface UseEntityListOptions {
	/** Optional filter criteria */
	filter?: Record<string, unknown>
}

/**
 * Loading state for entity accessor
 */
export interface LoadingEntityAccessor {
	readonly status: 'loading'
	readonly isLoading: true
	readonly isError: false
	readonly isPersisting: false
	readonly isDirty: false
	readonly id: string
	readonly fields: never
	readonly data: never
	persist(): Promise<void>
	reset(): void
}

/**
 * Error state for entity accessor
 */
export interface ErrorEntityAccessor {
	readonly status: 'error'
	readonly isLoading: false
	readonly isError: true
	readonly error: Error
	readonly isPersisting: false
	readonly isDirty: false
	readonly id: string
	readonly fields: never
	readonly data: never
	persist(): Promise<void>
	reset(): void
}

/**
 * Ready state for entity accessor
 */
export interface ReadyEntityAccessor<T extends object> {
	readonly status: 'ready'
	readonly isLoading: false
	readonly isError: false
	readonly isPersisting: boolean
	readonly isDirty: boolean
	readonly id: string
	readonly fields: EntityFields<T>
	readonly data: T
	persist(): Promise<void>
	reset(): void
}

/**
 * Union of all entity accessor states
 */
export type EntityAccessorResult<T extends object> =
	| LoadingEntityAccessor
	| ErrorEntityAccessor
	| ReadyEntityAccessor<T>

/**
 * Creates a loading accessor placeholder
 */
function createLoadingAccessor(id: string): LoadingEntityAccessor {
	return {
		status: 'loading',
		isLoading: true,
		isError: false,
		isPersisting: false,
		isDirty: false,
		id,
		get fields(): never {
			throw new Error('Cannot access fields while loading')
		},
		get data(): never {
			throw new Error('Cannot access data while loading')
		},
		async persist() {
			// No-op while loading
		},
		reset() {
			// No-op while loading
		},
	}
}

/**
 * Creates an error accessor placeholder
 */
function createErrorAccessor(id: string, error: Error): ErrorEntityAccessor {
	return {
		status: 'error',
		isLoading: false,
		isError: true,
		error,
		isPersisting: false,
		isDirty: false,
		id,
		get fields(): never {
			throw new Error('Cannot access fields after error')
		},
		get data(): never {
			throw new Error('Cannot access data after error')
		},
		async persist() {
			// No-op after error
		},
		reset() {
			// No-op after error
		},
	}
}

/**
 * Creates type-safe bindx hooks for a specific schema.
 *
 * @example
 * ```ts
 * // Define your schema
 * const schema = defineSchema<{
 *   Article: Article
 *   Author: Author
 * }>({
 *   entities: {
 *     Article: {
 *       fields: {
 *         id: scalar(),
 *         title: scalar(),
 *         author: hasOne('Author')
 *       }
 *     },
 *     Author: {
 *       fields: {
 *         id: scalar(),
 *         name: scalar()
 *       }
 *     }
 *   }
 * })
 *
 * // Create typed hooks
 * export const { useEntity, useEntityList } = createBindx(schema)
 *
 * // Usage with fluent builder
 * const article = useEntity('Article', { id }, e =>
 *   e.id().title().content()
 *    .author(a => a.name().email())
 * )
 * ```
 */
export function createBindx<TModels extends { [K in keyof TModels]: object }>(
	schemaDefinition: SchemaDefinition<TModels>,
) {
	const schema = new SchemaRegistry(schemaDefinition)

	/**
	 * Hook to fetch and manage a single entity with full type inference.
	 * Uses useSyncExternalStore for React 18+ compatibility.
	 */
	function useEntity<TEntityName extends keyof TModels & string, TResult extends object>(
		entityType: TEntityName,
		options: UseEntityOptions,
		definer: SelectionInput<TModels[TEntityName], TResult>,
	): EntityAccessorResult<TResult> {
		const { store, dispatcher, adapter, persistence } = useBindxContext()

		// Create stable handle (memoized on id/type)
		const handle = useMemo(
			() => new EntityHandle<TResult>(options.id, entityType, store, dispatcher, schema),
			[options.id, entityType, store, dispatcher],
		)

		// Cache for snapshot to ensure referential stability
		const snapshotCacheRef = useRef<{
			snapshot: EntitySnapshot | undefined
			loadStatus: string | null
			isPersisting: boolean
			result: EntityAccessorResult<TResult>
		} | null>(null)

		// Subscribe function for useSyncExternalStore
		const subscribe = useCallback(
			(onStoreChange: () => void) => {
				return handle.subscribe(onStoreChange)
			},
			[handle],
		)

		// Snapshot function for useSyncExternalStore - must return stable references
		const getSnapshot = useCallback((): EntityAccessorResult<TResult> => {
			const snapshot = handle.getSnapshot()
			const loadState = store.getLoadState(entityType, options.id)
			const isPersisting = store.isPersisting(entityType, options.id)
			const loadStatus = loadState?.status ?? null

			// Check if we can reuse cached result
			const cache = snapshotCacheRef.current
			if (
				cache &&
				cache.snapshot === snapshot &&
				cache.loadStatus === loadStatus &&
				cache.isPersisting === isPersisting
			) {
				return cache.result
			}

			let result: EntityAccessorResult<TResult>

			// Loading state
			if (!snapshot && (!loadState || loadState.status === 'loading')) {
				result = createLoadingAccessor(options.id)
			}
			// Error state
			else if (loadState?.status === 'error') {
				result = createErrorAccessor(options.id, loadState.error!)
			}
			// Not found state (treat as loading for now)
			else if (!snapshot) {
				result = createLoadingAccessor(options.id)
			}
			// Ready state
			else {
				const isDirty = !deepEqual(snapshot.data, snapshot.serverData)

				result = {
					status: 'ready',
					isLoading: false,
					isError: false,
					isPersisting,
					isDirty,
					id: options.id,
					fields: handle.fields as EntityFields<TResult>,
					data: snapshot.data as TResult,
					async persist() {
						await persistence.persist(entityType, options.id)
					},
					reset() {
						handle.reset()
					},
				}
			}

			// Cache the result
			snapshotCacheRef.current = {
				snapshot,
				loadStatus,
				isPersisting,
				result,
			}

			return result
		}, [handle, store, entityType, options.id, persistence])

		// Use useSyncExternalStore for reactive updates
		const accessor = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

		// Resolve selection metadata
		const selectionMeta = useMemo(
			() => resolveSelectionMeta(definer),
			// eslint-disable-next-line react-hooks/exhaustive-deps
			[entityType], // Only recreate if entity type changes
		)

		// Load data on mount or when id changes
		useEffect(() => {
			const abortController = new AbortController()

			// Check cache first
			if (options.cache && store.hasEntity(entityType, options.id)) {
				dispatcher.dispatch(setLoadState(entityType, options.id, 'success'))
				return
			}

			// Set loading state
			dispatcher.dispatch(setLoadState(entityType, options.id, 'loading'))

			// Fetch data
			const fetchData = async () => {
				try {
					const query = convertSelectionToQuery(selectionMeta)
					const result = await adapter.fetchOne(
						entityType,
						options.id,
						query,
						{ signal: abortController.signal },
					)

					if (abortController.signal.aborted) return

					if (result === null) {
						dispatcher.dispatch(setLoadState(entityType, options.id, 'not_found'))
					} else {
						dispatcher.dispatch(
							setEntityData(entityType, options.id, result as Record<string, unknown>, true),
						)
						dispatcher.dispatch(setLoadState(entityType, options.id, 'success'))
					}
				} catch (error) {
					if (abortController.signal.aborted) return

					if (error instanceof Error && error.name === 'AbortError') {
						return
					}

					dispatcher.dispatch(
						setLoadState(
							entityType,
							options.id,
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
		}, [entityType, options.id, options.cache, adapter, store, dispatcher, selectionMeta])

		// Cleanup handle on unmount
		useEffect(() => {
			return () => {
				handle.dispose()
			}
		}, [handle])

		return accessor
	}

	/**
	 * Hook to fetch and manage a list of entities with full type inference.
	 */
	function useEntityList<TEntityName extends keyof TModels & string, TResult extends object>(
		entityType: TEntityName,
		options: UseEntityListOptions,
		definer: SelectionInput<TModels[TEntityName], TResult>,
	): EntityListAccessorResult<TResult> {
		const { store, dispatcher, adapter } = useBindxContext()

		// Generate stable filter key for dependency tracking
		const filterKey = useMemo(
			() => JSON.stringify(options.filter ?? {}),
			[options.filter],
		)

		// Track list state in a ref
		const listStateRef = useRef<{
			status: 'loading' | 'error' | 'ready'
			items: Array<{ id: string; data: TResult }>
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
			result: EntityListAccessorResult<TResult>
		} | null>(null)

		// Subscribe to store changes
		const subscribe = useCallback(
			(onStoreChange: () => void) => {
				return store.subscribe(onStoreChange)
			},
			[store],
		)

		// Get current snapshot - must return stable references
		const getSnapshot = useCallback((): EntityListAccessorResult<TResult> => {
			const state = listStateRef.current
			const version = versionRef.current

			// Check if we can reuse cached result
			const cache = listCacheRef.current
			if (cache && cache.version === version && cache.status === state.status) {
				return cache.result
			}

			let result: EntityListAccessorResult<TResult>

			if (state.status === 'loading') {
				result = createLoadingListAccessor()
			} else if (state.status === 'error') {
				result = createErrorListAccessor(state.error!)
			} else {
				// Build item handles
				const items = state.items.map((item) => {
					const handle = new EntityHandle<TResult>(
						item.id,
						entityType,
						store,
						dispatcher,
						schema,
					)
					return {
						id: item.id,
						key: item.id,
						handle,
						entity: handle, // Legacy alias
						fields: handle.fields as EntityFields<TResult>,
						data: item.data,
					}
				})

				result = {
					status: 'ready',
					isLoading: false,
					isError: false,
					isDirty: false,
					items,
					length: items.length,
					add() {
						// TODO: Implement
					},
					remove() {
						// TODO: Implement
					},
					move() {
						// TODO: Implement
					},
				}
			}

			// Cache the result
			listCacheRef.current = {
				version,
				status: state.status,
				result,
			}

			return result
		}, [entityType, store, dispatcher])

		// Use useSyncExternalStore
		const accessor = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

		// Resolve selection
		const selectionMeta = useMemo(
			() => resolveSelectionMeta(definer),
			// eslint-disable-next-line react-hooks/exhaustive-deps
			[entityType],
		)

		// Load data
		useEffect(() => {
			const abortController = new AbortController()

			listStateRef.current = { status: 'loading', items: [] }
			versionRef.current++

			const fetchData = async () => {
				try {
					if (!adapter.fetchMany) {
						throw new Error('Adapter does not support fetchMany')
					}

					const query = convertSelectionToQuery(selectionMeta)
					const results = await adapter.fetchMany(
						entityType,
						query,
						options.filter,
						{ signal: abortController.signal },
					)

					if (abortController.signal.aborted) return

					// Store each entity in the SnapshotStore
					const items = results.map((result) => {
						const id = result['id'] as string
						dispatcher.dispatch(
							setEntityData(entityType, id, result, true),
						)
						return { id, data: result as TResult }
					})

					listStateRef.current = { status: 'ready', items }
					versionRef.current++
				} catch (error) {
					if (abortController.signal.aborted) return

					listStateRef.current = {
						status: 'error',
						items: [],
						error: error instanceof Error ? error : new Error(String(error)),
					}
					versionRef.current++
				}
			}

			fetchData()

			return () => {
				abortController.abort()
			}
		}, [entityType, filterKey, adapter, dispatcher, selectionMeta, options.filter])

		return accessor
	}

	/**
	 * Props for the typed Entity component
	 */
	type TypedEntityProps<TEntityName extends keyof TModels & string> = {
		/** Entity type name */
		name: TEntityName
		/** Entity ID to fetch */
		id: string
		/** Render function receiving typed entity accessor */
		children: (entity: EntityRef<TModels[TEntityName]>) => ReactNode
		/** Loading fallback */
		loading?: ReactNode
		/** Error fallback */
		error?: (error: Error) => ReactNode
		/** Not found fallback */
		notFound?: ReactNode
	}

	/**
	 * Typed Entity component for JSX-based rendering.
	 * Provides the same two-phase rendering as the base Entity component,
	 * but with full type inference from the schema.
	 */
	function TypedEntityImpl<TEntityName extends keyof TModels & string>({
		name,
		id,
		children,
		loading,
		error: errorFallback,
		notFound,
	}: TypedEntityProps<TEntityName>) {
		const { store, dispatcher, adapter } = useBindxContext()
		const entityType = name as string

		// Phase 1: Collection - runs synchronously on first render
		const { jsxSelection, standardSelection } = useMemo(() => {
			const selection = new SelectionMetaCollector()
			const collector = createCollectorProxy<TModels[TEntityName]>(selection)
			const jsx = children(collector)
			const jsxSel = collectSelection(jsx)
			mergeSelections(selection, jsxSel)
			return {
				jsxSelection: selection,
				standardSelection: toSelectionMeta(selection),
			}
		}, [name, id, children])

		// Subscribe to store changes
		const subscribe = useCallback(
			(onStoreChange: () => void) => {
				return store.subscribeToEntity(entityType, id, onStoreChange)
			},
			[store, entityType, id],
		)

		// Get current state
		const getSnapshot = useCallback(() => {
			const snapshot = store.getEntitySnapshot(entityType, id)
			const loadState = store.getLoadState(entityType, id)
			return { snapshot, loadState }
		}, [store, entityType, id])

		const { snapshot, loadState } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

		// Load data on mount or when id changes
		useEffect(() => {
			const abortController = new AbortController()
			dispatcher.dispatch(setLoadState(entityType, id, 'loading'))

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
					if (error instanceof Error && error.name === 'AbortError') return

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
		}, [entityType, id, adapter, dispatcher, standardSelection])

		// Determine current phase and render
		if (!loadState || loadState.status === 'loading') {
			return React.createElement(React.Fragment, null,
				loading ?? React.createElement('div', { className: 'bindx-loading' }, 'Loading...'),
			)
		}

		if (loadState.status === 'error') {
			if (errorFallback) {
				return React.createElement(React.Fragment, null, errorFallback(loadState.error!))
			}
			return React.createElement('div', { className: 'bindx-error' },
				React.createElement('strong', null, 'Error:'),
				' ',
				loadState.error?.message,
			)
		}

		if (loadState.status === 'not_found') {
			return React.createElement(React.Fragment, null,
				notFound ?? React.createElement('div', { className: 'bindx-not-found' },
					`${entityType} with id "${id}" not found`,
				),
			)
		}

		// Runtime render with real data
		const accessor = createRuntimeAccessor<TModels[TEntityName]>(
			entityType,
			id,
			store,
			() => {},
		)

		return React.createElement(React.Fragment, null, children(accessor))
	}

	// Memoize the component
	const Entity = memo(TypedEntityImpl) as typeof TypedEntityImpl

	return {
		useEntity,
		useEntityList,
		Entity,
		schema,
	}
}

// ==================== List Accessor Types ====================

export interface LoadingEntityListAccessor {
	readonly status: 'loading'
	readonly isLoading: true
	readonly isError: false
	readonly isDirty: false
	readonly items: never
	readonly length: 0
	add(data: unknown): void
	remove(key: string): void
	move(fromIndex: number, toIndex: number): void
}

export interface ErrorEntityListAccessor {
	readonly status: 'error'
	readonly isLoading: false
	readonly isError: true
	readonly error: Error
	readonly isDirty: false
	readonly items: never
	readonly length: 0
	add(data: unknown): void
	remove(key: string): void
	move(fromIndex: number, toIndex: number): void
}

export interface ReadyEntityListAccessor<T extends object> {
	readonly status: 'ready'
	readonly isLoading: false
	readonly isError: false
	readonly isDirty: boolean
	readonly items: Array<{
		id: string
		key: string
		handle: EntityHandle<T>
		/** @deprecated Use handle instead */
		entity: EntityHandle<T>
		fields: EntityFields<T>
		data: T
	}>
	readonly length: number
	add(data: Partial<T>): void
	remove(key: string): void
	move(fromIndex: number, toIndex: number): void
}

export type EntityListAccessorResult<T extends object> =
	| LoadingEntityListAccessor
	| ErrorEntityListAccessor
	| ReadyEntityListAccessor<T>

function createLoadingListAccessor(): LoadingEntityListAccessor {
	return {
		status: 'loading',
		isLoading: true,
		isError: false,
		isDirty: false,
		get items(): never {
			throw new Error('Cannot access items while loading')
		},
		length: 0,
		add() {},
		remove() {},
		move() {},
	}
}

function createErrorListAccessor(error: Error): ErrorEntityListAccessor {
	return {
		status: 'error',
		isLoading: false,
		isError: true,
		error,
		isDirty: false,
		get items(): never {
			throw new Error('Cannot access items after error')
		},
		length: 0,
		add() {},
		remove() {},
		move() {},
	}
}

// ==================== Helper Functions ====================

function convertSelectionToQuery(selectionMeta: SelectionMeta): QuerySpec {
	return buildQueryFromSelection(selectionMeta)
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true
	if (a === null || b === null) return false
	if (typeof a !== 'object' || typeof b !== 'object') return false

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false
		for (let i = 0; i < a.length; i++) {
			if (!deepEqual(a[i], b[i])) return false
		}
		return true
	}

	if (Array.isArray(a) || Array.isArray(b)) return false

	const keysA = Object.keys(a)
	const keysB = Object.keys(b)

	if (keysA.length !== keysB.length) return false

	for (const key of keysA) {
		if (!keysB.includes(key)) return false
		if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
			return false
		}
	}

	return true
}
