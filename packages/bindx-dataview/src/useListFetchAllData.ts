/**
 * Unpaged fetch-all for views that load through a root list query.
 */

import { useCallback } from 'react'
import { buildQueryFromSelection } from '@contember/bindx'
import type { ListQuery, SelectionMeta } from '@contember/bindx'
import { useBindxContext } from '@contember/bindx-react'
import type { DataViewFetchAllData } from './DataViewContext.js'

export interface ListFetchAllDataOptions {
	/** Entity the view lists */
	readonly entityType: string
	/** Full scope of the view — static filter combined with the user filters */
	readonly filter: Record<string, unknown> | undefined
	readonly orderBy: readonly Record<string, unknown>[] | undefined
	readonly selection: SelectionMeta
}

export function useListFetchAllData({ entityType, filter, orderBy, selection }: ListFetchAllDataOptions): DataViewFetchAllData {
	const { adapter } = useBindxContext()

	return useCallback(async (): Promise<readonly Record<string, unknown>[] | null> => {
		const listQuery: ListQuery = {
			type: 'list',
			entityType,
			filter,
			orderBy,
			limit: undefined,
			offset: undefined,
			spec: buildQueryFromSelection(selection),
		}

		const results = await adapter.query([listQuery])
		const result = results[0]
		return result?.type === 'list' ? result.data : null
	}, [adapter, entityType, filter, orderBy, selection])
}
