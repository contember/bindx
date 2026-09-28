import { useEffect } from 'react'
import type { PagingStateResult } from './useDataViewState.js'

export interface LoadedPage {
	/** Whether the rows answer the current query: filter, order, limit and offset. */
	readonly isCurrent: boolean
	readonly itemCount: number
}

/**
 * Feeds the paging state its total: the counted total when the data source reports one,
 * otherwise the total implied by a page shorter than the limit.
 *
 * Only a page that answers the current query implies a total. An empty page past offset 0
 * implies its offset, an upper bound, so the clamp moves back one page to a page that may still hold rows.
 */
export function usePagingTotalCount(paging: PagingStateResult, countedTotal: number | null, page: LoadedPage): void {
	const { setTotalCount, queryLimit, queryOffset } = paging
	const { isCurrent, itemCount } = page

	useEffect(() => {
		if (countedTotal !== null) {
			setTotalCount(countedTotal)
			return
		}
		if (!isCurrent || queryLimit === undefined || queryOffset === undefined || itemCount >= queryLimit) {
			return
		}
		setTotalCount(queryOffset + itemCount)
	}, [countedTotal, isCurrent, itemCount, queryLimit, queryOffset, setTotalCount])
}
