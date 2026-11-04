import type { DataViewLoaderState } from './DataViewContext.js'

export type ListLoadStatus = 'loading' | 'error' | 'ready'

/**
 * Derives the loader state in render, so it always describes the rows rendered with it.
 * `refreshing` means the rows on screen answer an earlier query while the current one loads;
 * a load with no rows to show is `initial`.
 */
export function resolveLoaderState(status: ListLoadStatus, isRefetching: boolean): DataViewLoaderState {
	if (status === 'ready') return isRefetching ? 'refreshing' : 'loaded'
	if (status === 'error') return 'failed'
	return 'initial'
}
