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
 * Loading state for entity accessor
 */
export interface LoadingEntityAccessor {
	readonly status: 'loading'
	readonly isLoading: true
	readonly isError: false
	readonly isNotFound: false
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
	readonly isNotFound: false
	readonly error: FieldError
	readonly isPersisting: false
	readonly isDirty: false
	readonly id: string
	readonly fields: never
	readonly data: never
	persist(): Promise<void>
	reset(): void
}

/**
 * Not found state for entity accessor
 */
export interface NotFoundEntityAccessor {
	readonly status: 'not_found'
	readonly isLoading: false
	readonly isError: false
	readonly isNotFound: true
	readonly isPersisting: false
	readonly isDirty: false
	readonly id: string
	readonly fields: never
	readonly data: never
	persist(): Promise<void>
	reset(): void
}

/**
 * Ready state base interface for entity accessor
 */
export interface ReadyEntityAccessorBase<TEntity extends object, TSelected extends object = TEntity> {
	readonly status: 'ready'
	readonly isLoading: false
	readonly isError: false
	readonly isNotFound: false
	readonly isPersisting: boolean
	readonly isDirty: boolean
	readonly id: string
	readonly fields: SelectedEntityFields<TEntity, TSelected>
	readonly data: TSelected
	persist(): Promise<void>
	reset(): void
}

/**
 * Ready state for entity accessor with direct field access via Proxy.
 */
export type ReadyEntityAccessor<TEntity extends object, TSelected extends object = TEntity> =
	ReadyEntityAccessorBase<TEntity, TSelected> & SelectedEntityFields<TEntity, TSelected>

/**
 * Union of all entity accessor states
 */
export type EntityAccessorResult<TEntity extends object, TSelected extends object = TEntity> =
	| LoadingEntityAccessor
	| ErrorEntityAccessor
	| NotFoundEntityAccessor
	| ReadyEntityAccessor<TEntity, TSelected>

// ============================================================================
// Internal helpers
// ============================================================================

function createLoadingAccessor(id: string): LoadingEntityAccessor {
	return {
		status: 'loading',
		isLoading: true,
		isError: false,
		isNotFound: false,
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

function createErrorAccessor(id: string, error: FieldError): ErrorEntityAccessor {
	return {
		status: 'error',
		isLoading: false,
		isError: true,
		isNotFound: false,
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

function createNotFoundAccessor(id: string): NotFoundEntityAccessor {
	return {
		status: 'not_found',
		isLoading: false,
		isError: false,
		isNotFound: true,
		isPersisting: false,
		isDirty: false,
		id,
		get fields(): never {
			throw new Error('Cannot access fields — entity not found')
		},
		get data(): never {
			throw new Error('Cannot access data — entity not found')
		},
		async persist() {
			// No-op for not found
		},
		reset() {
			// No-op for not found
		},
	}
}

// ============================================================================
// Hook overloads
// ============================================================================

/**
 * Hook to fetch and manage a single entity with role-expanded type inference.
 *
 * @example
 * ```tsx
 * const article = useEntity(schema.Article, { by: { id }, roles: ['admin'] }, e => e.title().internalNotes())
 * ```
 */
export function useEntity<
	TRoleMap extends Record<string, object>,
	TRoles extends RoleNames<TRoleMap>,
	TResult extends object,
>(
	entity: EntityDef<TRoleMap>,
	options: UseEntityOptions & { roles: readonly TRoles[] },
	definer: SelectionInput<EntityForRoles<TRoleMap, TRoles>, TResult>,
): EntityAccessorResult<EntityForRoles<TRoleMap, TRoles>, TResult>

/**
 * Hook to fetch and manage a single entity with full type inference.
 * Uses the common (narrowest) entity type when no roles are specified.
 *
 * @example
 * ```tsx
 * const article = useEntity(schema.Article, { by: { id } }, e => e.title().content())
 * if (article.status !== 'ready') return <Loading />
 * return <input value={article.title.value} onChange={...} />
 * ```
 */
export function useEntity<TRoleMap extends Record<string, object>, TResult extends object>(
	entity: EntityDef<TRoleMap>,
	options: UseEntityOptions,
	definer: SelectionInput<CommonEntity<TRoleMap>, TResult>,
): EntityAccessorResult<CommonEntity<TRoleMap>, TResult>

/**
 * Hook to fetch and manage a single entity with pre-resolved selection.
 *
 * Used internally by Entity component that collects selection from JSX.
 */
export function useEntity(
	entity: EntityDef,
	options: UseEntityOptions & { selection: SelectionMeta },
): EntityAccessorResult<object, object>

// ============================================================================
// Implementation
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useEntity(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	entity: EntityDef<any>,
	options: UseEntityOptions,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	definer?: SelectionInput<any, any>,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): EntityAccessorResult<any, any> {
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
	// Include snapshot in deps so handle reference changes when entity data changes.
	// This ensures memo-wrapped children that receive individual field handles re-render.
	const handle = useMemo(
		() => EntityHandle.create(id, entityType, store, dispatcher, schemaRegistry as SchemaRegistry<Record<string, object>>),
		[id, entityType, store, dispatcher, schemaRegistry, snapshot],
	)

	useEffect(() => {
		return () => {
			handle.dispose()
		}
	}, [handle])

	// --- Build accessor ---
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const accessor = useMemo((): EntityAccessorResult<any, any> => {
		if (!loadState || loadState.status === 'loading') {
			return createLoadingAccessor(id)
		}

		if (loadState.status === 'error') {
			return createErrorAccessor(id, loadState.error!)
		}

		if (loadState.status === 'not_found') {
			return createNotFoundAccessor(id)
		}

		if (!snapshot) {
			return createLoadingAccessor(id)
		}

		// Ready state
		const realId = (snapshot.data as Record<string, unknown>)?.['id'] as string | undefined ?? id

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const baseAccessor: ReadyEntityAccessorBase<any, any> = {
			status: 'ready',
			isLoading: false,
			isError: false,
			isNotFound: false,
			isPersisting,
			get isDirty() {
				return handle.$isDirty
			},
			id: realId,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			fields: handle.$fields as any,
			data: snapshot.data,
			async persist() {
				await batchPersister.persist(entityType, realId)
			},
			reset() {
				handle.reset()
			},
		}

		// Wrap in Proxy for direct field access
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return new Proxy(baseAccessor as any, {
			get(target: Record<string, unknown>, prop: string | symbol, receiver: unknown) {
				if (prop in target) {
					return Reflect.get(target, prop, receiver)
				}
				if (typeof prop === 'string') {
					const fields = target['fields'] as Record<string, unknown>
					const fieldValue = fields[prop]
					if (fieldValue !== undefined) {
						return fieldValue
					}
				}
				return undefined
			},
		})
	}, [snapshot, loadState, isPersisting, id, handle, batchPersister, entityType])

	return accessor
}
