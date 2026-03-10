/**
 * Built-in filter handler implementations.
 *
 * Each handler converts a typed filter artifact into a Contember-style
 * EntityWhere clause for use with the backend adapter.
 */

import type {
	FilterHandler,
	TextFilterArtifact,
	NumberFilterArtifact,
	NumberRangeFilterArtifact,
	DateFilterArtifact,
	BooleanFilterArtifact,
	EnumFilterArtifact,
	EnumListFilterArtifact,
	RelationFilterArtifact,
	IsDefinedFilterArtifact,
} from './types.js'

// ============================================================================
// Text Filter
// ============================================================================

export function createTextFilterHandler(fieldPath: string): FilterHandler<TextFilterArtifact> {
	return {
		defaultArtifact(): TextFilterArtifact {
			return { mode: 'contains', query: '' }
		},

		isActive(artifact: TextFilterArtifact): boolean {
			return artifact.query.length > 0 || artifact.nullCondition !== undefined
		},

		toWhere(artifact: TextFilterArtifact): Record<string, unknown> | undefined {
			if (!this.isActive(artifact)) return undefined

			const conditions: Record<string, unknown>[] = []

			if (artifact.query.length > 0) {
				const fieldCondition = buildTextCondition(artifact.mode, artifact.query)
				conditions.push(buildNestedWhere(fieldPath, fieldCondition))
			}

			if (artifact.nullCondition !== undefined) {
				conditions.push(buildNestedWhere(fieldPath, { isNull: artifact.nullCondition }))
			}

			if (conditions.length === 0) return undefined
			if (conditions.length === 1) return conditions[0]
			return { and: conditions }
		},
	}
}

function buildTextCondition(mode: TextFilterArtifact['mode'], query: string): Record<string, unknown> {
	switch (mode) {
		case 'contains':
			return { containsCI: query }
		case 'startsWith':
			return { startsWithCI: query }
		case 'endsWith':
			return { endsWithCI: query }
		case 'equals':
			return { eq: query }
		case 'notContains':
			return { not: { containsCI: query } }
	}
}

// ============================================================================
// Full Text Filter (across multiple fields)
// ============================================================================

export function createFullTextFilterHandler(fieldPaths: readonly string[]): FilterHandler<TextFilterArtifact> {
	return {
		defaultArtifact(): TextFilterArtifact {
			return { mode: 'contains', query: '' }
		},

		isActive(artifact: TextFilterArtifact): boolean {
			return artifact.query.length > 0
		},

		toWhere(artifact: TextFilterArtifact): Record<string, unknown> | undefined {
			if (!this.isActive(artifact)) return undefined

			const conditions = fieldPaths.map(fieldPath => {
				const fieldCondition = buildTextCondition(artifact.mode, artifact.query)
				return buildNestedWhere(fieldPath, fieldCondition)
			})

			if (conditions.length === 0) return undefined
			if (conditions.length === 1) return conditions[0]
			return { or: conditions }
		},
	}
}

// ============================================================================
// Number Filter
// ============================================================================

export function createNumberFilterHandler(fieldPath: string): FilterHandler<NumberFilterArtifact> {
	return {
		defaultArtifact(): NumberFilterArtifact {
			return { mode: 'eq', value: null }
		},

		isActive(artifact: NumberFilterArtifact): boolean {
			return artifact.value !== null || artifact.nullCondition !== undefined
		},

		toWhere(artifact: NumberFilterArtifact): Record<string, unknown> | undefined {
			if (!this.isActive(artifact)) return undefined

			const conditions: Record<string, unknown>[] = []

			if (artifact.value !== null) {
				conditions.push(buildNestedWhere(fieldPath, { [artifact.mode]: artifact.value }))
			}

			if (artifact.nullCondition !== undefined) {
				conditions.push(buildNestedWhere(fieldPath, { isNull: artifact.nullCondition }))
			}

			if (conditions.length === 0) return undefined
			if (conditions.length === 1) return conditions[0]
			return { and: conditions }
		},
	}
}

// ============================================================================
// Number Range Filter
// ============================================================================

export function createNumberRangeFilterHandler(fieldPath: string): FilterHandler<NumberRangeFilterArtifact> {
	return {
		defaultArtifact(): NumberRangeFilterArtifact {
			return { min: null, max: null }
		},

		isActive(artifact: NumberRangeFilterArtifact): boolean {
			return artifact.min !== null || artifact.max !== null || artifact.nullCondition !== undefined
		},

		toWhere(artifact: NumberRangeFilterArtifact): Record<string, unknown> | undefined {
			if (!this.isActive(artifact)) return undefined

			const conditions: Record<string, unknown>[] = []

			if (artifact.min !== null) {
				conditions.push(buildNestedWhere(fieldPath, { gte: artifact.min }))
			}

			if (artifact.max !== null) {
				conditions.push(buildNestedWhere(fieldPath, { lte: artifact.max }))
			}

			if (artifact.nullCondition !== undefined) {
				conditions.push(buildNestedWhere(fieldPath, { isNull: artifact.nullCondition }))
			}

			if (conditions.length === 0) return undefined
			if (conditions.length === 1) return conditions[0]
			return { and: conditions }
		},
	}
}

// ============================================================================
// Date Filter
// ============================================================================

export function createDateFilterHandler(fieldPath: string): FilterHandler<DateFilterArtifact> {
	return {
		defaultArtifact(): DateFilterArtifact {
			return { start: null, end: null }
		},

		isActive(artifact: DateFilterArtifact): boolean {
			return artifact.start !== null || artifact.end !== null || artifact.nullCondition !== undefined
		},

		toWhere(artifact: DateFilterArtifact): Record<string, unknown> | undefined {
			if (!this.isActive(artifact)) return undefined

			const conditions: Record<string, unknown>[] = []

			if (artifact.start !== null) {
				const normalized = new Date(artifact.start + 'T00:00:00')
				if (!isNaN(normalized.getTime())) {
					conditions.push(buildNestedWhere(fieldPath, { gte: toLocalIsoString(normalized) }))
				}
			}

			if (artifact.end !== null) {
				const normalized = new Date(artifact.end + 'T00:00:00')
				if (!isNaN(normalized.getTime())) {
					// End date is inclusive — advance to start of next day
					normalized.setDate(normalized.getDate() + 1)
					conditions.push(buildNestedWhere(fieldPath, { lt: toLocalIsoString(normalized) }))
				}
			}

			if (artifact.nullCondition !== undefined) {
				conditions.push(buildNestedWhere(fieldPath, { isNull: artifact.nullCondition }))
			}

			if (conditions.length === 0) return undefined
			if (conditions.length === 1) return conditions[0]
			return { and: conditions }
		},
	}
}

// ============================================================================
// Boolean Filter
// ============================================================================

export function createBooleanFilterHandler(fieldPath: string): FilterHandler<BooleanFilterArtifact> {
	return {
		defaultArtifact(): BooleanFilterArtifact {
			return {}
		},

		isActive(artifact: BooleanFilterArtifact): boolean {
			return artifact.includeTrue === true || artifact.includeFalse === true || artifact.nullCondition !== undefined
		},

		toWhere(artifact: BooleanFilterArtifact): Record<string, unknown> | undefined {
			if (!this.isActive(artifact)) return undefined

			const conditions: Record<string, unknown>[] = []

			if (artifact.includeTrue && artifact.includeFalse) {
				// Both selected — matches all, no field condition needed
			} else if (artifact.includeTrue) {
				conditions.push(buildNestedWhere(fieldPath, { eq: true }))
			} else if (artifact.includeFalse) {
				conditions.push(buildNestedWhere(fieldPath, { eq: false }))
			}

			if (artifact.nullCondition !== undefined) {
				conditions.push(buildNestedWhere(fieldPath, { isNull: artifact.nullCondition }))
			}

			if (conditions.length === 0) return undefined
			if (conditions.length === 1) return conditions[0]
			return { and: conditions }
		},
	}
}

// ============================================================================
// Enum Filter
// ============================================================================

export function createEnumFilterHandler(fieldPath: string): FilterHandler<EnumFilterArtifact> {
	return {
		defaultArtifact(): EnumFilterArtifact {
			return {}
		},

		isActive(artifact: EnumFilterArtifact): boolean {
			return (artifact.values !== undefined && artifact.values.length > 0)
				|| (artifact.notValues !== undefined && artifact.notValues.length > 0)
				|| artifact.nullCondition !== undefined
		},

		toWhere(artifact: EnumFilterArtifact): Record<string, unknown> | undefined {
			if (!this.isActive(artifact)) return undefined

			const conditions: Record<string, unknown>[] = []

			if (artifact.values !== undefined && artifact.values.length > 0) {
				conditions.push(buildNestedWhere(fieldPath, { in: artifact.values }))
			}

			if (artifact.notValues !== undefined && artifact.notValues.length > 0) {
				conditions.push(buildNestedWhere(fieldPath, { notIn: artifact.notValues }))
			}

			if (artifact.nullCondition !== undefined) {
				conditions.push(buildNestedWhere(fieldPath, { isNull: artifact.nullCondition }))
			}

			if (conditions.length === 0) return undefined
			if (conditions.length === 1) return conditions[0]
			return { and: conditions }
		},
	}
}

// ============================================================================
// Enum List Filter (for array enum fields)
// ============================================================================

export function createEnumListFilterHandler(fieldPath: string): FilterHandler<EnumListFilterArtifact> {
	return {
		defaultArtifact(): EnumListFilterArtifact {
			return {}
		},

		isActive(artifact: EnumListFilterArtifact): boolean {
			return (artifact.values !== undefined && artifact.values.length > 0)
				|| (artifact.notValues !== undefined && artifact.notValues.length > 0)
				|| artifact.nullCondition !== undefined
		},

		toWhere(artifact: EnumListFilterArtifact): Record<string, unknown> | undefined {
			if (!this.isActive(artifact)) return undefined

			const conditions: Record<string, unknown>[] = []

			if (artifact.values !== undefined && artifact.values.length > 0) {
				const valueConds = artifact.values.map(v =>
					buildNestedWhere(fieldPath, { includes: v }),
				)
				conditions.push(valueConds.length === 1 ? valueConds[0]! : { or: valueConds })
			}

			if (artifact.notValues !== undefined && artifact.notValues.length > 0) {
				const valueConds = artifact.notValues.map(v =>
					buildNestedWhere(fieldPath, { includes: v }),
				)
				const inner = valueConds.length === 1 ? valueConds[0]! : { or: valueConds }
				conditions.push({ not: inner })
			}

			if (artifact.nullCondition !== undefined) {
				conditions.push(buildNestedWhere(fieldPath, { isNull: artifact.nullCondition }))
			}

			if (conditions.length === 0) return undefined
			if (conditions.length === 1) return conditions[0]
			return { and: conditions }
		},
	}
}

// ============================================================================
// Relation Filter (HasOne / HasMany)
// ============================================================================

export function createRelationFilterHandler(fieldPath: string): FilterHandler<RelationFilterArtifact> {
	return {
		defaultArtifact(): RelationFilterArtifact {
			return {}
		},

		isActive(artifact: RelationFilterArtifact): boolean {
			return (artifact.id !== undefined && artifact.id.length > 0)
				|| (artifact.notId !== undefined && artifact.notId.length > 0)
				|| artifact.nullCondition !== undefined
		},

		toWhere(artifact: RelationFilterArtifact): Record<string, unknown> | undefined {
			if (!this.isActive(artifact)) return undefined

			const conditions: Record<string, unknown>[] = []

			if (artifact.id !== undefined && artifact.id.length > 0) {
				const idCondition = artifact.id.length === 1
					? { eq: artifact.id[0] }
					: { in: artifact.id }
				conditions.push(buildNestedWhere(fieldPath, { id: idCondition }))
			}

			if (artifact.notId !== undefined && artifact.notId.length > 0) {
				const idCondition = artifact.notId.length === 1
					? { eq: artifact.notId[0] }
					: { in: artifact.notId }
				conditions.push({ not: buildNestedWhere(fieldPath, { id: idCondition }) })
			}

			if (artifact.nullCondition !== undefined) {
				conditions.push(buildNestedWhere(fieldPath, { id: { isNull: artifact.nullCondition } }))
			}

			if (conditions.length === 0) return undefined
			if (conditions.length === 1) return conditions[0]
			return { and: conditions }
		},
	}
}

// ============================================================================
// IsDefined Filter
// ============================================================================

export function createIsDefinedFilterHandler(fieldPath: string): FilterHandler<IsDefinedFilterArtifact> {
	return {
		defaultArtifact(): IsDefinedFilterArtifact {
			return { defined: null }
		},

		isActive(artifact: IsDefinedFilterArtifact): boolean {
			return artifact.defined !== null
		},

		toWhere(artifact: IsDefinedFilterArtifact): Record<string, unknown> | undefined {
			if (artifact.defined === null) return undefined
			return buildNestedWhere(fieldPath, { isNull: !artifact.defined })
		},
	}
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format a Date as ISO string with local timezone offset.
 * e.g. 2024-01-15T00:00:00+01:00
 */
function toLocalIsoString(date: Date): string {
	const tzo = -date.getTimezoneOffset()
	const sign = tzo >= 0 ? '+' : '-'
	const pad = (n: number, len = 2): string => String(n).padStart(len, '0')

	return (
		pad(date.getFullYear(), 4) + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
		'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds()) +
		sign + pad(Math.floor(Math.abs(tzo) / 60)) + ':' + pad(Math.abs(tzo) % 60)
	)
}

/**
 * Builds a nested where clause from a dot-separated field path.
 * e.g., "author.name" → { author: { name: condition } }
 */
function buildNestedWhere(fieldPath: string, condition: Record<string, unknown>): Record<string, unknown> {
	const parts = fieldPath.split('.')
	let result = condition

	for (let i = parts.length - 1; i >= 0; i--) {
		result = { [parts[i]!]: result }
	}

	return result
}
