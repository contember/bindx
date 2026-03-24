/**
 * Static query builder module.
 *
 * Creates first-class query/mutation descriptors that can be composed, batched, and executed.
 * All functions are schema-agnostic — entity info flows through EntityDef references.
 *
 * @example
 * ```ts
 * import { qb } from '@contember/bindx-client'
 *
 * const article = qb.get(schema.Article, { by: { id } }, it => it.title())
 * const articles = qb.list(schema.Article, { limit: 10 }, it => it.title())
 * const result = await client.query(article)
 * ```
 */

import { type EntityDef, type CommonEntity } from '../schema/index.js'
import type { FluentDefiner, FluentFragment } from '../selection/types.js'
import { createSelectionBuilder } from '../selection/createSelectionBuilder.js'
import { SELECTION_META } from '../selection/types.js'
import { buildQueryFromSelection } from '../selection/buildQuery.js'
import type { EntityWhere, EntityOrderBy } from '../selection/queryTypes.js'
import { ContentOperation, type ContentQuery, type ContentMutation } from '../operations/ContentOperation.js'
import type { MutationResult, TransactionResult } from '../operations/types.js'
import { querySpecToGraphQl, unwrapPaginateResult } from '../graphql/querySpecToGraphQl.js'
import { buildGetArgs, buildListArgs, buildCreateArgs, buildUpdateArgs, buildUpsertArgs, buildDeleteArgs } from '../graphql/buildTypedArgs.js'
import { buildMutationSelection } from '../graphql/mutationFragments.js'
import type { UniqueWhere, CreateDataInput, UpdateDataInput } from './inputTypes.js'
import { GraphQlField } from '@contember/graphql-builder'
import { createMutationOperationSet } from '../operations/createMutationOperationSet.js'
import type { GraphQlFieldTypedArgs } from '@contember/graphql-builder'

// ============================================================================
// Internal helpers
// ============================================================================

type Entity<TRoleMap extends Record<string, object>> = CommonEntity<TRoleMap>

function resolveSelection<TRoleMap extends Record<string, object>, TResult extends object>(
	definer: FluentDefiner<Entity<TRoleMap>, TResult> | FluentFragment<Entity<TRoleMap>, TResult>,
): { selectionSet: import('@contember/graphql-builder').GraphQlSelectionSet; fieldNames: Record<string, string> } {
	let meta
	if ('__isFragment' in definer && definer.__isFragment) {
		meta = definer.__meta
	} else {
		const builder = createSelectionBuilder<Entity<TRoleMap>>()
		const result = (definer as FluentDefiner<Entity<TRoleMap>, TResult>)(builder)
		meta = result[SELECTION_META]
	}
	const querySpec = buildQueryFromSelection(meta)
	// TODO: pass schemaEntityNames for proper has-many type resolution
	const selectionSet = querySpecToGraphQl(querySpec)
	return { selectionSet, fieldNames: {} }
}

function entityName<TRoleMap extends Record<string, object>>(entity: EntityDef<TRoleMap>): string {
	return entity.$name
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Creates a get (single entity by unique) query descriptor.
 */
export function get<TRoleMap extends Record<string, object>, TResult extends object>(
	entity: EntityDef<TRoleMap>,
	args: { readonly by: UniqueWhere<Entity<TRoleMap>>; readonly filter?: EntityWhere<Entity<TRoleMap>> },
	definer: FluentDefiner<Entity<TRoleMap>, TResult> | FluentFragment<Entity<TRoleMap>, TResult>,
): ContentQuery<(TResult & { id: string }) | null> {
	const name = entityName(entity)
	const { selectionSet } = resolveSelection<TRoleMap, TResult>(definer)
	const typedArgs = buildGetArgs(name, args)

	return new ContentOperation(
		'query',
		`get${name}`,
		typedArgs,
		selectionSet,
		(value) => value as (TResult & { id: string }) | null,
	)
}

/**
 * Creates a list query descriptor.
 */
export function list<TRoleMap extends Record<string, object>, TResult extends object>(
	entity: EntityDef<TRoleMap>,
	args: {
		readonly filter?: EntityWhere<Entity<TRoleMap>>
		readonly orderBy?: readonly EntityOrderBy<Entity<TRoleMap>>[]
		readonly limit?: number
		readonly offset?: number
	},
	definer: FluentDefiner<Entity<TRoleMap>, TResult> | FluentFragment<Entity<TRoleMap>, TResult>,
): ContentQuery<(TResult & { id: string })[]> {
	const name = entityName(entity)
	const { selectionSet } = resolveSelection<TRoleMap, TResult>(definer)
	const typedArgs = buildListArgs(name, args)

	return new ContentOperation(
		'query',
		`list${name}`,
		typedArgs,
		selectionSet,
		(value) => (value ?? []) as (TResult & { id: string })[],
	)
}

/**
 * Creates a count query descriptor.
 */
export function count<TRoleMap extends Record<string, object>>(
	entity: EntityDef<TRoleMap>,
	args: { readonly filter?: EntityWhere<Entity<TRoleMap>> },
): ContentQuery<number> {
	const name = entityName(entity)
	const typedArgs = buildListArgs(name, { filter: args.filter }, 'paginate')
	const selectionSet = [
		new GraphQlField(null, 'pageInfo', {}, [
			new GraphQlField(null, 'totalCount'),
		]),
	]

	return new ContentOperation(
		'query',
		`paginate${name}`,
		typedArgs,
		selectionSet,
		(value) => {
			const result = value as { pageInfo: { totalCount: number } } | null
			return result?.pageInfo.totalCount ?? 0
		},
	)
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Creates a create mutation descriptor.
 */
export function create<TRoleMap extends Record<string, object>, TResult extends object = object>(
	entity: EntityDef<TRoleMap>,
	args: { readonly data: CreateDataInput<Entity<TRoleMap>> },
	definer?: FluentDefiner<Entity<TRoleMap>, TResult> | FluentFragment<Entity<TRoleMap>, TResult>,
): ContentMutation<MutationResult<TResult>> {
	const name = entityName(entity)
	const typedArgs = buildCreateArgs(name, args)
	const nodeSelection = definer ? resolveSelection<TRoleMap, TResult>(definer).selectionSet : undefined
	const selectionSet = buildMutationSelection('create', nodeSelection)

	return new ContentOperation(
		'mutation',
		`create${name}`,
		typedArgs,
		selectionSet,
		(value) => value as MutationResult<TResult>,
	)
}

/**
 * Creates an update mutation descriptor.
 */
export function update<TRoleMap extends Record<string, object>, TResult extends object = object>(
	entity: EntityDef<TRoleMap>,
	args: {
		readonly by: UniqueWhere<Entity<TRoleMap>>
		readonly data: UpdateDataInput<Entity<TRoleMap>>
		readonly filter?: EntityWhere<Entity<TRoleMap>>
	},
	definer?: FluentDefiner<Entity<TRoleMap>, TResult> | FluentFragment<Entity<TRoleMap>, TResult>,
): ContentMutation<MutationResult<TResult>> {
	const name = entityName(entity)
	const typedArgs = buildUpdateArgs(name, args)
	const nodeSelection = definer ? resolveSelection<TRoleMap, TResult>(definer).selectionSet : undefined
	const selectionSet = buildMutationSelection('update', nodeSelection)

	return new ContentOperation(
		'mutation',
		`update${name}`,
		typedArgs,
		selectionSet,
		(value) => value as MutationResult<TResult>,
	)
}

/**
 * Creates an upsert mutation descriptor.
 */
export function upsert<TRoleMap extends Record<string, object>, TResult extends object = object>(
	entity: EntityDef<TRoleMap>,
	args: {
		readonly by: UniqueWhere<Entity<TRoleMap>>
		readonly create: CreateDataInput<Entity<TRoleMap>>
		readonly update: UpdateDataInput<Entity<TRoleMap>>
		readonly filter?: EntityWhere<Entity<TRoleMap>>
	},
	definer?: FluentDefiner<Entity<TRoleMap>, TResult> | FluentFragment<Entity<TRoleMap>, TResult>,
): ContentMutation<MutationResult<TResult>> {
	const name = entityName(entity)
	const typedArgs = buildUpsertArgs(name, args)
	const nodeSelection = definer ? resolveSelection<TRoleMap, TResult>(definer).selectionSet : undefined
	const selectionSet = buildMutationSelection('upsert', nodeSelection)

	return new ContentOperation(
		'mutation',
		`upsert${name}`,
		typedArgs,
		selectionSet,
		(value) => value as MutationResult<TResult>,
	)
}

/**
 * Creates a delete mutation descriptor.
 */
function delete_<TRoleMap extends Record<string, object>>(
	entity: EntityDef<TRoleMap>,
	args: {
		readonly by: UniqueWhere<Entity<TRoleMap>>
		readonly filter?: EntityWhere<Entity<TRoleMap>>
	},
): ContentMutation<MutationResult<never>> {
	const name = entityName(entity)
	const typedArgs = buildDeleteArgs(name, args)
	const selectionSet = buildMutationSelection('delete')

	return new ContentOperation(
		'mutation',
		`delete${name}`,
		typedArgs,
		selectionSet,
		(value) => value as MutationResult<never>,
	)
}

export { delete_ as delete }

// ============================================================================
// Transaction
// ============================================================================

/**
 * Wraps mutations into a transaction descriptor.
 */
export function transaction<T>(
	mutations: ContentMutation<T> | ContentMutation<T>[] | Record<string, ContentMutation<unknown> | ContentQuery<unknown>>,
	options?: { readonly deferForeignKeyConstraints?: boolean; readonly deferUniqueConstraints?: boolean },
): ContentMutation<TransactionResult<unknown>> {
	const operationSet = createMutationOperationSet(
		mutations as ContentMutation<unknown> | ContentMutation<unknown>[] | Record<string, ContentMutation<unknown>>,
	)

	const transactionArgs: GraphQlFieldTypedArgs = options
		? {
			options: {
				graphQlType: 'MutationTransactionOptions',
				value: options as Parameters<typeof Object.assign>[0],
			},
		}
		: {}

	const items = [
		new GraphQlField(null, 'ok'),
		new GraphQlField(null, 'errorMessage'),
		...operationSet.selection,
	]

	return new ContentOperation<TransactionResult<unknown>, 'mutation'>(
		'mutation',
		'transaction',
		transactionArgs,
		items,
		(value) => {
			const raw = value as Record<string, unknown>
			return {
				ok: raw['ok'] as boolean,
				errorMessage: raw['errorMessage'] as string | null,
				errors: [],
				validation: { valid: true, errors: [] },
				data: operationSet.parse(raw),
			}
		},
	)
}

// ============================================================================
// Fragment
// ============================================================================

/**
 * Creates a reusable fragment using EntityDef reference.
 *
 * @example
 * ```ts
 * const AuthorCard = qb.fragment(schema.Author, e => e.name().email())
 *
 * // Use in queries
 * const article = qb.get(schema.Article, { by: { id } }, it => it.title().author(AuthorCard))
 * ```
 */
export function fragment<TRoleMap extends Record<string, object>, TResult extends object>(
	_entity: EntityDef<TRoleMap>,
	definer: FluentDefiner<Entity<TRoleMap>, TResult>,
): FluentFragment<Entity<TRoleMap>, TResult> {
	const builder = createSelectionBuilder<Entity<TRoleMap>>()
	const resultBuilder = definer(builder)
	const meta = resultBuilder[SELECTION_META]

	return {
		__meta: meta,
		__resultType: undefined as unknown as TResult,
		__modelType: undefined as unknown as Entity<TRoleMap>,
		__isFragment: true,
	}
}
