import { useRef, useEffect, useMemo, useCallback } from 'react'
import type { SchemaRegistry, EntityAccessor } from '@contember/bindx'
import { EntityHandle } from '@contember/bindx'
import { useBindxContext } from './BackendAdapterContext.js'
import { useStoreSubscription } from './useStoreSubscription.js'
import { setEntityData, setLoadState } from '@contember/bindx'
import { buildQueryFromSelection } from '@contember/bindx'
import type { SelectionMeta } from '@contember/bindx'

/**
 * Options for useEntityList hook
 */
export interface UseEntityListOptions {
	/** Optional filter criteria */
	filter?: Record<string, unknown>
	/** Optional ordering */
	orderBy?: readonly Record<string, unknown>[]
	/** Optional limit */
	limit?: number
	/** Optional offset */
	offset?: number
}

/**
 * Loading state for entity list accessor
 */
export interface LoadingEntityListAccessor {
	readonly status: 'loading'
	readonly isLoading: true
	readonly isError: false
	readonly isDirty: false
	readonly items: never
	readonly length: 0
	add(data?: unknown): string
	remove(key: string): void
	move(fromIndex: number, toIndex: number): void
}

/**
 * Error state for entity list accessor
 */
export interface ErrorEntityListAccessor {
	readonly status: 'error'
	readonly isLoading: false
	readonly isError: true
	readonly error: Error
	readonly isDirty: false
	readonly items: never
	readonly length: 0
	add(data?: unknown): string
	remove(key: string): void
	move(fromIndex: number, toIndex: number): void
}

/**
 * Ready state for entity list accessor
 */
export interface ReadyEntityListAccessor<T extends object> {
	readonly status: 'ready'
	readonly isLoading: false
	readonly isError: false
	readonly isDirty: boolean
	readonly items: Array<EntityAccessor<T>>
	readonly length: number
	add(data?: Partial<T>): string
	remove(key: string): void
	move(fromIndex: number, toIndex: number): void
}

/**
 * Union of all entity list accessor states
 */
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
		add() {
			throw new Error('Cannot add items while loading')
		},
		remove() {
			throw new Error('Cannot remove items while loading')
		},
		move() {
			throw new Error('Cannot move items while loading')
		},
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
		add() {
			throw new Error('Cannot add items after error')
		},
		remove() {
			throw new Error('Cannot remove items after error')
		},
		move() {
			throw new Error('Cannot move items after error')
		},
	}
}

/**
 * Generic implementation of useEntityList hook.
 * Used by createBindx to create typed versions.
 *
 * @internal
 */
export function useEntityListImpl<TResult extends object>(
	entityType: string,
	options: UseEntityListOptions,
	selectionMeta: SelectionMeta,
	schema: SchemaRegistry<Record<string, object>>,
): EntityListAccessorResult<TResult> {
	const { store, dispatcher, batcher } = useBindxContext()

	// Generate stable options key for dependency tracking
	const optionsKey = useMemo(
		() => JSON.stringify({
			filter: options.filter ?? {},
			orderBy: options.orderBy ?? [],
			limit: options.limit,
			offset: options.offset,
		}),
		[options.filter, options.orderBy, options.limit, options.offset],
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

	// Add a new entity to the list
	const addItem = useCallback(
		(data?: Partial<TResult>): string => {
			// Create entity with temp ID in the store
			const tempId = store.createEntity(entityType, data as Record<string, unknown>)

			// Add to the local list state
			const newItem = {
				id: tempId,
				data: { id: tempId, ...data } as TResult,
			}
			listStateRef.current.items = [...listStateRef.current.items, newItem]
			versionRef.current++
			store.notify()

			return tempId
		},
		[entityType, store],
	)

	// Remove an entity from the list
	const removeItem = useCallback(
		(key: string): void => {
			// Check if this is a newly created entity (temp ID, not on server)
			const isNewEntity = key.startsWith('__temp_') && !store.existsOnServer(entityType, key)

			if (isNewEntity) {
				// For newly created entities, remove from store entirely
				store.removeEntity(entityType, key)
			} else {
				// For existing server entities, schedule for deletion
				store.scheduleForDeletion(entityType, key)
			}

			// Remove from the local list state
			listStateRef.current.items = listStateRef.current.items.filter(item => item.id !== key)
			versionRef.current++
			store.notify()
		},
		[entityType, store],
	)

	// Move an entity within the list
	const moveItem = useCallback(
		(fromIndex: number, toIndex: number): void => {
			const items = [...listStateRef.current.items]
			if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
				return
			}
			const [removed] = items.splice(fromIndex, 1)
			if (removed) {
				items.splice(toIndex, 0, removed)
				listStateRef.current.items = items
				versionRef.current++
				store.notify()
			}
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
				return EntityHandle.create<TResult>(
					item.id,
					entityType,
					store,
					dispatcher,
					schema,
				) as unknown as EntityAccessor<TResult>
			})

			result = {
				status: 'ready',
				isLoading: false,
				isError: false,
				isDirty: false,
				items,
				length: items.length,
				add: addItem,
				remove: removeItem,
				move: moveItem,
			}
		}

		// Cache the result
		listCacheRef.current = {
			version,
			status: state.status,
			result,
		}

		return result
	}, [entityType, store, dispatcher, schema, addItem, removeItem, moveItem])

	// Custom equality - always false since getSnapshot returns cached values
	const isEqual = useCallback(
		(a: EntityListAccessorResult<TResult>, b: EntityListAccessorResult<TResult>): boolean => {
			return a === b
		},
		[],
	)

	// Use store subscription
	const accessor = useStoreSubscription({
		subscribe,
		getSnapshot,
		isEqual,
	})

	// Load data
	useEffect(() => {
		const abortController = new AbortController()

		listStateRef.current = { status: 'loading', items: [] }
		versionRef.current++

		const fetchData = async () => {
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
				const items = result.data.map((data: Record<string, unknown>) => {
					const id = data['id'] as string
					dispatcher.dispatch(
						setEntityData(entityType, id, data, true),
					)
					return { id, data: data as TResult }
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
	}, [entityType, optionsKey, batcher, dispatcher, selectionMeta])

	return accessor
}
