import { useEffect, useRef } from 'react'
import type { PagingStateResult } from './useDataViewState.js'

export interface PagingTotalSource {
	/** Total reported by the data source, or null when it reports none. */
	readonly countedTotal: number | null
	/** Identifies the counted row set (the filter); bounds learned for another row set are dropped. */
	readonly countKey: string
	/** Whether the loaded rows answer the current query: filter, order, limit and offset. */
	readonly isPageCurrent: boolean
	readonly pageItemCount: number
}

/** What the loaded pages prove about the total: `atLeast <= total <= atMost`. */
interface TotalBounds {
	readonly atLeast: number
	readonly atMost: number | null
}

interface LoadedPage {
	readonly offset: number
	readonly limit: number
	readonly itemCount: number
}

type PageOutcome =
	| { readonly type: 'total'; readonly totalCount: number }
	| { readonly type: 'probe'; readonly bounds: TotalBounds; readonly pageIndex: number }
	| { readonly type: 'unknown'; readonly bounds: TotalBounds }

const NO_BOUNDS: TotalBounds = { atLeast: 0, atMost: null }

/**
 * Feeds the paging state its total: the counted total when the data source reports one,
 * otherwise the total the loaded pages prove. Only a page that answers the current query counts.
 *
 * A page shorter than the limit ends the list. An empty page past offset 0 only bounds the total
 * from above, so the grid bisects between the bounds, one page per query, until a page ends the list.
 */
export function usePagingTotalCount(paging: PagingStateResult, source: PagingTotalSource): void {
	const { setTotalCount, goTo, queryLimit, queryOffset } = paging
	const { countedTotal, countKey, isPageCurrent, pageItemCount } = source
	const boundsRef = useRef<{ countKey: string; bounds: TotalBounds }>({ countKey, bounds: NO_BOUNDS })

	useEffect(() => {
		if (boundsRef.current.countKey !== countKey || countedTotal !== null) {
			boundsRef.current = { countKey, bounds: NO_BOUNDS }
		}
		if (countedTotal !== null) {
			setTotalCount(countedTotal)
			return
		}
		if (!isPageCurrent || queryLimit === undefined || queryOffset === undefined) {
			return
		}

		const outcome = inferTotalFromPage(boundsRef.current.bounds, { offset: queryOffset, limit: queryLimit, itemCount: pageItemCount })
		if (outcome.type === 'total') {
			boundsRef.current = { countKey, bounds: NO_BOUNDS }
			setTotalCount(outcome.totalCount)
			return
		}
		boundsRef.current = { countKey, bounds: outcome.bounds }
		if (outcome.type === 'probe') {
			goTo(outcome.pageIndex)
		}
	}, [countedTotal, countKey, isPageCurrent, pageItemCount, queryLimit, queryOffset, setTotalCount, goTo])
}

function inferTotalFromPage(bounds: TotalBounds, { offset, limit, itemCount }: LoadedPage): PageOutcome {
	const isEmptyPastStart = itemCount === 0 && offset > 0
	if (itemCount < limit && !isEmptyPastStart) {
		return { type: 'total', totalCount: offset + itemCount }
	}

	const narrowed: TotalBounds = isEmptyPastStart
		? { atLeast: bounds.atLeast, atMost: Math.min(bounds.atMost ?? offset, offset) }
		: { atLeast: Math.max(bounds.atLeast, offset + limit), atMost: bounds.atMost }

	if (narrowed.atMost === null) {
		return { type: 'unknown', bounds: narrowed }
	}
	if (narrowed.atLeast >= narrowed.atMost) {
		return { type: 'total', totalCount: narrowed.atMost }
	}
	// The page holding the middle row starts below `atMost` and ends above `atLeast`,
	// so whatever it returns halves the interval.
	const middleRow = Math.floor((narrowed.atLeast + narrowed.atMost) / 2)
	return { type: 'probe', bounds: narrowed, pageIndex: Math.floor(middleRow / limit) }
}
