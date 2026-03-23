import { useRef, useEffect, useMemo, useCallback } from 'react'
import type { EntityDef, EntityAccessor, SelectionInput, SelectionMeta, FieldError, SchemaRegistry, CommonEntity, EntityForRoles, RoleNames } from '@contember/bindx'
import { EntityHandle, isTempId, resolveSelectionMeta, buildQueryFromSelection, setEntityData, createLoadError } from '@contember/bindx'
import { useBindxContext, useSchemaRegistry } from './BackendAdapterContext.js'
import { useStoreSubscription } from './useStoreSubscription.js'

// ============================================================================
// Options
// ============================================================================

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
	/**
	 * Pre-resolved selection metadata.
	 * When provided, definer (3rd argument) is not needed.
	 * Used internally by EntityList, DataGrid, and DataView components.
	 */
	selection?: SelectionMeta
	/** Optional query key for cache invalidation */
	queryKey?: string
}

// ============================================================================
// Result types
// ============================================================================

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
	readonly error: FieldError
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

// ============================================================================
// Internal helpers
// ============================================================================

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

function createErrorListAccessor(error: FieldError): ErrorEntityListAccessor {
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

// ============================================================================
// Hook overloads
// ============================================================================

/**
 * Hook to fetch and manage a list of entities with role-expanded type inference.
 *
 * @example
 * ```tsx
 * const authors = useEntityList(schema.Author, { roles: ['admin'] }, e => e.name().internalNotes())
 * ```
 */
export function useEntityList<
	TRoleMap extends Record<string, object>,
	TRoles extends RoleNames<TRoleMap>,
	TResult extends object,
>(
	entity: EntityDef<TRoleMap>,
	options: UseEntityListOptions & { roles: readonly TRoles[] },
	definer: SelectionInput<EntityForRoles<TRoleMap, TRoles>, TResult>,
): EntityListAccessorResult<TResult>

/**
 * Hook to fetch and manage a list of entities with full type inference.
 * Uses the common (narrowest) entity type when no roles are specified.
 *
 * @example
 * ```tsx
 * const authors = useEntityList(schema.Author, {}, e => e.name().email())
 * if (authors.status !== 'ready') return <Loading />
 * return authors.items.map(a => <div key={a.id}>{a.name.value}</div>)
 * ```
 */
export function useEntityList<TRoleMap extends Record<string, object>, TResult extends object>(
	entity: EntityDef<TRoleMap>,
	options: UseEntityListOptions,
	definer: SelectionInput<CommonEntity<TRoleMap>, TResult>,
): EntityListAccessorResult<TResult>

/**
 * Hook to fetch and manage a list of entities with pre-resolved selection.
 *
 * Used internally by EntityList, DataGrid, and DataView components
 * that collect selection from JSX before calling this hook.
 */
export function useEntityList(
	entity: EntityDef,
	options: UseEntityListOptions & { selection: SelectionMeta },
): EntityListAccessorResult<object>

// ============================================================================
// Implementation
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useEntityList(
	entity: EntityDef<any>,
	options: UseEntityListOptions,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	definer?: SelectionInput<any, any>,
): EntityListAccessorResult<any> {
	const schemaRegistry = useSchemaRegistry()
	const entityType = entity.$name
	const { store, dispatcher, batcher } = useBindxContext()

	// --- Selection resolution ---
	// resolveSelectionMeta is a pure function; useRef is called unconditionally.
	const resolvedMeta = definer ? resolveSelectionMeta(definer) : null
	const definerQueryKey = resolvedMeta ? JSON.stringify(buildQueryFromSelection(resolvedMeta)) : null
	const selectionRef = useRef<{ meta: SelectionMeta; queryKey: string } | null>(null)

	if (definerQueryKey && resolvedMeta) {
		if (!selectionRef.current || selectionRef.current.queryKey !== definerQueryKey) {
			selectionRef.current = { meta: resolvedMeta, queryKey: definerQueryKey }
		}
	}

	const selectionMeta = definer ? selectionRef.current!.meta : options.selection!

	// --- Stable options key ---
	const optionsKey = useMemo(
		() => JSON.stringify({
			filter: options.filter ?? {},
			orderBy: options.orderBy ?? [],
			limit: options.limit,
			offset: options.offset,
		}),
		[options.filter, options.orderBy, options.limit, options.offset],
	)

	// --- Effective query key for cache invalidation ---
	const effectiveQueryKey = useMemo(() => {
		if (options.queryKey) return options.queryKey
		const query = buildQueryFromSelection(selectionMeta)
		return JSON.stringify({ entityType, query })
	}, [options.queryKey, selectionMeta, entityType])

	// --- List state tracking ---
	const listStateRef = useRef<{
		status: 'loading' | 'error' | 'ready'
		items: Array<{ id: string; data: object }>
		error?: FieldError
	}>({
		status: 'loading',
		items: [],
	})

	const versionRef = useRef(0)

	const listCacheRef = useRef<{
		version: number
		storeVersion: number
		status: string
		result: EntityListAccessorResult<object>
	} | null>(null)

	// --- Store subscription ---
	const subscribe = useCallback(
		(onStoreChange: () => void) => {
			return store.subscribe(onStoreChange)
		},
		[store],
	)

	// --- Mutation methods ---
	const addItem = useCallback(
		(data?: Partial<object>): string => {
			const tempId = store.createEntity(entityType, data as Record<string, unknown>)
			const newItem = {
				id: tempId,
				data: { id: tempId, ...data } as object,
			}
			listStateRef.current.items = [...listStateRef.current.items, newItem]
			versionRef.current++
			store.notify()
			return tempId
		},
		[entityType, store],
	)

	const removeItem = useCallback(
		(key: string): void => {
			const isNewEntity = isTempId(key) && !store.existsOnServer(entityType, key)
			if (isNewEntity) {
				store.removeEntity(entityType, key)
			} else {
				store.scheduleForDeletion(entityType, key)
			}
			listStateRef.current.items = listStateRef.current.items.filter(item => item.id !== key)
			versionRef.current++
			store.notify()
		},
		[entityType, store],
	)

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

	// --- Snapshot ---
	const getSnapshot = useCallback((): EntityListAccessorResult<object> => {
		const state = listStateRef.current
		const version = versionRef.current
		const storeVersion = store.getVersion()

		const cache = listCacheRef.current
		if (cache && cache.version === version && cache.storeVersion === storeVersion && cache.status === state.status) {
			return cache.result
		}

		let result: EntityListAccessorResult<object>

		if (state.status === 'loading') {
			result = createLoadingListAccessor()
		} else if (state.status === 'error') {
			result = createErrorListAccessor(state.error!)
		} else {
			const items = state.items.map((item) => {
				return EntityHandle.create<object>(
					item.id,
					entityType,
					store,
					dispatcher,
					schemaRegistry as SchemaRegistry<Record<string, object>>,
				) as unknown as EntityAccessor<object>
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

		listCacheRef.current = {
			version,
			storeVersion,
			status: state.status,
			result,
		}

		return result
	}, [entityType, store, dispatcher, schemaRegistry, addItem, removeItem, moveItem])

	const isEqual = useCallback(
		(a: EntityListAccessorResult<object>, b: EntityListAccessorResult<object>): boolean => {
			return a === b
		},
		[],
	)

	const accessor = useStoreSubscription({
		subscribe,
		getSnapshot,
		isEqual,
	})

	// --- Data loading ---
	useEffect(() => {
		const abortController = new AbortController()

		listStateRef.current = { status: 'loading', items: [] }
		versionRef.current++

		const fetchData = async (): Promise<void> => {
			try {
				const spec = buildQueryFromSelection(selectionMeta)
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

				const items = result.data.map((data: Record<string, unknown>) => {
					const id = data['id'] as string
					dispatcher.dispatch(
						setEntityData(entityType, id, data, true),
					)
					return { id, data: data as object }
				})

				listStateRef.current = { status: 'ready', items }
				versionRef.current++
				store.notify()
			} catch (error) {
				if (abortController.signal.aborted) return

				const normalizedError = error instanceof Error ? error : new Error(String(error))
				listStateRef.current = {
					status: 'error',
					items: [],
					error: createLoadError(normalizedError),
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

	return accessor
}
