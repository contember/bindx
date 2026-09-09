/**
 * Parent-scoped relation query used by HasManyDataGrid.
 *
 * The grid reads its rows through the parent record, so every read of the
 * relation — paged load and unpaged export alike — has to go through it.
 */

import { generateHasManyAlias } from '@contember/bindx'
import type { GetQuery, QuerySpec } from '@contember/bindx'

export interface HasManyRelationQueryOptions {
	readonly parentEntityType: string
	readonly parentEntityId: string
	readonly fieldName: string
	readonly filter: Record<string, unknown> | undefined
	readonly orderBy: readonly Record<string, unknown>[] | undefined
	readonly limit?: number
	readonly offset?: number
	readonly targetSpec: QuerySpec
}

export interface HasManyRelationQuery {
	/** Alias the relation rows are returned under */
	readonly alias: string
	readonly query: GetQuery
}

export interface HasManyRelationRows {
	readonly rows: readonly Record<string, unknown>[]
	readonly totalCount: number | undefined
}

export function buildHasManyRelationQuery({
	parentEntityType,
	parentEntityId,
	fieldName,
	filter,
	orderBy,
	limit,
	offset,
	targetSpec,
}: HasManyRelationQueryOptions): HasManyRelationQuery {
	const relationFilter = filter && Object.keys(filter).length > 0 ? filter : undefined
	const relationOrderBy = orderBy && orderBy.length > 0 ? orderBy : undefined
	const alias = generateHasManyAlias(fieldName, {
		filter: relationFilter,
		orderBy: relationOrderBy,
		limit,
		offset,
	})

	const spec: QuerySpec = {
		fields: [
			{ name: 'id', sourcePath: ['id'] },
			{
				name: alias,
				sourcePath: [fieldName],
				isArray: true,
				totalCount: true,
				filter: relationFilter,
				orderBy: relationOrderBy,
				limit,
				offset,
				nested: targetSpec,
			},
		],
	}

	return {
		alias,
		query: {
			type: 'get',
			entityType: parentEntityType,
			by: { id: parentEntityId },
			spec,
		},
	}
}

export function extractHasManyRelationRows(
	data: Record<string, unknown>,
	{ alias, fieldName }: { alias: string; fieldName: string },
): HasManyRelationRows | null {
	const value = data[alias] ?? data[fieldName]
	if (!isRecordArray(value)) return null
	const totalCount = 'totalCount' in value && typeof value.totalCount === 'number' ? value.totalCount : undefined
	return { rows: value, totalCount }
}

function isRecordArray(value: unknown): value is readonly Record<string, unknown>[] {
	return Array.isArray(value) && value.every(item => typeof item === 'object' && item !== null)
}
