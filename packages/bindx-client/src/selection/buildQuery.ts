import type { SelectionMeta, SelectionFieldMeta } from './types.js'

/**
 * Query specification for a single field
 */
export interface QueryFieldSpec {
	/** Name of the field as it appears in the output */
	name: string
	/** Path to the field in the source entity */
	sourcePath: string[]
	/** For nested objects/entities */
	nested?: QuerySpec
	/** Whether this is an array/collection */
	isArray?: boolean
	/** For has-many: filter parameters */
	filter?: unknown
	/** For has-many: ordering parameters */
	orderBy?: unknown
	/** For has-many: limit */
	limit?: number
	/** For has-many: offset */
	offset?: number
	/** For has-many: request totalCount via paginateRelation */
	totalCount?: boolean
}

/**
 * Query specification for fetching data.
 * Backend adapters use this to construct their queries.
 */
export interface QuerySpec {
	/** List of fields to fetch */
	fields: QueryFieldSpec[]
}

/**
 * Builds a QuerySpec from SelectionMeta.
 * This is what gets passed to the backend adapter.
 *
 * @param meta - The selection metadata
 */
export function buildQueryFromSelection(meta: SelectionMeta): QuerySpec {
	const fields: QueryFieldSpec[] = []

	// Always include 'id' field if not already selected
	// This is needed for entity identity and HasOneAccessor to detect if relation exists
	if (!meta.fields.has('id')) {
		fields.push({
			name: 'id',
			sourcePath: ['id'],
		})
	}

	for (const [_alias, fieldMeta] of meta.fields) {
		// Skip relation fields where no nested fields were selected.
		// This occurs when a relation handle is passed as a prop (e.g., HasManyDataGrid's `field` prop)
		// without any of its fields being read during JSX collection. The consuming component
		// is expected to handle its own data fetching for that relation.
		if (fieldMeta.isRelation && fieldMeta.nested && fieldMeta.nested.fields.size === 0) {
			continue
		}
		fields.push(buildFieldSpecFromSelection(fieldMeta))
	}

	return { fields }
}

/**
 * Builds a QueryFieldSpec from SelectionFieldMeta
 */
function buildFieldSpecFromSelection(meta: SelectionFieldMeta): QueryFieldSpec {
	const spec: QueryFieldSpec = {
		name: meta.alias,
		sourcePath: [meta.fieldName],
	}

	if (meta.isArray) {
		spec.isArray = true

		// Add has-many parameters
		if (meta.hasManyParams) {
			if (meta.hasManyParams.filter !== undefined) {
				spec.filter = meta.hasManyParams.filter
			}
			if (meta.hasManyParams.orderBy !== undefined) {
				spec.orderBy = meta.hasManyParams.orderBy
			}
			if (meta.hasManyParams.limit !== undefined) {
				spec.limit = meta.hasManyParams.limit
			}
			if (meta.hasManyParams.offset !== undefined) {
				spec.offset = meta.hasManyParams.offset
			}
			if (meta.hasManyParams.totalCount) {
				spec.totalCount = true
			}
		}

		if (meta.nested) {
			spec.nested = buildQueryFromSelection(meta.nested)
		}
	} else if (meta.nested) {
		spec.nested = buildQueryFromSelection(meta.nested)
	}

	return spec
}

/**
 * Collects all unique paths that need to be fetched.
 * Useful for debugging and optimization.
 */
export function collectPaths(meta: SelectionMeta, basePath: string[] = []): string[][] {
	const paths: string[][] = []

	for (const [_alias, fieldMeta] of meta.fields) {
		const fullPath = [...basePath, fieldMeta.fieldName]

		if (fieldMeta.isArray && fieldMeta.nested) {
			// For arrays, collect paths from nested metadata
			const nestedPaths = collectPaths(fieldMeta.nested, fullPath)
			paths.push(...nestedPaths)
		} else if (fieldMeta.nested) {
			// For nested objects, collect paths recursively
			const nestedPaths = collectPaths(fieldMeta.nested, fullPath)
			paths.push(...nestedPaths)
		} else {
			// Scalar field
			paths.push(fullPath)
		}
	}

	return paths
}
