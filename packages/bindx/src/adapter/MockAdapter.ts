import type { BackendAdapter, Query, QueryResult, QueryOptions, GetQuery, ListQuery, PersistResult, CreateResult, DeleteResult } from './types.js'
import { MockQueryEngine } from './MockQueryEngine.js'

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
	private readonly queryEngine: MockQueryEngine

	constructor(
		private store: MockDataStore,
		options: MockAdapterOptions = {},
	) {
		this.delay = options.delay ?? 100
		this.debug = options.debug ?? false
		this.queryEngine = new MockQueryEngine()
	}

	/**
	 * Simulates network delay with abort support
	 */
	private async simulateDelay(signal?: AbortSignal): Promise<void> {
		if (this.delay > 0) {
			await new Promise<void>((resolve, reject) => {
				const timeoutId = setTimeout(resolve, this.delay)

				if (signal) {
					if (signal.aborted) {
						clearTimeout(timeoutId)
						reject(new DOMException('Aborted', 'AbortError'))
						return
					}

					signal.addEventListener('abort', () => {
						clearTimeout(timeoutId)
						reject(new DOMException('Aborted', 'AbortError'))
					}, { once: true })
				}
			})
		}

		// Check if aborted after delay
		if (signal?.aborted) {
			throw new DOMException('Aborted', 'AbortError')
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

	async query(queries: readonly Query[], options?: QueryOptions): Promise<QueryResult[]> {
		this.log('query', { queries })
		await this.simulateDelay(options?.signal)

		return queries.map(q => {
			if (q.type === 'get') {
				return this.executeGet(q)
			} else {
				return this.executeList(q)
			}
		})
	}

	private executeGet(query: GetQuery): QueryResult {
		const entityStore = this.store[query.entityType]
		if (!entityStore) {
			return { type: 'get', data: null }
		}

		// Find entity by unique field(s) in 'by'
		const by = query.by
		const [field, value] = Object.entries(by)[0] ?? []

		if (!field || value === undefined) {
			return { type: 'get', data: null }
		}

		let entity: Record<string, unknown> | undefined
		if (field === 'id') {
			// Direct lookup by ID
			entity = entityStore[value as string]
		} else {
			// Search by other unique field
			entity = Object.values(entityStore).find(e => e[field] === value)
		}

		if (!entity) {
			return { type: 'get', data: null }
		}

		const result = this.queryEngine.projectFields(entity, query.spec.fields)
		this.log('executeGet result', result)

		return { type: 'get', data: result }
	}

	private executeList(query: ListQuery): QueryResult {
		const entityStore = this.store[query.entityType]
		if (!entityStore) {
			return { type: 'list', data: [] }
		}

		let entities = Object.values(entityStore)

		// Apply filter using query engine
		if (query.filter) {
			entities = this.queryEngine.filter(entities, query.filter as Record<string, unknown>)
		}

		// Apply ordering using query engine
		if (query.orderBy && query.orderBy.length > 0) {
			entities = this.queryEngine.orderBy(entities, query.orderBy)
		}

		// Apply pagination using query engine
		entities = this.queryEngine.paginate(entities, query.offset, query.limit)

		const results = entities.map(entity => this.queryEngine.projectFields(entity, query.spec.fields))
		this.log('executeList result', results)

		return { type: 'list', data: results }
	}

	async persist(
		entityType: string,
		id: string,
		changes: Record<string, unknown>,
	): Promise<PersistResult> {
		this.log('persist', { entityType, id, changes })
		await this.simulateDelay()

		const entityStore = this.store[entityType]
		if (!entityStore) {
			return {
				ok: false,
				errorMessage: `Entity type '${entityType}' not found in store`,
			}
		}

		const entity = entityStore[id]
		if (!entity) {
			return {
				ok: false,
				errorMessage: `Entity '${entityType}:${id}' not found`,
			}
		}

		// Process changes with Contember-style operation support
		this.applyChanges(entity, changes)
		this.log('persist result', entity)

		return { ok: true }
	}

	/**
	 * Applies changes to an entity, handling Contember-style relation operations.
	 * Supports:
	 * - Scalar fields: direct assignment
	 * - HasOne: { connect: { id } }, { disconnect: true }, { delete: true }, { create: {...} }, { update: {...} }
	 * - HasMany: [{ connect: { id } }, { disconnect: { id } }, { delete: { id } }, { create: {...} }, { update: { by: { id }, data: {...} } }]
	 */
	private applyChanges(entity: Record<string, unknown>, changes: Record<string, unknown>): void {
		for (const [key, value] of Object.entries(changes)) {
			if (value === null || value === undefined) {
				entity[key] = value
				continue
			}

			// Check if it's a Contember-style relation operation
			if (typeof value === 'object' && !Array.isArray(value)) {
				const operation = value as Record<string, unknown>

				if ('connect' in operation) {
					// HasOne connect: { connect: { id: '...' } }
					const connectData = operation['connect'] as Record<string, unknown>
					const targetId = connectData['id'] as string
					entity[key] = this.resolveRelatedEntity(targetId)
				} else if ('disconnect' in operation && operation['disconnect'] === true) {
					// HasOne disconnect: { disconnect: true }
					entity[key] = null
				} else if ('delete' in operation && operation['delete'] === true) {
					// HasOne delete: { delete: true }
					// Delete the related entity and set to null
					const existingRelation = entity[key] as Record<string, unknown> | null
					if (existingRelation?.['id']) {
						this.deleteRelatedEntity(existingRelation['id'] as string)
					}
					entity[key] = null
				} else if ('create' in operation) {
					// HasOne create: { create: { name: '...', ... } }
					const createData = operation['create'] as Record<string, unknown>
					entity[key] = this.createRelatedEntity(createData)
				} else if ('update' in operation) {
					// HasOne update: { update: { name: '...', ... } }
					const updateData = operation['update'] as Record<string, unknown>
					const existingRelation = entity[key] as Record<string, unknown> | null
					if (existingRelation) {
						this.applyChanges(existingRelation, updateData)
					}
				} else {
					// Regular object value (not a Contember operation)
					entity[key] = value
				}
			} else if (Array.isArray(value)) {
				// HasMany operations: [{ connect: { id } }, { disconnect: { id } }, ...]
				entity[key] = this.applyHasManyOperations(
					entity[key] as Array<Record<string, unknown>> | undefined,
					value as Array<Record<string, unknown>>,
				)
			} else {
				// Scalar field
				entity[key] = value
			}
		}
	}

	/**
	 * Applies hasMany relation operations.
	 */
	private applyHasManyOperations(
		currentItems: Array<Record<string, unknown>> | undefined,
		operations: Array<Record<string, unknown>>,
	): Array<Record<string, unknown>> {
		const items = [...(currentItems ?? [])]

		for (const operation of operations) {
			if ('connect' in operation) {
				// Connect: { connect: { id: '...' } }
				const connectData = operation['connect'] as Record<string, unknown>
				const targetId = connectData['id'] as string
				// Only add if not already present
				if (!items.some(item => item['id'] === targetId)) {
					const relatedEntity = this.resolveRelatedEntity(targetId)
					if (relatedEntity) {
						items.push(relatedEntity)
					}
				}
			} else if ('disconnect' in operation) {
				// Disconnect: { disconnect: { id: '...' } }
				const disconnectData = operation['disconnect'] as Record<string, unknown>
				const targetId = disconnectData['id'] as string
				const index = items.findIndex(item => item['id'] === targetId)
				if (index >= 0) {
					items.splice(index, 1)
				}
			} else if ('delete' in operation) {
				// Delete: { delete: { id: '...' } }
				const deleteData = operation['delete'] as Record<string, unknown>
				const targetId = deleteData['id'] as string
				const index = items.findIndex(item => item['id'] === targetId)
				if (index >= 0) {
					items.splice(index, 1)
					this.deleteRelatedEntity(targetId)
				}
			} else if ('create' in operation) {
				// Create: { create: { name: '...', ... } }
				const createData = operation['create'] as Record<string, unknown>
				const newEntity = this.createRelatedEntity(createData)
				if (newEntity) {
					items.push(newEntity)
				}
			} else if ('update' in operation) {
				// Update: { update: { by: { id: '...' }, data: { ... } } }
				const updateOp = operation['update'] as Record<string, unknown>
				const by = updateOp['by'] as Record<string, unknown>
				const data = updateOp['data'] as Record<string, unknown>
				const targetId = by['id'] as string
				const item = items.find(item => item['id'] === targetId)
				if (item) {
					this.applyChanges(item, data)
				}
			}
		}

		return items
	}

	/**
	 * Resolves a related entity by ID from any entity store.
	 * Returns a copy of the entity data or { id } if not found.
	 */
	private resolveRelatedEntity(id: string): Record<string, unknown> | null {
		for (const entityStore of Object.values(this.store)) {
			if (entityStore[id]) {
				return { ...entityStore[id] }
			}
		}
		// Entity not found - return just the ID
		return { id }
	}

	/**
	 * Creates a related entity with a generated ID.
	 */
	private createRelatedEntity(data: Record<string, unknown>): Record<string, unknown> {
		const id = this.generateId()
		return { id, ...data }
	}

	/**
	 * Deletes a related entity from any entity store.
	 */
	private deleteRelatedEntity(id: string): void {
		for (const entityStore of Object.values(this.store)) {
			if (entityStore[id]) {
				delete entityStore[id]
				return
			}
		}
	}

	async create(
		entityType: string,
		data: Record<string, unknown>,
	): Promise<CreateResult> {
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

		return { ok: true, data: entity }
	}

	async delete(entityType: string, id: string): Promise<DeleteResult> {
		this.log('delete', { entityType, id })
		await this.simulateDelay()

		const entityStore = this.store[entityType]
		if (entityStore) {
			delete entityStore[id]
		}

		return { ok: true }
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
