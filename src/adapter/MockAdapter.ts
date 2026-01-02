import type { QuerySpec, QueryFieldSpec } from '../fragment/buildQuery.js'
import type { BackendAdapter } from './types.js'

/**
 * In-memory data store structure
 */
export type MockDataStore = {
	[entityType: string]: {
		[id: string]: Record<string, unknown>
	}
}

/**
 * Options for MockAdapter
 */
export interface MockAdapterOptions {
	/** Simulated network delay in milliseconds (default: 100) */
	delay?: number
	/** Whether to log operations to console (default: false) */
	debug?: boolean
}

/**
 * Mock backend adapter for testing and development.
 * Stores data in memory and simulates async operations.
 */
export class MockAdapter implements BackendAdapter {
	private readonly delay: number
	private readonly debug: boolean

	constructor(
		private store: MockDataStore,
		options: MockAdapterOptions = {},
	) {
		this.delay = options.delay ?? 100
		this.debug = options.debug ?? false
	}

	/**
	 * Simulates network delay
	 */
	private async simulateDelay(): Promise<void> {
		if (this.delay > 0) {
			await new Promise(resolve => setTimeout(resolve, this.delay))
		}
	}

	/**
	 * Logs operations if debug is enabled
	 */
	private log(operation: string, ...args: unknown[]): void {
		if (this.debug) {
			console.log(`[MockAdapter] ${operation}:`, ...args)
		}
	}

	async fetchOne(
		entityType: string,
		id: string,
		query: QuerySpec,
	): Promise<Record<string, unknown>> {
		this.log('fetchOne', { entityType, id, query })
		await this.simulateDelay()

		const entityStore = this.store[entityType]
		if (!entityStore) {
			throw new Error(`Entity type '${entityType}' not found in store`)
		}

		const entity = entityStore[id]
		if (!entity) {
			throw new Error(`Entity '${entityType}:${id}' not found`)
		}

		// Project only requested fields
		const result = this.projectFields(entity, query.fields)
		this.log('fetchOne result', result)

		return result
	}

	async fetchMany(
		entityType: string,
		query: QuerySpec,
		filter?: Record<string, unknown>,
	): Promise<Record<string, unknown>[]> {
		this.log('fetchMany', { entityType, query, filter })
		await this.simulateDelay()

		const entityStore = this.store[entityType]
		if (!entityStore) {
			return []
		}

		let entities = Object.values(entityStore)

		// Simple filter implementation
		if (filter) {
			entities = entities.filter(entity => {
				for (const [key, value] of Object.entries(filter)) {
					if (entity[key] !== value) return false
				}
				return true
			})
		}

		return entities.map(entity => this.projectFields(entity, query.fields))
	}

	async persist(
		entityType: string,
		id: string,
		changes: Record<string, unknown>,
	): Promise<void> {
		this.log('persist', { entityType, id, changes })
		await this.simulateDelay()

		const entityStore = this.store[entityType]
		if (!entityStore) {
			throw new Error(`Entity type '${entityType}' not found in store`)
		}

		const entity = entityStore[id]
		if (!entity) {
			throw new Error(`Entity '${entityType}:${id}' not found`)
		}

		// Merge changes into entity
		this.mergeDeep(entity, changes)
		this.log('persist result', entity)
	}

	async create(
		entityType: string,
		data: Record<string, unknown>,
	): Promise<Record<string, unknown>> {
		this.log('create', { entityType, data })
		await this.simulateDelay()

		// Ensure entity store exists
		if (!this.store[entityType]) {
			this.store[entityType] = {}
		}

		// Generate ID if not provided
		const id = (data['id'] as string) ?? this.generateId()
		const entity = { ...data, id }

		this.store[entityType]![id] = entity
		this.log('create result', entity)

		return entity
	}

	async delete(entityType: string, id: string): Promise<void> {
		this.log('delete', { entityType, id })
		await this.simulateDelay()

		const entityStore = this.store[entityType]
		if (entityStore) {
			delete entityStore[id]
		}
	}

	/**
	 * Projects only the requested fields from source data
	 * @param source The source object to project from
	 * @param fields The field specs to project
	 * @param basePath The current base path (for nested objects, paths are relative to this)
	 */
	private projectFields(
		source: Record<string, unknown>,
		fields: QueryFieldSpec[],
		basePath: string[] = [],
	): Record<string, unknown> {
		const result: Record<string, unknown> = {}

		for (const field of fields) {
			// Get relative path by removing the base path prefix
			const relativePath = field.sourcePath.slice(basePath.length)
			const value = this.getNestedValue(source, relativePath)

			if (field.isArray && Array.isArray(value) && field.nested) {
				// Project each item in array - items have paths relative to array
				result[field.name] = value.map(item =>
					this.projectFields(item as Record<string, unknown>, field.nested!.fields, []),
				)
			} else if (field.nested && value && typeof value === 'object') {
				// Project nested object - use field.sourcePath as new basePath
				result[field.name] = this.projectFields(
					value as Record<string, unknown>,
					field.nested.fields,
					field.sourcePath,
				)
			} else {
				// Scalar or leaf value
				result[field.name] = value
			}
		}

		return result
	}

	/**
	 * Gets a nested value from an object using a path
	 */
	private getNestedValue(obj: Record<string, unknown>, path: string[]): unknown {
		let current: unknown = obj

		for (const key of path) {
			if (current === null || current === undefined || typeof current !== 'object') {
				return undefined
			}
			current = (current as Record<string, unknown>)[key]
		}

		return current
	}

	/**
	 * Deep merges changes into target object
	 */
	private mergeDeep(target: Record<string, unknown>, source: Record<string, unknown>): void {
		for (const [key, value] of Object.entries(source)) {
			if (
				value &&
				typeof value === 'object' &&
				!Array.isArray(value) &&
				target[key] &&
				typeof target[key] === 'object' &&
				!Array.isArray(target[key])
			) {
				// Recursively merge nested objects
				this.mergeDeep(target[key] as Record<string, unknown>, value as Record<string, unknown>)
			} else {
				target[key] = value
			}
		}
	}

	/**
	 * Generates a simple unique ID
	 */
	private generateId(): string {
		return `mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
	}

	/**
	 * Gets the current store state (for testing/debugging)
	 */
	getStore(): MockDataStore {
		return this.store
	}

	/**
	 * Resets the store to initial state
	 */
	resetStore(newStore: MockDataStore): void {
		this.store = newStore
	}
}
