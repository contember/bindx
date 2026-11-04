/**
 * HasManyDataGrid — headless data grid for has-many relation fields.
 * Fetches relation data from the parent entity with dynamic filter/sort/page params.
 *
 * @example
 * ```tsx
 * <Entity entity={schema.Author} by={{ id }}>
 *   {(author) => (
 *     <HasManyDataGrid field={author.articles}>
 *       {(it) => (
 *         <>
 *           <TextColumn field={it.title} />
 *           <BooleanColumn field={it.active} />
 *         </>
 *       )}
 *     </HasManyDataGrid>
 *   )}
 * </Entity>
 * ```
 */

import { memo, type ReactElement, type ReactNode, useEffect, useMemo, useCallback, useRef, useState } from 'react'
import type {
	EntityAccessor,
	HasManyRef,
	OrderDirection,
	DataViewLayout,
	SelectionValues,
} from '@contember/bindx'
import { FIELD_REF_META } from '@contember/bindx'
import {
	buildQueryFromSelection,
	EntityHandle,
	refreshServerData,
} from '@contember/bindx'
import type { SchemaRegistry } from '@contember/bindx'
import type { StateStorageOrName } from './stateStorage.js'
import {
	useBindxContext,
} from '@contember/bindx-react'
import { useDataViewKey } from './DataViewKeyProvider.js'
import { DataViewProvider, type DataViewContextValue, type DataViewFetchAllData } from './DataViewContext.js'
import { resolveLoaderState } from './loaderState.js'
import { useDataGridSetup } from './useDataGridSetup.js'
import { buildHasManyRelationQuery, extractHasManyRelationRows } from './hasManyRelationQuery.js'
import { usePagingTotalCount } from './usePagingTotalCount.js'

// ============================================================================
// Props
// ============================================================================

export interface HasManyDataGridProps<TEntity extends object = object> {
	/** Has-many relation field from parent entity */
	field: HasManyRef<TEntity, any>
	/** Children render function: receives entity proxy `it`, returns column markers + layout */
	children: (it: EntityAccessor<TEntity>) => ReactNode
	/** Initial sorting */
	initialSorting?: Partial<Record<string, OrderDirection>>
	/** Items per page. null = show all. Default: 50 */
	itemsPerPage?: number | null
	/** Static filter (combined with dynamic filters) */
	filter?: Record<string, unknown>
	/** Available layouts */
	layouts?: readonly DataViewLayout[]
	/** Initial selection (layout + visibility) */
	initialSelection?: SelectionValues
	/** State storage for filter/sorting/selection state */
	stateStorage?: StateStorageOrName
	/** State storage for current page */
	currentPageStateStorage?: StateStorageOrName
	/** State storage for page size preference */
	pagingSettingsStorage?: StateStorageOrName
	/** Storage key prefix for isolation */
	storageKey?: string
}

// ============================================================================
// List state
// ============================================================================

interface ListState {
	status: 'loading' | 'error' | 'ready'
	items: Array<{ id: string; data: object }>
	totalCount?: number
	/** The relation (parent, field, selection) the items were loaded for. */
	scopeKey?: string
	/** The query options the items were loaded for. */
	optionsKey?: string
	/** The request (query options and reload) the items were loaded for. */
	requestKey?: string
}

const INITIAL_LIST_STATE: ListState = { status: 'loading', items: [] }

function getRowId(entityType: string, row: Record<string, unknown>): string {
	const id = row['id']
	if (typeof id !== 'string') throw new Error(`${entityType} relation row has no string id`)
	return id
}

// ============================================================================
// Implementation
// ============================================================================

function HasManyDataGridImpl<TEntity extends object>({
	field,
	children,
	initialSorting,
	itemsPerPage = 50,
	filter: staticFilter,
	layouts,
	initialSelection,
	stateStorage,
	currentPageStateStorage,
	pagingSettingsStorage,
	storageKey,
}: HasManyDataGridProps<TEntity>): ReactElement | null {
	const { schema: schemaRegistry, store, dispatcher, batcher } = useBindxContext()

	// Extract relation metadata from field prop
	const fieldMeta = field[FIELD_REF_META]
	const parentEntityType = fieldMeta.entityType
	const parentEntityId = fieldMeta.entityId
	const fieldName = fieldMeta.fieldName
	const targetEntityType = field.__entityName

	const contextKey = useDataViewKey()
	const effectiveStorageKey = storageKey ?? `${parentEntityType}:${fieldName}`

	const setup = useDataGridSetup<TEntity>({
		entityType: targetEntityType,
		schemaRegistry,
		children,
		initialSorting,
		itemsPerPage,
		staticFilter,
		layouts,
		initialSelection,
		stateStorage,
		currentPageStateStorage,
		pagingSettingsStorage,
		storageKey: effectiveStorageKey,
	})

	// ---- State ----
	const [listState, setListState] = useState<ListState>(INITIAL_LIST_STATE)

	const optionsKey = useMemo(
		() => JSON.stringify({
			filter: setup.combinedFilter ?? {},
			orderBy: setup.sorting.resolvedOrderBy ?? [],
			limit: setup.paging.queryLimit,
			offset: setup.paging.queryOffset,
		}),
		[setup.combinedFilter, setup.sorting.resolvedOrderBy, setup.paging.queryLimit, setup.paging.queryOffset],
	)

	// ---- Reload: the same query loads again, the relation response carries the total ----
	const [reloadCounter, setReloadCounter] = useState(0)
	const reload = useCallback((): void => {
		setReloadCounter(c => c + 1)
	}, [])

	const scopeKey = JSON.stringify([parentEntityType, parentEntityId, fieldName, targetEntityType, setup.queryKey])
	const requestKey = JSON.stringify([scopeKey, optionsKey, reloadCounter])
	// The request key covers the selection's content; the effect reads the latest object without refetching on a new identity.
	const selectionRef = useRef(setup.selection)
	selectionRef.current = setup.selection

	// ---- Data loading via GetQuery on parent ----
	useEffect(() => {
		const abortController = new AbortController()
		const selection = selectionRef.current
		// Stale-while-revalidate: the rows of the previous request stay on screen until the new ones land.
		setListState(previous => previous.status === 'ready' && previous.scopeKey === scopeKey ? previous : INITIAL_LIST_STATE)

		const fetchData = async (): Promise<void> => {
			try {
				const currentOptions = JSON.parse(optionsKey) as {
					filter: Record<string, unknown>
					orderBy: readonly Record<string, unknown>[]
					limit?: number
					offset?: number
				}

				const { alias, query } = buildHasManyRelationQuery({
					parentEntityType,
					parentEntityId,
					fieldName,
					filter: currentOptions.filter,
					orderBy: currentOptions.orderBy,
					limit: currentOptions.limit,
					offset: currentOptions.offset,
					targetSpec: buildQueryFromSelection(selection),
				})

				const result = await batcher.enqueue(query, { signal: abortController.signal })

				if (abortController.signal.aborted) return

				if (result.type !== 'get' || !result.data) {
					setListState({ status: 'error', items: [], scopeKey })
					return
				}

				const relation = extractHasManyRelationRows(result.data, { alias, fieldName })
				if (!relation) {
					setListState({ status: 'ready', items: [], scopeKey, optionsKey, requestKey })
					return
				}

				store.indexServerResponse(targetEntityType, relation.rows, selection, schemaRegistry)
				const items = relation.rows.map(data => ({ id: getRowId(targetEntityType, data), data: store.resolveServerOccurrence(data) }))
				store.batchNotifications(() => {
					for (const item of items) {
						// Revalidation preserves local edits while advancing the server baseline.
						dispatcher.dispatch(refreshServerData(targetEntityType, item.id, item.data))
					}
				})

				setListState({ status: 'ready', items, totalCount: relation.totalCount, scopeKey, optionsKey, requestKey })
			} catch (error) {
				if (abortController.signal.aborted) return
				setListState({ status: 'error', items: [], scopeKey })
			}
		}

		fetchData()

		return () => {
			abortController.abort()
		}
	}, [parentEntityType, parentEntityId, fieldName, targetEntityType, scopeKey, optionsKey, requestKey, batcher, dispatcher, store, schemaRegistry])

	// Rows loaded for another relation (a different parent) are never shown, not even as stale.
	const shownState = listState.scopeKey === scopeKey ? listState : INITIAL_LIST_STATE

	// ---- Build items from state ----
	const items = useMemo((): EntityAccessor<TEntity>[] => {
		if (shownState.status !== 'ready') return []
		return shownState.items.map((item) =>
			EntityHandle.create<TEntity>(
				item.id,
				targetEntityType,
				store,
				dispatcher,
				schemaRegistry as SchemaRegistry<Record<string, object>>,
			) as unknown as EntityAccessor<TEntity>,
		)
	}, [shownState, targetEntityType, store, dispatcher, schemaRegistry])

	const itemCount = items.length

	// Derived in render: on the render that changes the request, the rows already answer an earlier one.
	const loaderState = resolveLoaderState(shownState.status, shownState.requestKey !== requestKey)

	const countKey = useMemo(
		() => JSON.stringify([parentEntityType, parentEntityId, fieldName, setup.combinedFilter ?? {}]),
		[parentEntityType, parentEntityId, fieldName, setup.combinedFilter],
	)
	usePagingTotalCount(setup.paging, {
		countedTotal: shownState.totalCount ?? null,
		countKey,
		isPageCurrent: shownState.status === 'ready' && shownState.optionsKey === optionsKey,
		pageItemCount: itemCount,
	})

	// ---- Row highlighting ----
	const [highlightIndex, setHighlightIndex] = useState<number | null>(null)

	useEffect(() => {
		setHighlightIndex(null)
	}, [items])

	// ---- Unpaged read of the same parent-scoped relation ----
	const fetchAllData = useCallback<DataViewFetchAllData>(async () => {
		const { alias, query } = buildHasManyRelationQuery({
			parentEntityType,
			parentEntityId,
			fieldName,
			filter: setup.combinedFilter,
			orderBy: setup.sorting.resolvedOrderBy,
			targetSpec: buildQueryFromSelection(setup.selection),
		})

		const result = await batcher.enqueue(query)
		if (result.type !== 'get' || !result.data) return null

		return extractHasManyRelationRows(result.data, { alias, fieldName })?.rows ?? null
	}, [parentEntityType, parentEntityId, fieldName, setup.combinedFilter, setup.sorting.resolvedOrderBy, setup.selection, batcher])

	const contextValue = useMemo((): DataViewContextValue => ({
		filtering: setup.filtering,
		sorting: setup.sorting,
		paging: setup.paging,
		selection: setup.selectionState,
		columns: setup.columns,
		entityType: targetEntityType,
		items,
		itemCount,
		loaderState,
		reload,
		highlightIndex,
		setHighlightIndex,
		selectionMeta: setup.selection,
		fetchAllData,
		toolbarContent: setup.toolbarContent,
		layoutRenders: setup.layoutRenders,
		layoutElements: setup.layoutElements,
	}), [setup.filtering, setup.sorting, setup.paging, setup.selectionState, setup.columns, targetEntityType, items, itemCount, loaderState, reload, highlightIndex, setup.selection, fetchAllData, setup.toolbarContent, setup.layoutRenders, setup.layoutElements])

	return (
		<DataViewProvider value={contextValue}>
			{setup.childrenJsx}
		</DataViewProvider>
	)
}

// ============================================================================
// Export
// ============================================================================

export const HasManyDataGrid = memo(HasManyDataGridImpl) as unknown as typeof HasManyDataGridImpl
