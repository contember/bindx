import { GraphQlField, type GraphQlFieldTypedArgs, type GraphQlSelectionSet } from '@contember/graphql-builder'
import type { QuerySpec, QueryFieldSpec } from '../selection/buildQuery.js'
import { buildListArgs } from './buildTypedArgs.js'

/**
 * Context for resolving relation target entity names during GraphQL generation.
 */
export interface QuerySpecContext {
	/** Current entity type name */
	entityName: string
	/** Resolves the target entity name for a relation field. Returns undefined if unknown. */
	resolveRelationTarget?: (entityName: string, fieldName: string) => string | undefined
}

/**
 * Converts a QuerySpec into a GraphQL selection set.
 * This replaces the role that ContentEntitySelection played in @contember/client-content.
 *
 * @param spec - The query specification built from SelectionMeta
 * @param context - Entity context for resolving relation targets
 * @returns GraphQL selection set (array of GraphQlField)
 */
export function querySpecToGraphQl(
	spec: QuerySpec,
	context?: QuerySpecContext,
): GraphQlSelectionSet {
	const fields: GraphQlSelectionSet = []

	for (const field of spec.fields) {
		fields.push(fieldSpecToGraphQl(field, context))
	}

	return fields
}

/**
 * Converts a single QueryFieldSpec to a GraphQlField.
 * Handles three cases: scalar, has-one relation, has-many relation (paginate pattern).
 */
function fieldSpecToGraphQl(
	field: QueryFieldSpec,
	context?: QuerySpecContext,
): GraphQlField {
	const fieldName = field.sourcePath[0]
	if (!fieldName) {
		throw new Error('Empty source path in QueryFieldSpec')
	}

	const alias = field.name !== fieldName ? field.name : null

	// Scalar field — no nested, no array
	if (!field.nested && !field.isArray) {
		return new GraphQlField(alias, fieldName)
	}

	// Resolve target entity name for relations
	const targetEntityName = context?.resolveRelationTarget?.(context.entityName, fieldName)
	const nestedContext: QuerySpecContext | undefined = targetEntityName
		? { entityName: targetEntityName, resolveRelationTarget: context?.resolveRelationTarget }
		: context

	// Has-one relation — nested but not array
	if (field.nested && !field.isArray) {
		const nestedSelection = querySpecToGraphQl(field.nested, nestedContext)
		return new GraphQlField(alias, fieldName, {}, nestedSelection)
	}

	// Has-many relation — uses paginateRelation pattern
	if (field.isArray && field.nested) {
		return buildPaginateField(field, fieldName, alias, targetEntityName, nestedContext)
	}

	// Fallback: field with isArray but no nested (shouldn't happen in practice)
	return new GraphQlField(alias, fieldName)
}

/**
 * Builds a paginateRelation field for has-many relations.
 *
 * Generates:
 * ```graphql
 * paginateFieldName(filter: ..., first: ..., skip: ..., orderBy: ...) {
 *   pageInfo { totalCount }  # if requested
 *   edges { node { ...fields } }
 * }
 * ```
 */
function buildPaginateField(
	field: QueryFieldSpec,
	fieldName: string,
	alias: string | null,
	targetEntityName: string | undefined,
	nestedContext?: QuerySpecContext,
): GraphQlField {
	// Build paginate field name: paginateFieldName (capitalize first letter)
	const paginateFieldName = `paginate${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`

	// Build typed args for pagination
	const args: GraphQlFieldTypedArgs = targetEntityName
		? buildListArgs(targetEntityName, {
			filter: field.filter as Record<string, unknown> | undefined,
			orderBy: field.orderBy as Record<string, unknown>[] | undefined,
			limit: field.limit,
			offset: field.offset,
		}, 'paginate')
		: {}

	// Build nested selection (edges → node → fields)
	const nestedSelection = querySpecToGraphQl(field.nested!, nestedContext)

	const paginateSelection: GraphQlSelectionSet = []

	// Add pageInfo.totalCount if requested
	if (field.totalCount) {
		paginateSelection.push(
			new GraphQlField(null, 'pageInfo', {}, [
				new GraphQlField(null, 'totalCount'),
			]),
		)
	}

	// Add edges → node → fields
	paginateSelection.push(
		new GraphQlField(null, 'edges', {}, [
			new GraphQlField(null, 'node', {}, nestedSelection),
		]),
	)

	return new GraphQlField(alias, paginateFieldName, args, paginateSelection)
}

/**
 * Transform function for unwrapping paginateRelation Connection format to flat arrays.
 *
 * Converts:
 * ```json
 * { edges: [{ node: {...} }], pageInfo: { totalCount: 42 } }
 * ```
 * Into:
 * ```json
 * [{ ... }, { ... }]  // with optional totalCount property
 * ```
 */
export function unwrapPaginateResult(
	connection: { edges: { node: unknown }[]; pageInfo?: { totalCount: number } },
	includeTotalCount: boolean,
): unknown[] {
	const items = connection.edges.map((edge: { node: unknown }) => edge.node)
	if (includeTotalCount && connection.pageInfo) {
		Object.defineProperty(items, 'totalCount', {
			value: connection.pageInfo.totalCount,
			enumerable: false,
			writable: false,
		})
	}
	return items
}
