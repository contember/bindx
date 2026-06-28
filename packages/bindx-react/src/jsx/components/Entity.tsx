import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import { useBindxContext, useSchemaRegistry } from '../../hooks/BackendAdapterContext.js'
import { annotateElement } from '../devAnnotations.js'
import { useEntity } from '../../hooks/useEntity.js'
import { useSelectionCollection } from '../../hooks/useSelectionCollection.js'
import type { EntityAccessor, EntityRef, SelectionMeta } from '../types.js'
import { type EntityDef, type EntityUniqueWhere, type AnyBrand, type FieldError, EntityHandle, type SnapshotStore, type ActionDispatcher, type SchemaRegistry, type CommonEntity } from '@contember/bindx'

// ==================== Props Types ====================

/**
 * Base props shared by both edit and create modes.
 * TRoleMap is the role map from EntityDef — entity type resolved as CommonEntity<TRoleMap>.
 */
interface EntityBaseProps<TRoleMap extends Record<string, object>> {
	/** Entity definition reference */
	entity: EntityDef<TRoleMap>
	/** Render function receiving typed entity accessor with direct field access */
	children: (entity: EntityRef<CommonEntity<TRoleMap>>) => React.ReactNode
	/** Error fallback */
	error?: (error: FieldError) => React.ReactNode
}

/**
 * Props for editing an existing entity (fetched by unique field)
 */
interface EntityByProps<TRoleMap extends Record<string, object>> extends EntityBaseProps<TRoleMap> {
	/** Unique field(s) to identify the entity (e.g., { id: '...' } or { slug: '...' }) */
	by: EntityUniqueWhere
	/**
	 * Cache-invalidation key. Changing this value re-fetches the entity from the
	 * server without unmounting the subtree (stale-while-revalidate). Use this
	 * instead of `key={...}` when external mutations (e.g. workflow RPC) need
	 * the bindx view refreshed but UI state (scroll, dialogs, drafts) must survive.
	 */
	queryKey?: string
	create?: never
	onPersisted?: never
	/** Loading fallback */
	loading?: React.ReactNode
	/** Not found fallback */
	notFound?: React.ReactNode
}

/**
 * Props for creating a new entity
 */
interface EntityCreateProps<TRoleMap extends Record<string, object>> extends EntityBaseProps<TRoleMap> {
	by?: never
	/** Create a new entity instead of fetching an existing one */
	create: true
	/** Callback when entity is persisted and receives server-assigned ID */
	onPersisted?: (id: string) => void
	loading?: never
	notFound?: never
}

/**
 * Props for Entity component - union of edit mode (by) and create mode
 */
export type EntityProps<TRoleMap extends Record<string, object> = Record<string, object>> =
	| EntityByProps<TRoleMap>
	| EntityCreateProps<TRoleMap>

// ==================== Internal Props Types ====================

interface EntityByModeProps {
	entityType: string
	by: EntityUniqueWhere
	queryKey?: string
	children: (entity: EntityAccessor<unknown>) => React.ReactNode
	loading?: React.ReactNode
	error?: (error: FieldError) => React.ReactNode
	notFound?: React.ReactNode
}

interface EntityCreateModeProps {
	entityType: string
	children: (entity: EntityAccessor<unknown>) => React.ReactNode
	error?: (error: FieldError) => React.ReactNode
	onPersisted?: (id: string) => void
}

// ==================== EntityByMode Component ====================

/**
 * Internal component for edit mode (fetching existing entity by unique field)
 */
function EntityByMode({
	entityType,
	by,
	queryKey: userQueryKey,
	children,
	loading,
	error: errorFallback,
	notFound,
}: EntityByModeProps): ReactElement | null {
	const { store, dispatcher } = useBindxContext()
	const schemaRegistry = useSchemaRegistry()

	// Stable key for the 'by' clause
	const byKey = useMemo(() => JSON.stringify(by), [by])

	// Phase 1: Collect JSX selection
	const { selection, queryKey: selectionQueryKey } = useSelectionCollection({
		entityType,
		depsKey: byKey,
		collect: collector => children(collector as EntityAccessor<unknown>),
	})

	// Combine internal selection key with user-supplied invalidation key so
	// both selection changes and explicit refreshes trigger a refetch.
	const effectiveQueryKey = userQueryKey !== undefined
		? `${selectionQueryKey}::${userQueryKey}`
		: selectionQueryKey

	// Phase 2: Load data using unified hook
	const result = useEntity({ $name: entityType } as EntityDef, {
		by,
		selection,
		queryKey: effectiveQueryKey,
	})

	// Render based on status
	if (result.$status === 'loading') {
		return <>{loading ?? <DefaultLoading />}</>
	}

	if (result.$status === 'error') {
		const error: FieldError = result.$error ?? { source: 'load', message: 'Unknown error', category: 'unknown', retryable: false }
		if (errorFallback) {
			return <>{errorFallback(error)}</>
		}
		return <DefaultError error={error} />
	}

	if (result.$status === 'not_found') {
		return <>{notFound ?? <DefaultNotFound entityType={entityType} by={by} />}</>
	}

	// Phase 3: Runtime render with EntityHandle (selection-aware)
	return (
		<EntityHandleRenderer
			entityId={result.id}
			entityType={entityType}
			store={store}
			dispatcher={dispatcher}
			schemaRegistry={schemaRegistry}
			selection={selection}
			children={children}
		/>
	)
}

// ==================== EntityCreateMode Component ====================

/**
 * Snapshot type for create mode subscription
 */
interface CreateModeSnapshot {
	version: number
	persistedId: string | null
}

/**
 * Internal component for create mode (creating a new entity).
 *
 * The draft entity is minted in a layout effect, NEVER during render. A
 * render-phase store mutation is unsafe two ways:
 *  - it leaks the draft whenever the render is discarded — StrictMode
 *    double-invoke, an aborted concurrent render, a thrown render, Suspense —
 *    because no effect cleanup runs for a render that never commits;
 *  - it synchronously notifies the store's global subscribers, force-updating an
 *    already-mounted aggregate subscriber (e.g. a `usePersist` consumer)
 *    mid-render. React rejects that ("Cannot update a component while rendering a
 *    different component") and the create form renders blank.
 * A layout effect runs before paint, so the draft exists before the user sees
 * anything and its creation notifies subscribers normally (no stale dirty state).
 */
function EntityCreateMode({
	entityType,
	children,
	onPersisted,
}: EntityCreateModeProps): ReactElement {
	const { store } = useBindxContext()
	const tempIdRef = useRef<string | null>(null)
	const [tempId, setTempId] = useState<string | null>(null)

	useLayoutEffect(() => {
		if (!tempIdRef.current) {
			tempIdRef.current = store.createEntity(entityType)
			setTempId(tempIdRef.current)
		} else if (!store.getPersistedId(entityType, tempIdRef.current) && !store.hasEntity(entityType, tempIdRef.current)) {
			// Re-seed under the SAME temp id if a previous cleanup removed it (a React
			// StrictMode mount→cleanup→mount cycle), so the form stays bound across it.
			store.createEntity(entityType, { id: tempIdRef.current })
		}
		return () => {
			const id = tempIdRef.current
			// On unmount, discard a never-persisted draft: drop its root registration
			// and let the reachability-aware sweep reclaim it ONLY if nothing else
			// references it — a draft connected into another live parent stays reachable
			// and survives (the diamond / shared-create case). A persisted entity is
			// left untouched.
			if (id && !store.getPersistedId(entityType, id)) {
				store.unregisterRootEntity(entityType, id)
				store.sweepUnreachableCreated()
			}
		}
	}, [store, entityType])

	// First render, before the layout effect mints the draft. The draft is created
	// before paint, so this empty frame is never visible.
	if (tempId === null) {
		return <></>
	}

	return (
		<EntityCreateModeInner entityType={entityType} tempId={tempId} onPersisted={onPersisted}>
			{children}
		</EntityCreateModeInner>
	)
}

/**
 * Renders the create-mode draft once it exists. Split out of EntityCreateMode so
 * its store subscriptions and selection collection always run against a real
 * tempId (never null) — the hooks stay unconditional.
 */
function EntityCreateModeInner({
	entityType,
	tempId,
	children,
	onPersisted,
}: {
	entityType: string
	tempId: string
	children: (entity: EntityAccessor<unknown>) => React.ReactNode
	onPersisted?: (id: string) => void
}): ReactElement {
	const { store, dispatcher } = useBindxContext()
	const schemaRegistry = useSchemaRegistry()

	// Subscribe to store changes for this entity
	const subscribe = useCallback(
		(callback: () => void) => store.subscribeToEntity(entityType, tempId, callback),
		[store, entityType, tempId],
	)

	// Cache ref for snapshot stability
	const snapshotCacheRef = useRef<CreateModeSnapshot | null>(null)

	const getSnapshot = useCallback((): CreateModeSnapshot => {
		const entitySnapshot = store.getEntitySnapshot(entityType, tempId)
		const persistedId = store.getPersistedId(entityType, tempId)
		const version = entitySnapshot?.version ?? 0

		// Return cached snapshot if values haven't changed
		const cached = snapshotCacheRef.current
		if (cached && cached.version === version && cached.persistedId === persistedId) {
			return cached
		}

		// Create new snapshot and cache it
		const newSnapshot: CreateModeSnapshot = { version, persistedId }
		snapshotCacheRef.current = newSnapshot
		return newSnapshot
	}, [store, entityType, tempId])

	const { persistedId } = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getSnapshot, // Server snapshot same as client for create mode
	)

	// Track previous persistedId to call onPersisted only once
	const prevPersistedIdRef = useRef<string | null>(null)

	useEffect(() => {
		if (persistedId && persistedId !== prevPersistedIdRef.current) {
			prevPersistedIdRef.current = persistedId
			onPersisted?.(persistedId)
		}
	}, [persistedId, onPersisted])

	// Selection collection still works for building mutations
	useSelectionCollection({
		entityType,
		depsKey: tempId,
		collect: collector => children(collector as EntityAccessor<unknown>),
	})

	// Create EntityHandle (no selection for create mode - all fields accessible)
	return (
		<EntityHandleRenderer
			entityId={tempId}
			entityType={entityType}
			store={store}
			dispatcher={dispatcher}
			schemaRegistry={schemaRegistry}
			children={children}
		/>
	)
}

// ==================== EntityHandle Renderer ====================

interface EntityHandleRendererProps {
	entityId: string
	entityType: string
	store: SnapshotStore
	dispatcher: ActionDispatcher
	schemaRegistry: SchemaRegistry
	selection?: SelectionMeta
	children: (entity: EntityAccessor<unknown>) => React.ReactNode
}

/**
 * Shared component that creates an EntityHandle and renders children with it.
 * Used by both EntityByMode and EntityCreateMode.
 *
 * Subscribes to entity snapshot changes so that the handle reference changes
 * when entity data changes. This is necessary because children may be wrapped
 * in React.memo and need a new handle reference to trigger re-renders.
 */
function EntityHandleRenderer({
	entityId,
	entityType,
	store,
	dispatcher,
	schemaRegistry,
	selection,
	children,
}: EntityHandleRendererProps): ReactElement {
	const subscribe = useCallback(
		(callback: () => void) => store.subscribeToEntity(entityType, entityId, callback),
		[store, entityType, entityId],
	)

	const getSnapshot = useCallback(
		() => store.getEntitySnapshot(entityType, entityId)?.version ?? 0,
		[store, entityType, entityId],
	)

	const version = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

	const rawHandle = useMemo(
		() => EntityHandle.createRaw(entityId, entityType, store, dispatcher, schemaRegistry, undefined, selection),
		[entityId, entityType, store, dispatcher, schemaRegistry, selection, version],
	)

	const handle = useMemo(
		() => EntityHandle.wrapProxy(rawHandle),
		[rawHandle],
	)

	// `version` is a useMemo dep, so `rawHandle` is recreated on every entity data change (to give
	// memoized children a fresh reference). Superseded handles need no cleanup: EntityHandle and its
	// child Field/HasMany handles are stateless live views that own no resources (see BaseHandle),
	// so they are reclaimed by GC once unreferenced — and a consumer that still holds an accessor
	// from an earlier render (e.g. the Slate block editor dispatching `setValue` from an async
	// onChange after the version bumped) can keep using it.

	const result = children(handle as EntityAccessor<unknown>)
	return <>{annotateElement(result, { 'data-entity': entityType, 'data-entity-id': entityId })}</>
}

// ==================== Main Entity Component ====================

/**
 * Entity component - orchestrates the two-pass rendering approach.
 *
 * Supports two modes:
 * - Edit mode: Fetches an existing entity by unique field(s)
 * - Create mode: Creates a new entity locally
 *
 * @example Edit mode
 * ```tsx
 * <Entity entity={schema.Author} by={{ id: 'author-1' }}>
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
 *
 * @example Create mode
 * ```tsx
 * <Entity entity={schema.Author} create onPersisted={id => navigate(`/authors/${id}`)}>
 *   {author => (
 *     <>
 *       <Field field={author.fields.name} />
 *       {author.isNew && <span>New author</span>}
 *       {author.persistedId && <span>Saved as {author.persistedId}</span>}
 *     </>
 *   )}
 * </Entity>
 * ```
 */
function EntityImpl<TRoleMap extends Record<string, object>>(
	props: EntityProps<TRoleMap>,
): ReactElement | null {
	const isCreateMode = 'create' in props && props.create === true

	if (isCreateMode) {
		const createProps = props as EntityCreateProps<TRoleMap>
		return (
			<EntityCreateMode
				entityType={createProps.entity.$name}
				children={createProps.children as (entity: EntityAccessor<unknown>) => React.ReactNode}
				error={createProps.error}
				onPersisted={createProps.onPersisted}
			/>
		)
	}

	const byProps = props as EntityByProps<TRoleMap>
	return (
		<EntityByMode
			entityType={byProps.entity.$name}
			by={byProps.by}
			queryKey={byProps.queryKey}
			children={byProps.children as (entity: EntityAccessor<unknown>) => React.ReactNode}
			loading={byProps.loading}
			error={byProps.error}
			notFound={byProps.notFound}
		/>
	)
}

// Note: Using type assertion for generic memo component
export const Entity = memo(EntityImpl) as unknown as typeof EntityImpl

// ==================== Default Fallback Components ====================

/**
 * Default loading component
 */
function DefaultLoading(): ReactElement {
	return <div className="bindx-loading">Loading...</div>
}

/**
 * Default error component
 */
function DefaultError({ error }: { error: FieldError }): ReactElement {
	return (
		<div className="bindx-error">
			<strong>Error:</strong> {error.message}
		</div>
	)
}

/**
 * Default not found component
 */
function DefaultNotFound({ entityType, by }: { entityType: string; by: EntityUniqueWhere }): ReactElement {
	const byDescription = Object.entries(by).map(([k, v]) => `${k}="${v}"`).join(', ')
	return (
		<div className="bindx-not-found">
			{entityType} with {byDescription} not found
		</div>
	)
}
