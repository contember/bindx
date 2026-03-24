import type { GraphQlClient, GraphQlClientRequestOptions } from '@contember/graphql-client'
import { GraphQlQueryPrinter, type GraphQlFragment } from '@contember/graphql-builder'
import { type ContentQuery, type ContentMutation, ContentOperation } from '../operations/ContentOperation.js'
import { createQueryOperationSet } from '../operations/createQueryOperationSet.js'
import { createMutationOperationSet } from '../operations/createMutationOperationSet.js'
import { mutationFragments } from '../graphql/mutationFragments.js'
import { MutationFailedError } from '../operations/MutationFailedError.js'
import type { MutationResult } from '../operations/types.js'

export type ContentClientOptions = GraphQlClientRequestOptions

/**
 * Executes query and mutation descriptors against the Contember Content API.
 *
 * Supports batching: single operations, arrays (tuples), and named records.
 *
 * @example
 * ```ts
 * const client = new ContentClient(graphqlClient)
 *
 * // Single query
 * const article = await client.query(qb.get(schema.Article, { by: { id } }, it => it.title()))
 *
 * // Batched queries
 * const { article, authors } = await client.query({
 *   article: qb.get(schema.Article, { by: { id } }, it => it.title()),
 *   authors: qb.list(schema.Author, {}, it => it.name()),
 * })
 * ```
 */
export class ContentClient {
	constructor(
		private readonly graphqlClient: Pick<GraphQlClient, 'execute'>,
	) {
	}

	// ========================================================================
	// Queries
	// ========================================================================

	/** Execute a single query */
	async query<T>(query: ContentQuery<T>, options?: ContentClientOptions): Promise<T>

	/** Execute multiple named queries in a single request */
	async query<T extends Record<string, ContentQuery<unknown>>>(
		queries: T,
		options?: ContentClientOptions,
	): Promise<{ [K in keyof T]: T[K] extends ContentQuery<infer V> ? V : never }>

	async query(
		input: ContentQuery<unknown> | Record<string, ContentQuery<unknown>>,
		options?: ContentClientOptions,
	): Promise<unknown> {
		const printer = new GraphQlQueryPrinter()
		const operationSet = createQueryOperationSet(input)
		const { query, variables } = printer.printDocument('query', operationSet.selection, {})
		const result = await this.graphqlClient.execute<Record<string, unknown>>(query, { ...options, variables })
		return operationSet.parse(result)
	}

	// ========================================================================
	// Mutations
	// ========================================================================

	/** Execute a single mutation. Throws MutationFailedError if `ok` is false. */
	async mutate<T>(mutation: ContentMutation<T>, options?: ContentClientOptions): Promise<T>

	/** Execute multiple mutations in a single request. Throws if any fails. */
	async mutate<T extends readonly ContentMutation<unknown>[]>(
		mutations: T,
		options?: ContentClientOptions,
	): Promise<{ [K in keyof T]: T[K] extends ContentMutation<infer V> ? V : never }>

	/** Execute named mutations in a single request. Throws if any fails. */
	async mutate<T extends Record<string, ContentMutation<unknown> | ContentQuery<unknown>>>(
		mutations: T,
		options?: ContentClientOptions,
	): Promise<{ [K in keyof T]: T[K] extends ContentOperation<infer V, 'query' | 'mutation'> ? V : never }>

	async mutate(
		input:
			| ContentMutation<unknown>
			| ContentMutation<unknown>[]
			| Record<string, ContentMutation<unknown> | ContentQuery<unknown>>,
		options?: ContentClientOptions,
	): Promise<unknown> {
		const printer = new GraphQlQueryPrinter()
		const operationSet = createMutationOperationSet(input)
		const { query, variables } = printer.printDocument('mutation', operationSet.selection, mutationFragments)
		const result = await this.graphqlClient.execute<Record<string, unknown>>(query, { ...options, variables })
		const parsed = operationSet.parse(result)

		// Check for failures and throw
		this.checkMutationResult(input, parsed)

		return parsed
	}

	// ========================================================================
	// Result checking
	// ========================================================================

	private checkMutationResult(
		input: ContentMutation<unknown> | ContentMutation<unknown>[] | Record<string, ContentMutation<unknown> | ContentQuery<unknown>>,
		parsed: unknown,
	): void {
		// Single mutation
		if (input instanceof ContentOperation) {
			const result = parsed as MutationResult
			if (result && typeof result === 'object' && 'ok' in result && !result.ok) {
				throw new MutationFailedError(
					result.errorMessage ?? 'Mutation failed',
					result,
				)
			}
			return
		}

		// Array of mutations
		if (Array.isArray(input)) {
			const results = parsed as MutationResult[]
			const failed = results.find(r => r && typeof r === 'object' && 'ok' in r && !r.ok)
			if (failed) {
				throw new MutationFailedError(
					(failed as { errorMessage?: string }).errorMessage ?? 'One or more mutations failed',
					failed,
					results, // All results for partial failure handling
				)
			}
			return
		}

		// Named mutations
		const results = parsed as Record<string, unknown>
		for (const [key, value] of Object.entries(results)) {
			const result = value as MutationResult | null
			if (result && typeof result === 'object' && 'ok' in result && !result.ok) {
				throw new MutationFailedError(
					result.errorMessage ?? `Mutation '${key}' failed`,
					result,
					results, // All results for partial failure handling
				)
			}
		}
	}
}
