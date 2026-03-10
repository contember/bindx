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
import { useDataViewContext } from './DataViewContext.js'

// ============================================================================
// Context
// ============================================================================

interface InfiniteLoadContextValue {
	readonly pages: readonly PageData[]
	readonly loadMore: (() => void) | undefined
	readonly isLoadingMore: boolean
}

interface PageData {
	readonly items: readonly { id: string; data: Record<string, unknown> }[]
}

const InfiniteLoadContext = createContext<InfiniteLoadContextValue | null>(null)

function useInfiniteLoadContext(): InfiniteLoadContextValue {
	const ctx = useContext(InfiniteLoadContext)
	if (!ctx) {
		throw new Error('useInfiniteLoadContext must be used within DataViewInfiniteLoadProvider')
	}
	return ctx
}

// ============================================================================
// Provider
// ============================================================================

export interface DataViewInfiniteLoadProviderProps {
	children: React.ReactNode
}

export function DataViewInfiniteLoadProvider({
	children,
}: DataViewInfiniteLoadProviderProps): ReactElement {
	const { paging, filtering, sorting } = useDataViewContext()
	const [pages, setPages] = useState<PageData[]>([])
	const [isLoadingMore, setIsLoadingMore] = useState(false)

	const filterKey = JSON.stringify(filtering.resolvedWhere ?? null)
	const sortKey = JSON.stringify(sorting.resolvedOrderBy ?? null)

	const previousParams = useRef<{
		filterKey: string
		sortKey: string
		limit: number | undefined
		offset: number | undefined
	} | null>(null)

	const currentParams = useMemo(() => ({
		filterKey,
		sortKey,
		limit: paging.queryLimit,
		offset: paging.queryOffset,
	}), [filterKey, sortKey, paging.queryLimit, paging.queryOffset])

	useEffect(() => {
		const prev = previousParams.current
		if (!prev) {
			setPages([])
		} else if (
			prev.filterKey === currentParams.filterKey
			&& prev.sortKey === currentParams.sortKey
			&& prev.limit === currentParams.limit
			&& prev.limit !== undefined
			&& prev.offset !== undefined
			&& currentParams.offset === prev.offset + prev.limit
		) {
			setIsLoadingMore(true)
		} else {
			setPages([])
		}
		previousParams.current = currentParams
	}, [currentParams])

	const hasNext = paging.hasNext

	const loadMore = useMemo((): (() => void) | undefined => {
		if (!hasNext) return undefined
		return () => paging.next()
	}, [hasNext, paging])

	const contextValue = useMemo((): InfiniteLoadContextValue => ({
		pages,
		loadMore,
		isLoadingMore,
	}), [pages, loadMore, isLoadingMore])

	return (
		<InfiniteLoadContext.Provider value={contextValue}>
			{children}
		</InfiniteLoadContext.Provider>
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
