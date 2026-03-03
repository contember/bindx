import { useRef } from 'react'
import {
	resolveSelectionMeta,
	buildQueryFromSelection,
	type SelectionInput,
	type SelectionMeta,
} from '@contember/bindx'

/**
 * Resolves a SelectionInput to SelectionMeta with referential stability.
 *
 * Always resolves the latest definer on every render, but returns a stable
 * object reference when the resulting query structure hasn't changed.
 * This fixes the memoization bug where changing the definer had no effect,
 * while avoiding unnecessary re-fetches from inline function references.
 */
export function useStableSelectionMeta<TModel, TResult extends object>(
	definer: SelectionInput<TModel, TResult>,
): SelectionMeta {
	const resolvedMeta = resolveSelectionMeta(definer)
	const queryKey = JSON.stringify(buildQueryFromSelection(resolvedMeta))
	const ref = useRef<{ meta: SelectionMeta; queryKey: string }>({ meta: resolvedMeta, queryKey })

	if (queryKey !== ref.current.queryKey) {
		ref.current = { meta: resolvedMeta, queryKey }
	}

	return ref.current.meta
}
