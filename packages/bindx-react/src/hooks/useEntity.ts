import { useRef, useEffect, useMemo, useCallback } from 'react'
import type {
	EntityDef,
	EntityUniqueWhere,
	SchemaRegistry,
	SelectionInput,
	SelectionMeta,
	FieldError,
	EntitySnapshot,
	LoadStatus,
	SelectedEntityFields,
	CommonEntity,
	EntityForRoles,
	RoleNames,
	EntityAccessor,
} from '@contember/bindx'
import {
	EntityHandle,
	resolveSelectionMeta,
	buildQueryFromSelection,
	setEntityData,
	setLoadState,
	createLoadError,
} from '@contember/bindx'
import { useBindxContext, useSchemaRegistry } from './BackendAdapterContext.js'
import { useStoreSubscription } from './useStoreSubscription.js'

// ============================================================================
// Options
// ============================================================================

/**
 * Options for useEntity hook
 */
export interface UseEntityOptions {
	/** Unique field(s) to identify the entity (e.g., { id: '...' } or { slug: '...' }) */
	by: EntityUniqueWhere
	/** If true, use cached data from store if available (default: false) */
	cache?: boolean
	/**
	 * Pre-resolved selection metadata.
	 * When provided, definer (3rd argument) is not needed.
	 * Used internally by Entity component.
	 */
	selection?: SelectionMeta
	/** Optional query key for cache invalidation */
	queryKey?: string
}

// ============================================================================
// Result types
// ============================================================================

/**
 * Common properties on every UseEntityResult state.
 * All prefixed with $ to avoid collision with entity field names.
 */
interface UseEntityResultBase {
	$persist(): Promise<void>
	$reset(): void
}

export type LoadingEntityResult = UseEntityResultBase & {
	readonly $status: 'loading'
	readonly $isLoading: true
	readonly $isError: false
	readonly $isNotFound: false
	readonly $error: null
	readonly id: string
}

export type ErrorEntityResult = UseEntityResultBase & {
	readonly $status: 'error'
	readonly $isLoading: false
	readonly $isError: true
	readonly $isNotFound: false
	readonly $error: FieldError
	readonly id: string
}

export type NotFoundEntityResult = UseEntityResultBase & {
	readonly $status: 'not_found'
	readonly $isLoading: false
	readonly $isError: false
	readonly $isNotFound: true
	readonly $error: null
	readonly id: string
}

/**
 * Ready state — full EntityAccessor with status metadata.
 */
export type ReadyEntityResult<TEntity extends object, TSelected extends object = TEntity> =
	UseEntityResultBase & EntityAccessor<TEntity, TSelected> & {
		readonly $status: 'ready'
		readonly $isLoading: false
		readonly $isError: false
		readonly $isNotFound: false
		readonly $error: null
	}

/**
 * Union of all useEntity return states.
 * Discriminated on $status.
 */
export type UseEntityResult<TEntity extends object, TSelected extends object = TEntity> =
	| LoadingEntityResult
	| ErrorEntityResult
	| NotFoundEntityResult
	| ReadyEntityResult<TEntity, TSelected>

// ============================================================================
// Hook overloads
// ============================================================================

/**
 * Hook to fetch and manage a single entity with role-expanded type inference.
 */
export function useEntity<
	TRoleMap extends Record<string, object>,
	TRoles extends RoleNames<TRoleMap>,
	TResult extends object,
>(
	entity: EntityDef<TRoleMap>,
	options: UseEntityOptions & { roles: readonly TRoles[] },
	definer: SelectionInput<EntityForRoles<TRoleMap, TRoles>, TResult>,
): UseEntityResult<EntityForRoles<TRoleMap, TRoles>, TResult>

/**
 * Hook to fetch and manage a single entity with full type inference.
 *
 * @example
 * ```tsx
 * const article = useEntity(schema.Article, { by: { id } }, e => e.title().content())
 * if (article.$status !== 'ready') return <Loading />
 * return <input value={article.title.value} onChange={...} />
 * ```
 */
export function useEntity<TRoleMap extends Record<string, object>, TResult extends object>(
	entity: EntityDef<TRoleMap>,
	options: UseEntityOptions,
	definer: SelectionInput<CommonEntity<TRoleMap>, TResult>,
): UseEntityResult<CommonEntity<TRoleMap>, TResult>

/**
 * Hook to fetch and manage a single entity with pre-resolved selection.
 * Used internally by Entity component that collects selection from JSX.
 */
export function useEntity(
	entity: EntityDef,
	options: UseEntityOptions & { selection: SelectionMeta },
): UseEntityResult<object, object>

// ============================================================================
// Implementation
// ============================================================================

export function useEntity(
	entity: EntityDef<any>,
	options: UseEntityOptions,
	definer?: SelectionInput<any, any>,
): UseEntityResult<any, any> {
	const schemaRegistry = useSchemaRegistry()
	const entityType = entity.$name
	const { store, dispatcher, batcher, batchPersister } = useBindxContext()

	// --- Selection resolution ---
	const resolvedMeta = definer ? resolveSelectionMeta(definer) : null
	const definerQueryKey = resolvedMeta ? JSON.stringify(buildQueryFromSelection(resolvedMeta)) : null
	const selectionRef = useRef<{ meta: SelectionMeta; queryKey: string } | null>(null)

	if (definerQueryKey && resolvedMeta) {
		if (!selectionRef.current || selectionRef.current.queryKey !== definerQueryKey) {
			selectionRef.current = { meta: resolvedMeta, queryKey: definerQueryKey }
		}
	}

	const selectionMeta = definer ? selectionRef.current!.meta : options.selection!

	// --- Derive ID from 'by' ---
	const by = options.by
	const id = useMemo(() => {
		if ('id' in by && typeof by['id'] === 'string') {
			return by['id']
		}
		const firstValue = Object.values(by)[0]
		return typeof firstValue === 'string' ? firstValue : String(firstValue)
	}, [by])

	const byKey = useMemo(() => JSON.stringify(by), [by])
	const byRef = useRef(by)
	byRef.current = by

	// --- Effective query key ---
	const effectiveQueryKey = useMemo(() => {
		if (options.queryKey) return options.queryKey
		const query = buildQueryFromSelection(selectionMeta)
		return JSON.stringify(query)
	}, [options.queryKey, selectionMeta])

	// --- Store subscription ---
	const subscribe = useCallback(
		(callback: () => void) => {
			return store.subscribeToEntity(entityType, id, callback)
		},
		[store, entityType, id],
	)

	interface SubscriptionSnapshot {
		snapshot: EntitySnapshot | undefined
		loadState: { status: LoadStatus; error?: FieldError } | undefined
		isPersisting: boolean
	}

	const getSnapshot = useCallback((): SubscriptionSnapshot => {
		return {
			snapshot: store.getEntitySnapshot(entityType, id),
			loadState: store.getLoadState(entityType, id),
			isPersisting: store.isPersisting(entityType, id),
		}
	}, [store, entityType, id])

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

	// --- Data loading ---
	const fetchingRef = useRef<string | null>(null)

	useEffect(() => {
		// Check cache first
		if (options.cache && store.hasEntity(entityType, id)) {
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

		dispatcher.dispatch(setLoadState(entityType, id, 'loading'))

		const fetchData = async (): Promise<void> => {
			try {
				const spec = buildQueryFromSelection(selectionMeta)
				const currentBy = byRef.current
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
				if (error instanceof Error && error.name === 'AbortError') return

				const normalizedError = error instanceof Error ? error : new Error(String(error))
				dispatcher.dispatch(
					setLoadState(entityType, id, 'error', createLoadError(normalizedError)),
				)
			}
		}

		fetchData()

		return () => {
			abortController.abort()
			if (fetchingRef.current === fetchKey) {
				fetchingRef.current = null
			}
		}
	}, [entityType, id, byKey, effectiveQueryKey, options.cache, batcher, store, dispatcher, selectionMeta])

	// --- EntityHandle ---
	const rawHandle = useMemo(
		() => EntityHandle.createRaw(id, entityType, store, dispatcher, schemaRegistry as SchemaRegistry<Record<string, object>>),
		[id, entityType, store, dispatcher, schemaRegistry, snapshot],
	)

	const handle = useMemo(
		() => EntityHandle.wrapProxy(rawHandle),
		[rawHandle],
	)

	useEffect(() => {
		return () => {
			rawHandle.dispose()
		}
	}, [rawHandle])

	// --- Persist & reset callbacks ---
	const persist = useCallback(async () => {
		await batchPersister.persist(entityType, id)
	}, [batchPersister, entityType, id])

	const reset = useCallback(() => {
		rawHandle.reset()
	}, [rawHandle])

	// --- Build result ---
	const result = useMemo((): UseEntityResult<object, object> => {
		if (!loadState || loadState.status === 'loading' || (!snapshot && loadState.status === 'success')) {
			return { $status: 'loading', $isLoading: true, $isError: false, $isNotFound: false, $error: null, id, $persist: persist, $reset: reset }
		}

		if (loadState.status === 'error') {
			return { $status: 'error', $isLoading: false, $isError: true, $isNotFound: false, $error: loadState.error!, id, $persist: persist, $reset: reset }
		}

		if (loadState.status === 'not_found') {
			return { $status: 'not_found', $isLoading: false, $isError: false, $isNotFound: true, $error: null, id, $persist: persist, $reset: reset }
		}

		// Ready — layer status metadata on top of EntityHandle proxy
		return createReadyResult(handle, persist, reset)
	}, [snapshot, loadState, isPersisting, id, handle, persist, reset])

	// Proxy-based result satisfies the full UseEntityResult<T> at runtime via field access delegation
	return result as UseEntityResult<any, any>
}

// ============================================================================
// Result factories
// ============================================================================

function createReadyResult(
	handle: EntityAccessor<object, object>,
	persist: () => Promise<void>,
	reset: () => void,
): UseEntityResult<object, object> {
	const meta: Record<string, unknown> = {
		$status: 'ready' as const,
		$isLoading: false as const,
		$isError: false as const,
		$isNotFound: false as const,
		$error: null,
		$persist: persist,
		$reset: reset,
	}

	// Proxy merges status metadata onto EntityAccessor — satisfies ReadyEntityResult at runtime
	return new Proxy(handle as object, {
		get(target, prop, receiver) {
			if (typeof prop === 'string' && prop in meta) {
				return meta[prop]
			}
			return Reflect.get(target, prop, receiver)
		},
		has(target, prop) {
			if (typeof prop === 'string' && prop in meta) {
				return true
			}
			return Reflect.has(target, prop)
		},
	}) as unknown as UseEntityResult<object, object>
}
