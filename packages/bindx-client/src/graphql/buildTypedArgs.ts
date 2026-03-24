import type { GraphQlFieldTypedArgs } from '@contember/graphql-builder'

/**
 * Creates typed GraphQL arguments from a plain args object and type map.
 * Only includes args with non-undefined values.
 */
export function buildTypedArgs(
	args: Record<string, unknown>,
	types: Record<string, string>,
): GraphQlFieldTypedArgs {
	const result: GraphQlFieldTypedArgs = {}
	for (const key in types) {
		const value = args[key]
		if (value !== undefined) {
			result[key] = {
				graphQlType: types[key]!,
				value: value as Parameters<typeof Object.assign>[0],
			}
		}
	}
	return result
}

/**
 * Builds typed args for list/paginate queries.
 * Handles limit→first, offset→skip mapping for paginateRelation.
 */
export function buildListArgs(
	entityName: string,
	args: { filter?: unknown; orderBy?: unknown; limit?: number; offset?: number },
	type: 'list' | 'paginate' = 'list',
): GraphQlFieldTypedArgs {
	return buildTypedArgs(
		{
			filter: args.filter,
			orderBy: args.orderBy,
			[type === 'list' ? 'limit' : 'first']: args.limit,
			[type === 'list' ? 'offset' : 'skip']: args.offset,
		},
		{
			filter: `${entityName}Where`,
			orderBy: `[${entityName}OrderBy!]`,
			[type === 'list' ? 'limit' : 'first']: 'Int',
			[type === 'list' ? 'offset' : 'skip']: 'Int',
		},
	)
}

/**
 * Builds typed args for get queries (unique where).
 */
export function buildGetArgs(
	entityName: string,
	args: { by: unknown; filter?: unknown },
): GraphQlFieldTypedArgs {
	return buildTypedArgs(
		{ by: args.by, filter: args.filter },
		{ by: `${entityName}UniqueWhere!`, filter: `${entityName}Where` },
	)
}

/**
 * Builds typed args for create mutations.
 */
export function buildCreateArgs(
	entityName: string,
	args: { data: unknown },
): GraphQlFieldTypedArgs {
	return buildTypedArgs(
		{ data: args.data },
		{ data: `${entityName}CreateInput!` },
	)
}

/**
 * Builds typed args for update mutations.
 */
export function buildUpdateArgs(
	entityName: string,
	args: { by: unknown; data: unknown; filter?: unknown },
): GraphQlFieldTypedArgs {
	return buildTypedArgs(
		{ by: args.by, data: args.data, filter: args.filter },
		{ by: `${entityName}UniqueWhere!`, data: `${entityName}UpdateInput!`, filter: `${entityName}Where` },
	)
}

/**
 * Builds typed args for upsert mutations.
 */
export function buildUpsertArgs(
	entityName: string,
	args: { by: unknown; create: unknown; update: unknown; filter?: unknown },
): GraphQlFieldTypedArgs {
	return buildTypedArgs(
		{ by: args.by, create: args.create, update: args.update, filter: args.filter },
		{ by: `${entityName}UniqueWhere!`, create: `${entityName}CreateInput!`, update: `${entityName}UpdateInput!`, filter: `${entityName}Where` },
	)
}

/**
 * Builds typed args for delete mutations.
 */
export function buildDeleteArgs(
	entityName: string,
	args: { by: unknown; filter?: unknown },
): GraphQlFieldTypedArgs {
	return buildTypedArgs(
		{ by: args.by, filter: args.filter },
		{ by: `${entityName}UniqueWhere!`, filter: `${entityName}Where` },
	)
}
