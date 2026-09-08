import { useMemo } from 'react'
import type { EntityAccessor, HasManyAccessor, AnyBrand } from '@contember/bindx'
import { sortEntities } from '../utils/sortEntities.js'

/**
 * Hook that returns sorted items from a has-many ref.
 *
 * Read-only — renumbering sparse order values belongs to the operations that change order.
 *
 * @param hasMany - The has-many ref
 * @param orderField - Optional field name for sorting
 * @returns Sorted array of entity accessors
 */
export function useSortedItems<
	T extends object,
	S = T,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
>(
	hasMany: HasManyAccessor<T, S, TBrand, TEntityName, TSchema>,
	orderField: string | undefined,
): EntityAccessor<T, S, TBrand, TEntityName, TSchema>[] {
	const rawItems = hasMany?.items
	const items = Array.isArray(rawItems) ? rawItems : []

	return useMemo(
		() => sortEntities(items, orderField) as EntityAccessor<T, S, TBrand, TEntityName, TSchema>[],
		[items, orderField],
	)
}
