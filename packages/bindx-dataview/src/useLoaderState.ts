import { useRef } from 'react'
import type { DataViewLoaderState } from './DataViewContext.js'

export type ListLoadStatus = 'loading' | 'error' | 'ready'

/**
 * Derives the loader state in render, so it always describes the rows rendered with it.
 * `isRefetching`: the rows on screen answer an earlier query while the current one loads.
 */
export function useLoaderState(status: ListLoadStatus, isRefetching: boolean): DataViewLoaderState {
	const hasLoadedOnce = useRef(false)
	if (status === 'ready') {
		hasLoadedOnce.current = true
		return isRefetching ? 'refreshing' : 'loaded'
	}
	if (status === 'error') return 'failed'
	return hasLoadedOnce.current ? 'refreshing' : 'initial'
}
