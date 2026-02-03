import type { HasManyParams } from '../selection/SelectionScope.js'

/**
 * Generates an alias for a has-many relation based on field name and parameters.
 *
 * If no parameters are provided or all are undefined, returns the fieldName as-is.
 * Otherwise, generates a deterministic alias by hashing the parameters.
 *
 * @param fieldName - The original field name
 * @param params - Optional has-many parameters (filter, orderBy, limit, offset)
 * @returns The alias to use for this has-many relation
 *
 * @example
 * ```ts
 * // No params - returns fieldName
 * generateHasManyAlias('tags') // => 'tags'
 *
 * // With filter - generates unique alias
 * generateHasManyAlias('tags', { filter: { active: true } }) // => 'tags_a7x9k2'
 *
 * // Different params - different aliases
 * generateHasManyAlias('tags', { filter: { active: false } }) // => 'tags_b3m1p8'
 * ```
 */
export function generateHasManyAlias(fieldName: string, params?: HasManyParams): string {
	if (!params) {
		return fieldName
	}

	const { filter, orderBy, limit, offset } = params

	// If all params are undefined, return fieldName
	if (filter === undefined && orderBy === undefined && limit === undefined && offset === undefined) {
		return fieldName
	}

	// Serialize parameters deterministically
	const serialized = JSON.stringify({
		f: filter,
		o: orderBy,
		l: limit,
		s: offset,
	})

	// Simple djb2 hash algorithm
	let hash = 5381
	for (let i = 0; i < serialized.length; i++) {
		hash = ((hash << 5) + hash) + serialized.charCodeAt(i)
		hash = hash & hash // Convert to 32-bit integer
	}

	// Convert to base36 and take first 6 characters for compact representation
	const hashStr = Math.abs(hash).toString(36).slice(0, 6)

	return `${fieldName}_${hashStr}`
}
