import type { EntityAccessor, FieldRef } from '@contember/bindx'

/**
 * Sorts entities by a numeric order field.
 * Returns a new sorted array.
 *
 * @param items - Array of entity accessors
 * @param orderField - Name of the numeric field to sort by
 * @returns New sorted array of entities
 */
export function sortEntities<T extends object, S = T>(
	items: EntityAccessor<T, S>[],
	orderField: string | undefined,
): EntityAccessor<T, S>[] {
	if (!orderField) {
		return items
	}

	if (!Array.isArray(items)) {
		return []
	}
	return [...items].sort((a, b) => {
		const aField = (a as Record<string, unknown>)[orderField] as FieldRef<number> | undefined
		const bField = (b as Record<string, unknown>)[orderField] as FieldRef<number> | undefined

		const aValue = aField?.value ?? Number.MAX_SAFE_INTEGER
		const bValue = bField?.value ?? Number.MAX_SAFE_INTEGER

		return aValue - bValue
	})
}
