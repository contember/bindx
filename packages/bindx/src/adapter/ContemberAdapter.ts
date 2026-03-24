import {
	ContentClient,
	type ContentClientOptions,
	ContentOperation,
	type ContentQuery,
	querySpecToGraphQl,
	type QuerySpecContext,
	buildGetArgs,
	buildListArgs,
	buildCreateArgs,
	buildUpdateArgs,
	buildDeleteArgs,
	buildMutationSelection,
	mutationFragments,
	unwrapPaginateResult,
} from '@contember/bindx-client'
import type { GraphQlClient } from '@contember/graphql-client'
import type { QuerySpec, QueryFieldSpec } from '../selection/buildQuery.js'
import type { BackendAdapter, Query, QueryResult, QueryOptions, GetQuery, ListQuery, PersistResult, CreateResult, DeleteResult } from './types.js'
import type { ContemberMutationResult } from '../errors/pathMapper.js'
import type { SchemaRegistry } from '../schema/SchemaRegistry.js'
import { GraphQlField } from '@contember/graphql-builder'

/**
 * Options for ContemberAdapter
 */
export interface ContemberAdapterOptions {
	/** GraphQL client instance */
	client: GraphQlClient
	/** Schema registry for relation target resolution */
	schemaRegistry: SchemaRegistry
}

/**
 * Backend adapter for Contember Content API.
 * Uses @contember/bindx-client for GraphQL operations.
 */
export class ContemberAdapter implements BackendAdapter {

	constructor(
		private readonly contentClient: ContentClient,
		private readonly schemaRegistry: SchemaRegistry,
	) {
	}

	async query(queries: readonly Query[], options?: QueryOptions): Promise<QueryResult[]> {
		if (queries.length === 0) return []

		// Build ContentQuery for each query
		const contentQueries: Record<string, ContentQuery<unknown>> = {}

		for (let i = 0; i < queries.length; i++) {
			const q = queries[i]!
			const key = `q${i}`

			if (q.type === 'get') {
				contentQueries[key] = this.buildGetQuery(q)
			} else {
				contentQueries[key] = this.buildListQuery(q)
			}
		}

		// Execute all queries in single request
		const results = await this.contentClient.query(contentQueries, {
			signal: options?.signal,
		})

		// Map results back to QueryResult array
		return queries.map((q, i) => {
			const key = `q${i}`
			const data = (results as Record<string, unknown>)[key]

			if (q.type === 'get') {
				return { type: 'get' as const, data: data as Record<string, unknown> | null }
			} else {
				return { type: 'list' as const, data: (data ?? []) as readonly Record<string, unknown>[] }
			}
		})
	}

	private buildGetQuery(query: GetQuery): ContentQuery<unknown> {
		const context = this.createContext(query.entityType)
		const selectionSet = querySpecToGraphQl(query.spec, context)
		const args = buildGetArgs(query.entityType, { by: query.by })

		return new ContentOperation(
			'query',
			`get${query.entityType}`,
			args,
			selectionSet,
			value => value,
		)
	}

	private buildListQuery(query: ListQuery): ContentQuery<unknown> {
		const context = this.createContext(query.entityType)
		const selectionSet = querySpecToGraphQl(query.spec, context)
		const args = buildListArgs(query.entityType, {
			filter: query.filter,
			orderBy: query.orderBy as unknown[],
			limit: query.limit,
			offset: query.offset,
		})

		return new ContentOperation(
			'query',
			`list${query.entityType}`,
			args,
			selectionSet,
			value => value,
		)
	}

	async persist(
		entityType: string,
		id: string,
		changes: Record<string, unknown>,
	): Promise<PersistResult> {
		const args = buildUpdateArgs(entityType, { by: { id }, data: changes })
		const selectionSet = buildMutationSelection('update')

		const mutation = new ContentOperation(
			'mutation',
			`update${entityType}`,
			args,
			selectionSet,
			value => value as { ok: boolean; errorMessage: string | null; errors: unknown[]; validation: unknown },
		)

		try {
			const result = await this.contentClient.mutate(mutation)
			return { ok: true }
		} catch (e) {
			if (e instanceof Error && 'result' in e) {
				const mutResult = (e as { result: Record<string, unknown> }).result
				return {
					ok: false,
					errorMessage: (mutResult['errorMessage'] as string | null) ?? `Failed to update ${entityType}:${id}`,
					mutationResult: this.toMutationResult(mutResult),
				}
			}
			throw e
		}
	}

	async create(
		entityType: string,
		data: Record<string, unknown>,
	): Promise<CreateResult> {
		const args = buildCreateArgs(entityType, { data })
		// Select id on created node
		const nodeSelection = [new GraphQlField(null, 'id')]
		const selectionSet = buildMutationSelection('create', nodeSelection)

		const mutation = new ContentOperation(
			'mutation',
			`create${entityType}`,
			args,
			selectionSet,
			value => value as { ok: boolean; errorMessage: string | null; errors: unknown[]; validation: unknown; node: unknown },
		)

		try {
			const result = await this.contentClient.mutate(mutation)
			const typedResult = result as { node: Record<string, unknown> | null }
			return {
				ok: true,
				data: typedResult.node as Record<string, unknown>,
			}
		} catch (e) {
			if (e instanceof Error && 'result' in e) {
				const mutResult = (e as { result: Record<string, unknown> }).result
				return {
					ok: false,
					errorMessage: (mutResult['errorMessage'] as string | null) ?? `Failed to create ${entityType}`,
					mutationResult: this.toMutationResult(mutResult),
				}
			}
			throw e
		}
	}

	async delete(entityType: string, id: string): Promise<DeleteResult> {
		const args = buildDeleteArgs(entityType, { by: { id } })
		const selectionSet = buildMutationSelection('delete')

		const mutation = new ContentOperation(
			'mutation',
			`delete${entityType}`,
			args,
			selectionSet,
			value => value as { ok: boolean; errorMessage: string | null; errors: unknown[] },
		)

		try {
			const result = await this.contentClient.mutate(mutation)
			return { ok: true }
		} catch (e) {
			if (e instanceof Error && 'result' in e) {
				const mutResult = (e as { result: Record<string, unknown> }).result
				return {
					ok: false,
					errorMessage: (mutResult['errorMessage'] as string | null) ?? `Failed to delete ${entityType}:${id}`,
					mutationResult: this.toMutationResult(mutResult),
				}
			}
			throw e
		}
	}

	/**
	 * Converts raw mutation result to ContemberMutationResult type.
	 */
	private toMutationResult(result: Record<string, unknown>): ContemberMutationResult {
		const errors = (result['errors'] as Array<{ paths: unknown; message: string; type: string }>) ?? []
		const validation = result['validation'] as { valid: boolean; errors: Array<{ path: unknown; message: { text: string } }> } | undefined

		return {
			ok: result['ok'] as boolean,
			errorMessage: result['errorMessage'] as string | null,
			errors: errors.map(e => ({
				paths: e.paths as Array<Array<{ field: string } | { index: number; alias: string | null }>>,
				message: e.message,
				type: e.type,
			})),
			validation: {
				valid: validation?.valid ?? true,
				errors: (validation?.errors ?? []).map(e => ({
					path: e.path as Array<{ field: string } | { index: number; alias: string | null }>,
					message: { text: e.message.text },
				})),
			},
		}
	}

	/**
	 * Creates a QuerySpecContext for an entity, wiring in SchemaRegistry for relation target resolution.
	 */
	private createContext(entityName: string): QuerySpecContext {
		return {
			entityName,
			resolveRelationTarget: (entity, field) => this.schemaRegistry.getRelationTarget(entity, field),
		}
	}
}
