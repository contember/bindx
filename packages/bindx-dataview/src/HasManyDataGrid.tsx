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
	generateHasManyAlias,
	EntityHandle,
	setEntityData,
} from '@contember/bindx'
import type { SchemaRegistry } from '@contember/bindx'
import type { StateStorageOrName } from './stateStorage.js'
import {
	useBindxContext,
} from '@contember/bindx-react'
import { useDataViewKey } from './DataViewKeyProvider.js'
import { DataViewProvider, type DataViewContextValue, type DataViewLoaderState } from './DataViewContext.js'
import { useDataGridSetup } from './useDataGridSetup.js'

// ============================================================================
// Props
// ============================================================================

export interface HasManyDataGridProps<TEntity extends object = object> {
	/** Has-many relation field from parent entity */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
}

const INITIAL_LIST_STATE: ListState = { status: 'loading', items: [] }

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
	const hasLoadedOnce = useRef(false)
	const [loaderState, setLoaderState] = useState<DataViewLoaderState>('initial')
	const [listState, setListState] = useState<ListState>(INITIAL_LIST_STATE)

	// ---- Build relation query spec ----
	const alias = useMemo(
		() => generateHasManyAlias(fieldName, {
			filter: setup.combinedFilter,
			orderBy: setup.sorting.resolvedOrderBy as unknown[],
			limit: setup.paging.queryLimit,
			offset: setup.paging.queryOffset,
		}),
		[fieldName, setup.combinedFilter, setup.sorting.resolvedOrderBy, setup.paging.queryLimit, setup.paging.queryOffset],
	)

	const optionsKey = useMemo(
		() => JSON.stringify({
			filter: setup.combinedFilter ?? {},
			orderBy: setup.sorting.resolvedOrderBy ?? [],
			limit: setup.paging.queryLimit,
			offset: setup.paging.queryOffset,
		}),
		[setup.combinedFilter, setup.sorting.resolvedOrderBy, setup.paging.queryLimit, setup.paging.queryOffset],
	)

	// ---- Data loading via GetQuery on parent ----
	useEffect(() => {
		const abortController = new AbortController()
		setListState(INITIAL_LIST_STATE)

		const fetchData = async (): Promise<void> => {
			try {
				const targetSpec = buildQueryFromSelection(setup.selection)
				const currentOptions = JSON.parse(optionsKey) as {
					filter: Record<string, unknown>
					orderBy: readonly Record<string, unknown>[]
					limit?: number
					offset?: number
				}

				const parentSpec = {
					fields: [
						{ name: 'id', sourcePath: ['id'] },
						{
							name: alias,
							sourcePath: [fieldName],
							isArray: true as const,
							totalCount: true,
							filter: Object.keys(currentOptions.filter).length > 0 ? currentOptions.filter : undefined,
							orderBy: currentOptions.orderBy.length > 0 ? currentOptions.orderBy : undefined,
							limit: currentOptions.limit,
							offset: currentOptions.offset,
							nested: targetSpec,
						},
					],
				}

				const result = await batcher.enqueue(
					{
						type: 'get',
						entityType: parentEntityType,
						by: { id: parentEntityId },
						spec: parentSpec,
					},
					{ signal: abortController.signal },
				)

				if (abortController.signal.aborted) return

				if (result.type !== 'get' || !result.data) {
					setListState({ status: 'error', items: [] })
					return
				}

				const relationData = (result.data[alias] ?? result.data[fieldName]) as Array<Record<string, unknown>> | undefined
				const totalCount = Array.isArray(relationData) && 'totalCount' in relationData
					? (relationData as unknown as { totalCount: number }).totalCount
					: undefined

				if (!Array.isArray(relationData)) {
					setListState({ status: 'ready', items: [], totalCount })
					return
				}

				const items = relationData.map((data: Record<string, unknown>) => {
					const id = data['id'] as string
					dispatcher.dispatch(
						setEntityData(targetEntityType, id, data, true),
					)
					return { id, data: data as object }
				})

				setListState({ status: 'ready', items, totalCount })
			} catch (error) {
				if (abortController.signal.aborted) return
				setListState({ status: 'error', items: [] })
			}
		}

		fetchData()

		return () => {
			abortController.abort()
		}
	}, [parentEntityType, parentEntityId, fieldName, targetEntityType, alias, optionsKey, setup.selection, batcher, dispatcher, store])

	// ---- Build items from state ----
	const items = useMemo((): EntityAccessor<TEntity>[] => {
		if (listState.status !== 'ready') return []
		return listState.items.map((item) =>
			EntityHandle.create<TEntity>(
				item.id,
				targetEntityType,
				store,
				dispatcher,
				schemaRegistry as SchemaRegistry<Record<string, object>>,
			) as unknown as EntityAccessor<TEntity>,
		)
	}, [listState, targetEntityType, store, dispatcher, schemaRegistry])

	const itemCount = items.length

	// Update loader state
	useEffect(() => {
		if (listState.status === 'ready') {
			hasLoadedOnce.current = true
			setLoaderState('loaded')
		} else if (listState.status === 'error') {
			setLoaderState('failed')
		} else if (listState.status === 'loading') {
			setLoaderState(hasLoadedOnce.current ? 'refreshing' : 'initial')
		}
	}, [listState.status])

	// Update total count from paginateRelation
	useEffect(() => {
		if (listState.totalCount !== undefined) {
			setup.paging.setTotalCount(listState.totalCount)
		} else if (listState.status === 'ready' && setup.paging.queryLimit !== undefined && setup.paging.queryOffset !== undefined && itemCount < setup.paging.queryLimit) {
			setup.paging.setTotalCount(setup.paging.queryOffset + itemCount)
		}
	}, [listState.status, listState.totalCount, itemCount, setup.paging.queryLimit, setup.paging.queryOffset, setup.paging.setTotalCount])

	// ---- Reload ----
	const [, setReloadCounter] = useState(0)
	const reload = useCallback((): void => {
		setReloadCounter(c => c + 1)
	}, [])

	// ---- Row highlighting ----
	const [highlightIndex, setHighlightIndex] = useState<number | null>(null)

	useEffect(() => {
		setHighlightIndex(null)
	}, [items])

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
		toolbarContent: setup.toolbarContent,
		layoutRenders: setup.layoutRenders,
		layoutElements: setup.layoutElements,
	}), [setup.filtering, setup.sorting, setup.paging, setup.selectionState, setup.columns, targetEntityType, items, itemCount, loaderState, reload, highlightIndex, setup.selection, setup.toolbarContent, setup.layoutRenders, setup.layoutElements])

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
