import type { QueryFieldSpec } from '../selection/buildQuery.js'

/**
 * MockQueryEngine provides in-memory query operations for MockAdapter.
 * Extracted for better testability and separation of concerns.
 *
 * Supports:
 * - Filtering with various operators (eq, notEq, in, lt, gt, contains, etc.)
 * - Ordering with multi-field support and null handling
 * - Pagination (offset/limit)
 * - Field projection with nested relation support
 */
export class MockQueryEngine {
	/**
	 * Filters entities based on a filter object.
	 */
	filter(
		entities: Record<string, unknown>[],
		filter: Record<string, unknown>,
	): Record<string, unknown>[] {
		return entities.filter(entity => this.matchesFilter(entity, filter))
	}

	/**
	 * Orders entities based on orderBy specifications.
	 */
	orderBy(
		entities: Record<string, unknown>[],
		orderBy: readonly Record<string, unknown>[],
	): Record<string, unknown>[] {
		return [...entities].sort((a, b) => {
			for (const order of orderBy) {
				for (const [field, direction] of Object.entries(order)) {
					if (field.startsWith('_')) continue // Skip _random, _randomSeeded
					const aVal = a[field]
					const bVal = b[field]

					let comparison = 0
					if (aVal === bVal) comparison = 0
					else if (aVal === null || aVal === undefined) comparison = 1
					else if (bVal === null || bVal === undefined) comparison = -1
					else if (aVal < bVal) comparison = -1
					else comparison = 1

					if (direction === 'desc' || direction === 'descNullsLast') {
						comparison = -comparison
					}

					if (comparison !== 0) return comparison
				}
			}
			return 0
		})
	}

	/**
	 * Paginates entities using offset and limit.
	 */
	paginate(
		entities: Record<string, unknown>[],
		offset?: number,
		limit?: number,
	): Record<string, unknown>[] {
		let result = entities
		if (offset !== undefined) {
			result = result.slice(offset)
		}
		if (limit !== undefined) {
			result = result.slice(0, limit)
		}
		return result
	}

	/**
	 * Projects only the requested fields from source data.
	 * Supports nested relations (hasOne and hasMany).
	 */
	projectFields(
		source: Record<string, unknown>,
		fields: QueryFieldSpec[],
		basePath: string[] = [],
	): Record<string, unknown> {
		const result: Record<string, unknown> = {}

		for (const field of fields) {
			// Get relative path by removing the base path prefix
			const relativePath = field.sourcePath.slice(basePath.length)
			const value = this.getNestedValue(source, relativePath)

			if (field.nested && Array.isArray(value)) {
				// Has-many relation — apply filter/orderBy/limit/offset, return flat array + metadata
				let items = value as Record<string, unknown>[]
				if (field.filter) {
					items = this.filter(items, field.filter as Record<string, unknown>)
				}
				if (field.orderBy) {
					items = this.orderBy(items, field.orderBy as readonly Record<string, unknown>[])
				}
				const totalCount = items.length
				if (field.limit !== undefined || field.offset !== undefined) {
					items = this.paginate(items, field.offset, field.limit)
				}
				const projected = items.map(item =>
					this.projectFields(item as Record<string, unknown>, field.nested!.fields, []),
				)
				if (field.totalCount) {
					Object.defineProperty(projected, 'totalCount', {
						value: totalCount,
						enumerable: false,
						writable: false,
					})
				}
				result[field.name] = projected
			} else if (field.nested && value && typeof value === 'object') {
				// Project nested object (has-one relation)
				result[field.name] = this.projectFields(
					value as Record<string, unknown>,
					field.nested.fields,
					[],
				)
			} else {
				// Scalar or leaf value
				result[field.name] = value
			}
		}

		return result
	}

	/**
	 * Checks if an entity matches a filter.
	 */
	private matchesFilter(entity: Record<string, unknown>, filter: Record<string, unknown>): boolean {
		for (const [key, condition] of Object.entries(filter)) {
			if (key === 'and' && Array.isArray(condition)) {
				if (!condition.every(c => this.matchesFilter(entity, c as Record<string, unknown>))) {
					return false
				}
				continue
			}
			if (key === 'or' && Array.isArray(condition)) {
				if (!condition.some(c => this.matchesFilter(entity, c as Record<string, unknown>))) {
					return false
				}
				continue
			}
			if (key === 'not' && condition && typeof condition === 'object') {
				if (this.matchesFilter(entity, condition as Record<string, unknown>)) {
					return false
				}
				continue
			}

			const fieldValue = entity[key]
			if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
				// It's a condition object like { eq: 'value' }
				if (!this.matchesCondition(fieldValue, condition as Record<string, unknown>)) {
					return false
				}
			} else {
				// Direct value comparison (for backward compatibility)
				if (fieldValue !== condition) {
					return false
				}
			}
		}
		return true
	}

	/**
	 * Checks if a value matches a condition object.
	 */
	private matchesCondition(value: unknown, condition: Record<string, unknown>): boolean {
		for (const [op, expected] of Object.entries(condition)) {
			switch (op) {
				case 'eq':
					if (value !== expected) return false
					break
				case 'notEq':
					if (value === expected) return false
					break
				case 'in':
					if (!Array.isArray(expected) || !expected.includes(value)) return false
					break
				case 'notIn':
					if (Array.isArray(expected) && expected.includes(value)) return false
					break
				case 'lt':
					if (typeof value !== 'number' || typeof expected !== 'number' || value >= expected) return false
					break
				case 'lte':
					if (typeof value !== 'number' || typeof expected !== 'number' || value > expected) return false
					break
				case 'gt':
					if (typeof value !== 'number' || typeof expected !== 'number' || value <= expected) return false
					break
				case 'gte':
					if (typeof value !== 'number' || typeof expected !== 'number' || value < expected) return false
					break
				case 'isNull':
					if (expected === true && value !== null && value !== undefined) return false
					if (expected === false && (value === null || value === undefined)) return false
					break
				case 'contains':
					if (typeof value !== 'string' || typeof expected !== 'string' || !value.includes(expected)) return false
					break
				case 'startsWith':
					if (typeof value !== 'string' || typeof expected !== 'string' || !value.startsWith(expected)) return false
					break
				case 'endsWith':
					if (typeof value !== 'string' || typeof expected !== 'string' || !value.endsWith(expected)) return false
					break
				case 'containsCI':
					if (typeof value !== 'string' || typeof expected !== 'string' || !value.toLowerCase().includes(expected.toLowerCase())) return false
					break
			}
		}
		return true
	}

	/**
	 * Gets a nested value from an object using a path.
	 */
	private getNestedValue(obj: Record<string, unknown>, path: string[]): unknown {
		let current: unknown = obj

		for (const key of path) {
			if (current === null || current === undefined || typeof current !== 'object') {
				return undefined
			}
			current = (current as Record<string, unknown>)[key]
		}

		return current
	}
}
