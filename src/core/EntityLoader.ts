import type { BackendAdapter } from '../adapter/types.js'
import type { IdentityMap } from '../store/IdentityMap.js'
import type { QuerySpec } from '../selection/buildQuery.js'

/**
 * Result of entity loading operation
 */
export type EntityLoadResult<T> =
	| { status: 'success'; data: T }
	| { status: 'error'; error: Error }
	| { status: 'not_found' }

/**
 * Result of entity list loading operation
 */
export type EntityListLoadResult<T> =
	| { status: 'success'; data: T[] }
	| { status: 'error'; error: Error }

/**
 * Options for loading a single entity
 */
export interface LoadEntityOptions {
	entityType: string
	id: string
	query: QuerySpec
	useCache?: boolean
}

/**
 * Options for loading entity list
 */
export interface LoadEntityListOptions {
	entityType: string
	query: QuerySpec
	filter?: Record<string, unknown>
}

/**
 * Non-React service for loading entities.
 * Can be used in any JavaScript environment.
 */
export class EntityLoader {
	constructor(
		private readonly adapter: BackendAdapter,
		private readonly identityMap: IdentityMap,
	) {}

	/**
	 * Loads a single entity by ID.
	 */
	async loadOne<T>(options: LoadEntityOptions): Promise<EntityLoadResult<T>> {
		const { entityType, id, query, useCache = false } = options

		// Check cache first
		if (useCache && this.identityMap.has(entityType, id)) {
			const cached = this.identityMap.get(entityType, id)
			if (cached) {
				return { status: 'success', data: cached.data as T }
			}
		}

		try {
			const data = await this.adapter.fetchOne(entityType, id, query)

			if (!data) {
				return { status: 'not_found' }
			}

			// Store in identity map
			this.identityMap.getOrCreate(entityType, id, data as Record<string, unknown>)

			return { status: 'success', data: data as T }
		} catch (error) {
			return {
				status: 'error',
				error: error instanceof Error ? error : new Error(String(error)),
			}
		}
	}

	/**
	 * Loads multiple entities matching filter.
	 */
	async loadMany<T>(options: LoadEntityListOptions): Promise<EntityListLoadResult<T>> {
		const { entityType, query, filter } = options

		if (!this.adapter.fetchMany) {
			return {
				status: 'error',
				error: new Error('Backend adapter does not support fetchMany'),
			}
		}

		try {
			const data = await this.adapter.fetchMany(entityType, query, filter)

			// Store each entity in identity map
			for (const item of data) {
				const record = item as Record<string, unknown>
				if (typeof record['id'] === 'string') {
					this.identityMap.getOrCreate(entityType, record['id'], record)
				}
			}

			return { status: 'success', data: data as T[] }
		} catch (error) {
			return {
				status: 'error',
				error: error instanceof Error ? error : new Error(String(error)),
			}
		}
	}

	/**
	 * Checks if entity exists in cache.
	 */
	hasInCache(entityType: string, id: string): boolean {
		return this.identityMap.has(entityType, id)
	}

	/**
	 * Gets entity from cache if available.
	 */
	getFromCache<T>(entityType: string, id: string): T | null {
		const record = this.identityMap.get(entityType, id)
		return record ? (record.data as T) : null
	}
}

/**
 * Creates an EntityLoader instance.
 * Factory function for easier testing and dependency injection.
 */
export function createEntityLoader(
	adapter: BackendAdapter,
	identityMap: IdentityMap,
): EntityLoader {
	return new EntityLoader(adapter, identityMap)
}
