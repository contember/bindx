import { useEffect, useMemo } from 'react'
import type { EntityAccessor, HasManyRef, AnyBrand } from '@contember/bindx'
import { sortEntities } from '../utils/sortEntities.js'
import { repairEntitiesOrder } from '../utils/repairEntitiesOrder.js'

/**
 * Hook that returns sorted items from a has-many ref and repairs order field values.
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
	hasMany: HasManyRef<T, S, TBrand, TEntityName, TSchema>,
	orderField: string | undefined,
): EntityAccessor<T, S, TBrand, TEntityName, TSchema>[] {
	const rawItems = hasMany?.items
	const items = Array.isArray(rawItems) ? rawItems : []

	const sortedItems = useMemo(
		() => sortEntities(items, orderField) as EntityAccessor<T, S, TBrand, TEntityName, TSchema>[],
		[items, orderField],
	)

	useEffect(() => {
		if (!orderField) {
			return
		}
		repairEntitiesOrder(sortedItems, orderField)
	}, [orderField, sortedItems])

	return sortedItems
}
