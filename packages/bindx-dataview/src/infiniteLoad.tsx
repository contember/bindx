/**
 * Infinite scroll / load-more components using Radix Slot.
 *
 * Usage:
 * ```tsx
 * <DataViewInfiniteLoadProvider>
 *   <DataViewEachRow>
 *     {(item) => <div>{item.title}</div>}
 *   </DataViewEachRow>
 *   <DataViewInfiniteLoadTrigger>
 *     <button>Load More</button>
 *   </DataViewInfiniteLoadTrigger>
 *   <DataViewInfiniteLoadScrollObserver />
 * </DataViewInfiniteLoadProvider>
 * ```
 */

import React, { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { composeEventHandlers } from '@radix-ui/primitive'
import { DataViewProvider, useDataViewContext, type DataViewContextValue, type DataViewItem } from './DataViewContext.js'

// ============================================================================
// Context
// ============================================================================

interface InfiniteLoadContextValue {
	readonly pages: readonly PageData[]
	readonly loadMore: (() => void) | undefined
	readonly isLoadingMore: boolean
}

interface PageData {
	readonly offset: number
	readonly items: readonly DataViewItem[]
}

/** Pages loaded before the current one, for the query (filter, order, page size) they belong to. */
interface StoredPages {
	readonly queryKey: string
	readonly pages: readonly PageData[]
}

const InfiniteLoadContext = createContext<InfiniteLoadContextValue | null>(null)

function useInfiniteLoadContext(): InfiniteLoadContextValue {
	const ctx = useContext(InfiniteLoadContext)
	if (!ctx) {
		throw new Error('useInfiniteLoadContext must be used within DataViewInfiniteLoadProvider')
	}
	return ctx
}

/** The stored pages that run from the first row up to the current offset, or none when the view jumped. */
function pagesBefore(pages: readonly PageData[], offset: number | undefined, limit: number | undefined): readonly PageData[] {
	if (offset === undefined || limit === undefined) return []
	const run = pages.filter(page => page.offset < offset)
	const isContiguous = run.length * limit === offset && run.every((page, index) => page.offset === index * limit)
	return isContiguous ? run : []
}

function joinPages(pages: readonly PageData[], currentItems: readonly DataViewItem[]): readonly DataViewItem[] {
	if (pages.length === 0) return currentItems
	const seen = new Set<string>()
	const items: DataViewItem[] = []
	for (const item of [...pages.flatMap(page => page.items), ...currentItems]) {
		if (seen.has(item.id)) continue
		seen.add(item.id)
		items.push(item)
	}
	return items
}

// ============================================================================
// Provider
// ============================================================================

export interface DataViewInfiniteLoadProviderProps {
	children: React.ReactNode
}

/**
 * Shows the pages loaded so far as one list: its children see the stored pages plus the current one
 * as the data view's `items`. `loadMore` stores the current page and moves the view to the next one;
 * `reload` loads the list again from the first page. Only descendants get that `reload`: one above
 * the provider refetches the view's current page alone.
 */
export function DataViewInfiniteLoadProvider({
	children,
}: DataViewInfiniteLoadProviderProps): ReactElement {
	const dataView = useDataViewContext()
	const { paging, filtering, sorting, items, loaderState, reload: reloadPage } = dataView
	const { queryOffset: offset, queryLimit: limit, hasNext, next, first } = paging
	const queryKey = JSON.stringify([filtering.resolvedWhere ?? null, sorting.resolvedOrderBy ?? null, limit ?? null])

	const [stored, setStored] = useState<StoredPages>({ queryKey, pages: [] })
	const pages = useMemo(
		() => pagesBefore(stored.queryKey === queryKey ? stored.pages : [], offset, limit),
		[stored, queryKey, offset, limit],
	)

	// The rows on screen answer the current offset only once the view has loaded it.
	const isPageLoaded = loaderState === 'loaded'
	const isLoadingMore = loaderState === 'initial' || loaderState === 'refreshing'

	// Two calls before the next render must request one page.
	const requestedFromRef = useRef<string | null>(null)
	const requestKey = `${queryKey}@${offset ?? ''}`
	useEffect(() => {
		requestedFromRef.current = null
	}, [requestKey, loaderState])

	const loadMore = useMemo((): (() => void) | undefined => {
		if (!hasNext || offset === undefined) return undefined
		return () => {
			if (!isPageLoaded || requestedFromRef.current === requestKey) return
			requestedFromRef.current = requestKey
			const currentPage: PageData = { offset, items }
			setStored({ queryKey, pages: [...pages, currentPage] })
			next()
		}
	}, [hasNext, isPageLoaded, offset, requestKey, queryKey, pages, items, next])

	// The list shown when a reload started stays on screen until the first page lands.
	const [reloadedList, setReloadedList] = useState<readonly DataViewItem[] | null>(null)
	if (reloadedList !== null && !isLoadingMore) {
		setReloadedList(null)
	}

	const joinedItems = useMemo(() => joinPages(pages, items), [pages, items])
	const shownItems = reloadedList ?? joinedItems

	// The view refetches only its current page, so a reload starts the list again from the first one.
	const reload = useCallback((): void => {
		// A reload during a reload keeps the list shown at the first one.
		setReloadedList(current => current ?? joinedItems)
		setStored({ queryKey, pages: [] })
		first()
		reloadPage()
	}, [joinedItems, queryKey, first, reloadPage])

	const dataViewValue = useMemo(
		(): DataViewContextValue => ({ ...dataView, items: shownItems, itemCount: shownItems.length, reload }),
		[dataView, shownItems, reload],
	)

	const contextValue = useMemo((): InfiniteLoadContextValue => ({
		pages,
		loadMore,
		isLoadingMore,
	}), [pages, loadMore, isLoadingMore])

	return (
		<DataViewProvider value={dataViewValue}>
			<InfiniteLoadContext.Provider value={contextValue}>
				{children}
			</InfiniteLoadContext.Provider>
		</DataViewProvider>
	)
}

// ============================================================================
// Load More Trigger — Slot-based
// ============================================================================

export interface DataViewInfiniteLoadTriggerProps {
	children: ReactElement
}

export const DataViewInfiniteLoadTrigger = forwardRef<HTMLButtonElement, DataViewInfiniteLoadTriggerProps>(
	(props, ref) => {
		const { loadMore, isLoadingMore } = useInfiniteLoadContext()

		if (!loadMore) return null

		const { onClick, ...otherProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactElement }

		return (
			<Slot
				ref={ref}
				onClick={composeEventHandlers(onClick, loadMore)}
				disabled={isLoadingMore}
				data-state={isLoadingMore ? 'loading' : 'idle'}
				{...otherProps}
			/>
		)
	},
)
DataViewInfiniteLoadTrigger.displayName = 'DataViewInfiniteLoadTrigger'

// ============================================================================
// Scroll Observer (auto-trigger)
// ============================================================================

export interface DataViewInfiniteLoadScrollObserverProps {
	/** Root margin for IntersectionObserver. Default: '200px' */
	rootMargin?: string
}

export function DataViewInfiniteLoadScrollObserver({
	rootMargin = '200px',
}: DataViewInfiniteLoadScrollObserverProps = {}): ReactElement {
	const { loadMore, isLoadingMore } = useInfiniteLoadContext()
	const sentinelRef = useRef<HTMLSpanElement>(null)

	useEffect(() => {
		const el = sentinelRef.current
		if (!el || !loadMore || isLoadingMore) return

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting && loadMore) {
					loadMore()
				}
			},
			{ rootMargin },
		)

		observer.observe(el)
		return () => observer.disconnect()
	}, [loadMore, isLoadingMore, rootMargin])

	return <span ref={sentinelRef} data-testid="infinite-load-sentinel" />
}

// ============================================================================
// Hooks
// ============================================================================

export function useDataViewInfiniteLoadTrigger(): (() => void) | undefined {
	return useInfiniteLoadContext().loadMore
}
