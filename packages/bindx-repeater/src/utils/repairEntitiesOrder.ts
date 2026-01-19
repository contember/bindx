import type { EntityAccessor, FieldRef } from '@contember/bindx'

/**
 * Repairs the order field values of entities to be sequential (0, 1, 2, ...).
 * Only updates values that differ from their expected index.
 *
 * @param items - Array of entity accessors (already sorted)
 * @param orderField - Name of the numeric field to update
 */
export function repairEntitiesOrder<T extends object, S = T>(
	items: EntityAccessor<T, S>[],
	orderField: string,
): void {
	for (let i = 0; i < items.length; i++) {
		const entity = items[i]!
		const field = (entity as Record<string, unknown>)[orderField] as FieldRef<number> | undefined

		if (field && field.value !== i) {
			field.setValue(i)
		}
	}
}
