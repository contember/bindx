import type { BackendAdapter } from '../adapter/types.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import type { QuerySpec } from '../selection/buildQuery.js'
import type { EntityWhere, EntityOrderBy } from '../selection/queryTypes.js'
import { createLoadError, type FieldError } from '../errors/types.js'

/**
 * Checks if an error is an AbortError that should be rethrown.
 */
function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError'
}

/**
 * Normalizes unknown error to Error instance.
 */
function normalizeError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error))
}

/**
 * Result of entity loading operation
 */
export type EntityLoadResult<T> =
	| { status: 'success'; data: T }
	| { status: 'error'; error: FieldError }
	| { status: 'not_found' }

/**
 * Result of entity list loading operation
 */
export type EntityListLoadResult<T> =
	| { status: 'success'; data: T[] }
	| { status: 'error'; error: FieldError }

/**
 * Options for loading a single entity
 */
export interface LoadEntityOptions {
	entityType: string
	id: string
	query: QuerySpec
	useCache?: boolean
	signal?: AbortSignal
}

/**
 * Options for loading entity list
 */
export interface LoadEntityListOptions<TEntity = unknown> {
	entityType: string
	query: QuerySpec
	filter?: EntityWhere<TEntity>
	orderBy?: readonly EntityOrderBy<TEntity>[]
	limit?: number
	offset?: number
	signal?: AbortSignal
}

/**
 * Non-React service for loading entities.
 * Can be used in any JavaScript environment.
 */
export class EntityLoader {
	constructor(
		private readonly adapter: BackendAdapter,
		private readonly store: SnapshotStore,
	) {}

	/**
	 * Loads a single entity by ID.
	 */
	async loadOne<T>(options: LoadEntityOptions): Promise<EntityLoadResult<T>> {
		const { entityType, id, query, useCache = false, signal } = options

		// Check cache first
		if (useCache && this.store.hasEntity(entityType, id)) {
			const snapshot = this.store.getEntitySnapshot(entityType, id)
			if (snapshot) {
				return { status: 'success', data: snapshot.data as T }
			}
		}

		try {
			const results = await this.adapter.query(
				[{ type: 'get', entityType, by: { id }, spec: query }],
				{ signal },
			)

			const result = results[0]
			if (!result || result.type !== 'get' || result.data === null) {
				return { status: 'not_found' }
			}

			// Store in snapshot store
			this.store.setEntityData(entityType, id, result.data, true)

			return { status: 'success', data: result.data as T }
		} catch (error) {
			if (isAbortError(error)) {
				throw error
			}
			return { status: 'error', error: createLoadError(normalizeError(error)) }
		}
	}

	/**
	 * Loads multiple entities matching filter.
	 */
	async loadMany<T, TEntity = unknown>(options: LoadEntityListOptions<TEntity>): Promise<EntityListLoadResult<T>> {
		const { entityType, query, filter, orderBy, limit, offset, signal } = options

		try {
			const results = await this.adapter.query(
				[{ type: 'list', entityType, filter, orderBy, limit, offset, spec: query }],
				{ signal },
			)

			const result = results[0]
			if (!result || result.type !== 'list') {
				return {
					status: 'error',
					error: createLoadError(new Error('Unexpected query result type')),
				}
			}

			this.store.batchNotifications(() => {
				for (const record of result.data) {
					if (typeof record['id'] === 'string') {
						this.store.setEntityData(entityType, record['id'], record, true)
					}
				}
			})

			return { status: 'success', data: result.data as T[] }
		} catch (error) {
			if (isAbortError(error)) {
				throw error
			}
			return { status: 'error', error: createLoadError(normalizeError(error)) }
		}
	}

	/**
	 * Checks if entity exists in cache.
	 */
	hasInCache(entityType: string, id: string): boolean {
		return this.store.hasEntity(entityType, id)
	}

	/**
	 * Gets entity from cache if available.
	 */
	getFromCache<T>(entityType: string, id: string): T | null {
		const snapshot = this.store.getEntitySnapshot(entityType, id)
		return snapshot ? (snapshot.data as T) : null
	}
}

/**
 * Creates an EntityLoader instance.
 * Factory function for easier testing and dependency injection.
 */
export function createEntityLoader(
	adapter: BackendAdapter,
	store: SnapshotStore,
): EntityLoader {
	return new EntityLoader(adapter, store)
}
