import { useCallback, useMemo } from 'react'
import {
	FIELD_REF_META,
	type AnyBrand,
	type EntityAccessor,
	type HasManyAccessor,
	type HasManyConnectedEvent,
} from '@contember/bindx'
import { useOnFieldEvent, useSnapshotStore } from '@contember/bindx-react'
import { sortEntities } from '../utils/sortEntities.js'

/**
 * Hook that returns sorted items from a has-many ref.
 *
 * Rendering never writes: an item that joins the list gets its order value from the
 * connect event instead, so sparse values on existing rows are left as they are.
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
	const store = useSnapshotStore()
	const rawItems = hasMany?.items
	const items = Array.isArray(rawItems) ? rawItems : []

	const sortedItems = useMemo(
		() => sortEntities(items, orderField) as EntityAccessor<T, S, TBrand, TEntityName, TSchema>[],
		[items, orderField],
	)

	const meta = hasMany?.[FIELD_REF_META]
	const itemType = meta?.targetType

	const assignOrderToNewItem = useCallback((event: HasManyConnectedEvent): void => {
		if (orderField === undefined || itemType === undefined) return

		const added = store.getEntitySnapshot<Record<string, unknown>>(itemType, event.itemId)
		// An item already carrying an order keeps it — this only fills the gap.
		if (added === undefined) return
		const currentOrder = added.data[orderField]
		if (currentOrder !== undefined && currentOrder !== null) return

		// Read through the accessor so the live list is used, not the render snapshot:
		// several items added in one tick must not all land on the same order.
		let maxOrder = -1
		for (const item of hasMany.items) {
			const value = store.getEntitySnapshot<Record<string, unknown>>(itemType, item.id)?.data[orderField]
			if (typeof value === 'number' && value > maxOrder) {
				maxOrder = value
			}
		}

		store.setFieldValue(itemType, event.itemId, [orderField], maxOrder + 1)
	}, [store, hasMany, orderField, itemType])

	useOnFieldEvent(
		'hasMany:connected',
		meta?.entityType ?? '',
		meta?.entityId ?? '',
		meta?.fieldName ?? '',
		assignOrderToNewItem,
	)

	return sortedItems
}
