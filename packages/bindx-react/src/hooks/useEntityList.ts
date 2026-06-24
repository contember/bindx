import { useRef, useEffect, useMemo, useCallback } from 'react'
import type { EntityDef, EntityAccessor, SelectionInput, SelectionMeta, FieldError, SchemaRegistry, CommonEntity, EntityForRoles, RoleNames } from '@contember/bindx'
import { EntityHandle, isTempId, resolveSelectionMeta, buildQueryFromSelection, refreshServerData, createLoadError } from '@contember/bindx'
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

interface EntityListResultBase {
	$add(data?: unknown): string
	$remove(key: string): void
	$move(fromIndex: number, toIndex: number): void
}

export type LoadingEntityListResult = EntityListResultBase & {
	readonly $status: 'loading'
	readonly $isLoading: true
	readonly $isRefetching: false
	readonly $isError: false
	readonly $error: null
}

export type ErrorEntityListResult = EntityListResultBase & {
	readonly $status: 'error'
	readonly $isLoading: false
	readonly $isRefetching: false
	readonly $isError: true
	readonly $error: FieldError
}

/**
 * `$isRefetching` is `true` while a background re-fetch is in flight
 * (triggered by a `queryKey` change while ready data is already present).
 * The accessor identity stays stable so the subtree does not unmount —
 * stale-while-revalidate semantics.
 */
export type ReadyEntityListResult<T extends object> = EntityListResultBase & {
	readonly $status: 'ready'
	readonly $isLoading: false
	readonly $isRefetching: boolean
	readonly $isError: false
	readonly $error: null
	readonly $isDirty: boolean
	readonly items: Array<EntityAccessor<T>>
	readonly length: number
}

export type UseEntityListResult<T extends object> =
	| LoadingEntityListResult
	| ErrorEntityListResult
	| ReadyEntityListResult<T>

// ============================================================================
// Internal helpers
// ============================================================================

function createLoadingListResult(): LoadingEntityListResult {
	return {
		$status: 'loading',
		$isLoading: true,
		$isRefetching: false,
		$isError: false,
		$error: null,
		$add() { throw new Error('Cannot add items while loading') },
		$remove() { throw new Error('Cannot remove items while loading') },
		$move() { throw new Error('Cannot move items while loading') },
	}
}

function createErrorListResult(error: FieldError): ErrorEntityListResult {
	return {
		$status: 'error',
		$isLoading: false,
		$isRefetching: false,
		$isError: true,
		$error: error,
		$add() { throw new Error('Cannot add items after error') },
		$remove() { throw new Error('Cannot remove items after error') },
		$move() { throw new Error('Cannot move items after error') },
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
): UseEntityListResult<TResult>

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
): UseEntityListResult<TResult>

/**
 * Hook to fetch and manage a list of entities with pre-resolved selection.
 *
 * Used internally by EntityList, DataGrid, and DataView components
 * that collect selection from JSX before calling this hook.
 */
export function useEntityList(
	entity: EntityDef,
	options: UseEntityListOptions & { selection: SelectionMeta },
): UseEntityListResult<object>

// ============================================================================
// Implementation
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useEntityList(
	entity: EntityDef<any>,
	options: UseEntityListOptions,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	definer?: SelectionInput<any, any>,
): UseEntityListResult<any> {
	const schemaRegistry = useSchemaRegistry()
	const entityType = entity.$name
	const { store, dispatcher, batcher } = useBindxContext()

	// --- Selection resolution ---
	// Both selection paths (definer 3rd-arg and pre-resolved options.selection)
	// are stabilized identically: the raw meta is resolved every render, but its
	// reference is only swapped when the serialized query content actually
	// changes. This keeps `selectionMeta` identity stable across content-identical
	// renders (e.g. DataGrid rebuilding a new-but-equal selection object), which
	// in turn keeps the data-loading effect from refiring spuriously.
	// resolveSelectionMeta is a pure function; useRef is called unconditionally.
	const rawMeta = definer ? resolveSelectionMeta(definer) : options.selection!
	const selectionContentKey = JSON.stringify(buildQueryFromSelection(rawMeta))
	const selectionRef = useRef<{ meta: SelectionMeta; contentKey: string } | null>(null)

	if (!selectionRef.current || selectionRef.current.contentKey !== selectionContentKey) {
		selectionRef.current = { meta: rawMeta, contentKey: selectionContentKey }
	}

	const selectionMeta = selectionRef.current.meta

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
	// Derived from the stable selectionContentKey so it keeps identity while the
	// query content is unchanged, even if the caller passes a fresh selection object.
	const effectiveQueryKey = useMemo(() => {
		if (options.queryKey) return options.queryKey
		// selectionContentKey is already the serialized query; just namespace it
		// by entity type (avoids double-encoding the JSON string).
		return `${entityType}:${selectionContentKey}`
	}, [options.queryKey, selectionContentKey, entityType])

	// --- List state tracking ---
	const listStateRef = useRef<{
		status: 'loading' | 'error' | 'ready'
		items: Array<{ id: string; data: object }>
		error?: FieldError
		isRefetching: boolean
	}>({
		status: 'loading',
		items: [],
		isRefetching: false,
	})

	const versionRef = useRef(0)

	const listCacheRef = useRef<{
		version: number
		storeVersion: number
		status: string
		isRefetching: boolean
		result: UseEntityListResult<any>
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

	// Discard never-persisted drafts when the list unmounts. List-level creates are
	// top-level roots (nothing else anchors them); dropping the root and running the
	// reachability-aware sweep frees a truly-orphaned draft while preserving one that
	// was meanwhile connected into another live parent (the diamond / shared-create
	// case). A persisted draft (rekeyed to a server id) is left untouched.
	useEffect(() => {
		return () => {
			let unrooted = false
			for (const item of listStateRef.current.items) {
				if (isTempId(item.id) && !store.getPersistedId(entityType, item.id)) {
					store.unregisterRootEntity(entityType, item.id)
					unrooted = true
				}
			}
			if (unrooted) {
				store.sweepUnreachableCreated()
			}
		}
	}, [store, entityType])

	// --- Snapshot ---
	const getSnapshot = useCallback((): UseEntityListResult<any> => {
		const state = listStateRef.current
		const version = versionRef.current
		const storeVersion = store.getVersion()

		const cache = listCacheRef.current
		if (
			cache &&
			cache.version === version &&
			cache.storeVersion === storeVersion &&
			cache.status === state.status &&
			cache.isRefetching === state.isRefetching
		) {
			return cache.result
		}

		let result: UseEntityListResult<any>

		if (state.status === 'loading') {
			result = createLoadingListResult()
		} else if (state.status === 'error') {
			result = createErrorListResult(state.error!)
		} else {
			const items = state.items.map((item) => {
				return EntityHandle.create<object>(
					item.id,
					entityType,
					store,
					dispatcher,
					schemaRegistry as SchemaRegistry<Record<string, object>>,
				) as unknown as EntityAccessor<any>
			})

			result = {
				$status: 'ready',
				$isLoading: false,
				$isRefetching: state.isRefetching,
				$isError: false,
				$error: null,
				$isDirty: false,
				items,
				length: items.length,
				$add: addItem,
				$remove: removeItem,
				$move: moveItem,
			}
		}

		listCacheRef.current = {
			version,
			storeVersion,
			status: state.status,
			isRefetching: state.isRefetching,
			result,
		}

		return result
	}, [entityType, store, dispatcher, schemaRegistry, addItem, removeItem, moveItem])

	const isEqual = useCallback(
		(a: UseEntityListResult<any>, b: UseEntityListResult<any>): boolean => {
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

		// Stale-while-revalidate: if we already have ready items, keep them visible
		// and only flag a background refetch. Otherwise, show explicit loading.
		const prev = listStateRef.current
		if (prev.status === 'ready') {
			listStateRef.current = { ...prev, isRefetching: true }
		} else {
			listStateRef.current = { status: 'loading', items: [], isRefetching: false }
		}
		versionRef.current++
		store.notify()

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
					// Revalidation: advance the server baseline but keep local dirty
					// edits intact (see EntitySnapshotStore.refreshServerData).
					dispatcher.dispatch(
						refreshServerData(entityType, id, data),
					)
					return { id, data: data as object }
				})

				listStateRef.current = { status: 'ready', items, isRefetching: false }
				versionRef.current++
				store.notify()
			} catch (error) {
				if (abortController.signal.aborted) return

				const normalizedError = error instanceof Error ? error : new Error(String(error))
				listStateRef.current = {
					status: 'error',
					items: [],
					error: createLoadError(normalizedError),
					isRefetching: false,
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
