import { GraphQlClient } from '@contember/graphql-client'
import {
	ContentClient,
	ContentQueryBuilder,
	ContentEntitySelection,
	SchemaNames,
	ContentQuery,
	type EntitySelectionManyArgs,
	type EntitySelectionOneArgs,
	type EntitySelectionColumnArgs,
	type ContentClientInput,
} from '@contember/client-content'
import { type Input } from '@contember/schema'
import type { QuerySpec, QueryFieldSpec } from '../selection/buildQuery.js'
import type { BackendAdapter, Query, QueryResult, QueryOptions, GetQuery, ListQuery, PersistResult, CreateResult, DeleteResult } from './types.js'
import type { ContemberMutationResult } from '../errors/pathMapper.js'
import { isExecutionErrorType, type ExecutionErrorType } from '../errors/types.js'

/**
 * Options for ContemberAdapter
 */
export interface ContemberAdapterOptions {
	/** GraphQL client instance */
	client: GraphQlClient
	/** Contember schema names for query building */
	schema: SchemaNames
}

/**
 * Backend adapter for Contember Content API.
 * Uses @contember/client-content for type-safe GraphQL operations.
 */
export class ContemberAdapter implements BackendAdapter {

	constructor(
		private readonly contentClient: ContentClient,
		private readonly queryBuilder: ContentQueryBuilder,
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
		const selection = this.buildEntitySelection(query.spec)
		return this.queryBuilder.get(query.entityType, { by: query.by }, selection)
	}

	private buildListQuery(query: ListQuery): ContentQuery<unknown> {
		const selection = this.buildEntitySelection(query.spec)
		const args: ContentClientInput.AnyListQueryInput = {
			filter: query.filter as Input.OptionalWhere | undefined,
			orderBy: query.orderBy as ContentClientInput.AnyOrderBy | undefined,
			limit: query.limit,
			offset: query.offset,
		}
		return this.queryBuilder.list(query.entityType, args, selection)
	}

	async persist(
		entityType: string,
		id: string,
		changes: Record<string, unknown>,
	): Promise<PersistResult> {
		const mutation = this.queryBuilder.update(entityType, {
			by: { id },
			data: changes as Input.UpdateDataInput,
		})

		const result = await this.contentClient.mutate(mutation)

		if (!result.ok) {
			return {
				ok: false,
				errorMessage: result.errorMessage ?? `Failed to update ${entityType}:${id}`,
				mutationResult: this.toMutationResult(result),
			}
		}

		return { ok: true }
	}

	async create(
		entityType: string,
		data: Record<string, unknown>,
	): Promise<CreateResult> {
		// Build selection to return created entity
		const selection = (s: ContentEntitySelection) => s.$('id')

		const mutation = this.queryBuilder.create(entityType, { data: data as Input.CreateDataInput }, selection)
		const result = await this.contentClient.mutate(mutation)

		if (!result.ok) {
			return {
				ok: false,
				errorMessage: result.errorMessage ?? `Failed to create ${entityType}`,
				mutationResult: this.toMutationResult(result),
			}
		}

		return {
			ok: true,
			data: result.node as Record<string, unknown>,
		}
	}

	async delete(entityType: string, id: string): Promise<DeleteResult> {
		const mutation = this.queryBuilder.delete(entityType, { by: { id } })
		const result = await this.contentClient.mutate(mutation)

		if (!result.ok) {
			return {
				ok: false,
				errorMessage: result.errorMessage ?? `Failed to delete ${entityType}:${id}`,
				mutationResult: this.toMutationResult(result),
			}
		}

		return { ok: true }
	}

	/**
	 * Converts Contember mutation result to our ContemberMutationResult type.
	 */
	private toMutationResult(result: {
		ok: boolean
		errorMessage: string | null
		errors: Array<{ paths: Array<Array<{ field: string } | { index: number; alias: string | null }>>; message: string; type: string }>
		validation: { valid: boolean; errors: Array<{ path: Array<{ field: string } | { index: number; alias: string | null }>; message: { text: string } }> }
	}): ContemberMutationResult {
		return {
			ok: result.ok,
			errorMessage: result.errorMessage,
			errors: result.errors.map(e => ({
				paths: e.paths,
				message: e.message,
				// Type comes from Contember as string, we validate it's a known ExecutionErrorType
				type: this.parseExecutionErrorType(e.type),
			})),
			validation: {
				valid: result.validation.valid,
				errors: result.validation.errors.map(e => ({
					path: e.path,
					message: { text: e.message.text },
				})),
			},
		}
	}

	/**
	 * Parses and validates an execution error type string.
	 * Returns the typed value if valid, or logs a warning and returns the string as-is for forward compatibility.
	 */
	private parseExecutionErrorType(type: string): ExecutionErrorType {
		if (isExecutionErrorType(type)) {
			return type
		}
		// Unknown error type - could be a new type added in a newer Contember version
		// Log warning but don't fail - forward compatibility
		console.warn(`[ContemberAdapter] Unknown execution error type: ${type}. This may be a new error type from a newer Contember version.`)
		return type as ExecutionErrorType
	}

	/**
	 * Builds ContentEntitySelection from QuerySpec
	 */
	private buildEntitySelection(
		query: QuerySpec,
	): (selection: ContentEntitySelection) => ContentEntitySelection {
		return (selection: ContentEntitySelection) => {
			return this.applyFieldsToSelection(selection, query.fields)
		}
	}

	/**
	 * Recursively applies QueryFieldSpec[] to ContentEntitySelection
	 */
	private applyFieldsToSelection(
		selection: ContentEntitySelection,
		fields: QueryFieldSpec[],
	): ContentEntitySelection {
		let result = selection

		for (const field of fields) {
			const fieldName = field.sourcePath[0]
			if (!fieldName) continue

			if (field.nested) {
				// Relation field (has-one or has-many)
				const nestedCallback = (s: ContentEntitySelection) =>
					this.applyFieldsToSelection(s, field.nested!.fields)

				if (field.isArray) {
					// has-many relation with optional params
					const manyArgs: EntitySelectionManyArgs = {
						...(field.name !== fieldName ? { as: field.name } : undefined),
						...(field.filter !== undefined ? { filter: field.filter as Input.OptionalWhere } : undefined),
						...(field.orderBy !== undefined ? { orderBy: field.orderBy as ContentClientInput.AnyOrderBy } : undefined),
						...(field.limit !== undefined ? { limit: field.limit } : undefined),
						...(field.offset !== undefined ? { offset: field.offset } : undefined),
					}

					result = result.$(fieldName, manyArgs, nestedCallback)
				} else {
					// has-one relation
					const oneArgs: EntitySelectionOneArgs = {
						...(field.name !== fieldName ? { as: field.name } : undefined),
					}
					result = result.$(fieldName, oneArgs, nestedCallback)
				}
			} else {
				// Scalar field
				const columnArgs: EntitySelectionColumnArgs | undefined =
					field.name !== fieldName ? { as: field.name } : undefined
				result = result.$(fieldName, columnArgs)
			}
		}

		return result
	}
}
