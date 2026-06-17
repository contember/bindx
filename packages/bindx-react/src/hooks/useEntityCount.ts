import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EntityDef } from '@contember/bindx'
import { useBindxContext } from './BackendAdapterContext.js'

// ============================================================================
// Options & result
// ============================================================================

export interface UseEntityCountOptions {
	/** Filter criteria — the count reflects rows matching this filter. */
	filter?: Record<string, unknown>
	/**
	 * Re-fetch the count whenever this value changes. Lets an external
	 * controller (e.g. a paging refresh button) force a recount without
	 * changing the filter.
	 */
	refreshToken?: number
}

export interface UseEntityCountResult {
	/** Total number of rows matching the filter, or `null` until first resolved. */
	readonly count: number | null
	/** Whether the count query is currently in flight. */
	readonly isLoading: boolean
	/** Re-issue the count query (e.g. after a mutation changes the row set). */
	refresh(): void
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Fetches the total number of entities matching a filter.
 *
 * Issued as a standalone count query (Contember `paginate<Entity>.pageInfo.totalCount`),
 * keyed only on the filter — not on pagination — so paging through a list does not
 * recompute the count. Batched into the same request as any sibling list query.
 */
export function useEntityCount(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	entity: EntityDef<any>,
	options: UseEntityCountOptions = {},
): UseEntityCountResult {
	const entityType = entity.$name
	const { batcher } = useBindxContext()

	const [count, setCount] = useState<number | null>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [refreshCounter, setRefreshCounter] = useState(0)

	const filterKey = useMemo(
		() => JSON.stringify(options.filter ?? {}),
		[options.filter],
	)

	const refresh = useCallback((): void => {
		setRefreshCounter(c => c + 1)
	}, [])

	useEffect(() => {
		const abortController = new AbortController()
		setIsLoading(true)

		const fetchCount = async (): Promise<void> => {
			try {
				const filter = JSON.parse(filterKey) as Record<string, unknown>
				const result = await batcher.enqueue(
					{
						type: 'count',
						entityType,
						filter: Object.keys(filter).length > 0 ? filter : undefined,
					},
					{ signal: abortController.signal },
				)

				if (abortController.signal.aborted) return
				if (result.type !== 'count') return

				setCount(result.count)
				setIsLoading(false)
			} catch (error) {
				if (abortController.signal.aborted) return
				setIsLoading(false)
			}
		}

		fetchCount()

		return () => {
			abortController.abort()
		}
	}, [entityType, filterKey, refreshCounter, options.refreshToken, batcher])

	return { count, isLoading, refresh }
}
