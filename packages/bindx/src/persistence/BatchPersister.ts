import type { BackendAdapter } from '../adapter/types.js'
import type { ActionDispatcher } from '../core/ActionDispatcher.js'
import type { MutationDataCollector } from '../core/PersistenceManager.js'
import type { SchemaRegistry } from '../schema/SchemaRegistry.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import type { UndoManager } from '../undo/UndoManager.js'
import { ChangeRegistry, type DirtyEntity } from './ChangeRegistry.js'
import type {
	BatchPersistOptions,
	EntityPersistResult,
	PersistenceResult,
	PersistScope,
	TransactionMutation,
	TransactionResult,
} from './types.js'
import { setPersisting, commitEntity, addFieldError, addEntityError, addRelationError, clearAllServerErrors } from '../core/actions.js'
import { extractMappedErrors, type ContemberMutationResult } from '../errors/pathMapper.js'
import { createServerError } from '../errors/types.js'

/**
 * Options for BatchPersister
 */
export interface BatchPersisterOptions {
	/**
	 * Custom mutation collector for building complex mutation inputs.
	 */
	mutationCollector?: MutationDataCollector

	/**
	 * UndoManager instance to block during persist operations.
	 */
	undoManager?: UndoManager

	/**
	 * Schema registry for mapping server errors to fields.
	 */
	schema?: SchemaRegistry
}

/**
 * BatchPersister orchestrates multi-entity persistence with:
 * - Deduplication (same entity referenced multiple times → single mutation)
 * - Dependency ordering (new entities before entities referencing them)
 * - Transactional execution (all-or-nothing via adapter.persistTransaction)
 * - Field-level granularity (persist only specific fields)
 */
export class BatchPersister {
	private readonly changeRegistry: ChangeRegistry
	private readonly mutationCollector?: MutationDataCollector
	private readonly undoManager?: UndoManager
	private readonly schema?: SchemaRegistry

	constructor(
		private readonly adapter: BackendAdapter,
		private readonly store: SnapshotStore,
		private readonly dispatcher: ActionDispatcher,
		options?: BatchPersisterOptions,
	) {
		this.changeRegistry = new ChangeRegistry(store)
		this.mutationCollector = options?.mutationCollector
		this.undoManager = options?.undoManager
		this.schema = options?.schema
	}

	/**
	 * Gets the change registry for external access.
	 */
	getChangeRegistry(): ChangeRegistry {
		return this.changeRegistry
	}

	/**
	 * Persists all dirty entities in a single transaction.
	 */
	async persistAll(options?: BatchPersistOptions): Promise<PersistenceResult> {
		return this.persistScope({ type: 'all' }, options)
	}

	/**
	 * Persists a single entity.
	 */
	async persist(
		entityType: string,
		entityId: string,
		options?: BatchPersistOptions,
	): Promise<EntityPersistResult> {
		const result = await this.persistScope(
			{ type: 'entity', entityType, entityId },
			options,
		)
		return result.results[0] ?? {
			entityType,
			entityId,
			operation: 'update',
			success: false,
			error: { message: 'Entity not found or not dirty' },
		}
	}

	/**
	 * Persists specific fields of an entity.
	 */
	async persistFields(
		entityType: string,
		entityId: string,
		fields: readonly string[],
		options?: BatchPersistOptions,
	): Promise<EntityPersistResult> {
		const result = await this.persistScope(
			{ type: 'fields', entityType, entityId, fields },
			options,
		)
		return result.results[0] ?? {
			entityType,
			entityId,
			operation: 'update',
			success: false,
			error: { message: 'Entity not found or specified fields not dirty' },
		}
	}

	/**
	 * Persists entities matching the given scope.
	 */
	async persistScope(
		scope: PersistScope,
		options?: BatchPersistOptions,
	): Promise<PersistenceResult> {
		const skipInFlight = options?.skipInFlight ?? true

		// Collect entities to persist based on scope
		const entitiesToPersist = this.collectEntitiesForScope(scope, skipInFlight)

		if (entitiesToPersist.length === 0) {
			return {
				success: true,
				results: [],
				successCount: 0,
				failedCount: 0,
				skippedCount: 0,
			}
		}

		// Check for client validation errors
		for (const entity of entitiesToPersist) {
			if (this.store.hasClientErrors(entity.entityType, entity.entityId)) {
				return {
					success: false,
					results: [{
						entityType: entity.entityType,
						entityId: entity.entityId,
						operation: entity.changeType,
						success: false,
						error: { message: `Entity ${entity.entityType}:${entity.entityId} has client validation errors` },
					}],
					successCount: 0,
					failedCount: 1,
					skippedCount: entitiesToPersist.length - 1,
				}
			}
		}

		// Sort by dependencies (creates first)
		const sortedEntities = this.sortByDependencies(entitiesToPersist)

		// Mark all as in-flight
		this.changeRegistry.markInFlight(sortedEntities)

		// Set persisting state for all entities
		for (const entity of sortedEntities) {
			this.dispatcher.dispatch(setPersisting(entity.entityType, entity.entityId, true))
			this.dispatcher.dispatch(clearAllServerErrors(entity.entityType, entity.entityId))
		}

		// Block undo during persist
		this.undoManager?.block()

		try {
			// Build mutations
			const mutations = this.buildMutations(sortedEntities, scope)

			if (mutations.length === 0) {
				// Nothing to persist
				return {
					success: true,
					results: [],
					successCount: 0,
					failedCount: 0,
					skippedCount: 0,
				}
			}

			// Execute transaction
			const transactionResult = await this.executeTransaction(mutations, options?.signal)

			// Process results
			return this.processTransactionResult(sortedEntities, transactionResult, scope)

		} finally {
			// Clear in-flight status
			this.changeRegistry.clearInFlight(sortedEntities)

			// Clear persisting state
			for (const entity of sortedEntities) {
				this.dispatcher.dispatch(setPersisting(entity.entityType, entity.entityId, false))
			}

			// Unblock undo
			this.undoManager?.unblock()
		}
	}

	/**
	 * Collects entities to persist based on the scope.
	 */
	private collectEntitiesForScope(
		scope: PersistScope,
		skipInFlight: boolean,
	): DirtyEntity[] {
		let entities: DirtyEntity[]

		switch (scope.type) {
			case 'all':
				entities = skipInFlight
					? [...this.changeRegistry.getDirtyEntitiesNotInFlight()]
					: [...this.changeRegistry.getDirtyEntities()]
				break

			case 'entity': {
				const dirtyEntities = this.changeRegistry.getDirtyEntities()
				const entity = dirtyEntities.find(
					e => e.entityType === scope.entityType && e.entityId === scope.entityId,
				)
				entities = entity ? [entity] : []
				break
			}

			case 'fields': {
				// For field scope, we need the entity even if only the specified fields are dirty
				const snapshot = this.store.getEntitySnapshot(scope.entityType, scope.entityId)
				if (!snapshot) {
					entities = []
					break
				}

				const dirtyFields = this.store.getDirtyFields(scope.entityType, scope.entityId)
				const relevantDirtyFields = scope.fields.filter(f => dirtyFields.includes(f))

				if (relevantDirtyFields.length === 0) {
					entities = []
					break
				}

				// Determine change type
				let changeType: 'create' | 'update' | 'delete' = 'update'
				if (!this.store.existsOnServer(scope.entityType, scope.entityId)) {
					changeType = 'create'
				}

				entities = [{
					entityType: scope.entityType,
					entityId: scope.entityId,
					changeType,
					dirtyFields: relevantDirtyFields,
					dirtyRelations: [],
				}]
				break
			}

			case 'relation': {
				const dirtyRelations = this.store.getDirtyRelations(scope.entityType, scope.entityId)
				if (!dirtyRelations.includes(scope.relationName)) {
					entities = []
					break
				}

				entities = [{
					entityType: scope.entityType,
					entityId: scope.entityId,
					changeType: 'update',
					dirtyFields: [],
					dirtyRelations: [scope.relationName],
				}]
				break
			}

			case 'custom':
				entities = scope.entities
					.map(e => {
						const dirtyEntities = this.changeRegistry.getDirtyEntities()
						return dirtyEntities.find(
							d => d.entityType === e.entityType && d.entityId === e.entityId,
						)
					})
					.filter((e): e is DirtyEntity => e !== undefined)
				break
		}

		// Filter out in-flight if requested
		if (skipInFlight) {
			entities = entities.filter(
				e => !this.changeRegistry.isInFlight(e.entityType, e.entityId),
			)
		}

		return entities
	}

	/**
	 * Sorts entities by dependencies (creates before updates that reference them).
	 */
	private sortByDependencies(entities: DirtyEntity[]): DirtyEntity[] {
		// Simple sort: creates first, then updates, then deletes
		return [...entities].sort((a, b) => {
			const order = { create: 0, update: 1, delete: 2 }
			return order[a.changeType] - order[b.changeType]
		})
	}

	/**
	 * Builds mutations for the given entities.
	 */
	private buildMutations(
		entities: DirtyEntity[],
		scope: PersistScope,
	): TransactionMutation[] {
		const mutations: TransactionMutation[] = []

		for (const entity of entities) {
			let data: Record<string, unknown> | null = null

			if (entity.changeType === 'delete') {
				mutations.push({
					entityType: entity.entityType,
					entityId: entity.entityId,
					operation: 'delete',
				})
				continue
			}

			// Collect mutation data
			if (scope.type === 'fields' && scope.entityType === entity.entityType && scope.entityId === entity.entityId) {
				// Field-specific collection
				data = this.collectFieldsData(entity.entityType, entity.entityId, scope.fields)
			} else if (entity.changeType === 'create') {
				data = this.mutationCollector?.collectCreateData?.(entity.entityType, entity.entityId)
					?? this.collectCreateData(entity.entityType, entity.entityId)
			} else {
				data = this.mutationCollector?.collectUpdateData(entity.entityType, entity.entityId)
					?? this.collectUpdateData(entity.entityType, entity.entityId)
			}

			if (data && Object.keys(data).length > 0) {
				mutations.push({
					entityType: entity.entityType,
					entityId: entity.entityId,
					operation: entity.changeType,
					data,
				})
			}
		}

		return mutations
	}

	/**
	 * Collects data for specific fields only.
	 */
	private collectFieldsData(
		entityType: string,
		entityId: string,
		fields: readonly string[],
	): Record<string, unknown> | null {
		const snapshot = this.store.getEntitySnapshot(entityType, entityId)
		if (!snapshot) return null

		const data = snapshot.data as Record<string, unknown>
		const result: Record<string, unknown> = {}

		for (const field of fields) {
			if (field in data) {
				result[field] = data[field]
			}
		}

		return Object.keys(result).length > 0 ? result : null
	}

	/**
	 * Simple update data collection (field diff).
	 */
	private collectUpdateData(
		entityType: string,
		entityId: string,
	): Record<string, unknown> | null {
		const snapshot = this.store.getEntitySnapshot(entityType, entityId)
		if (!snapshot) return null

		const data = snapshot.data as Record<string, unknown>
		const serverData = snapshot.serverData as Record<string, unknown>
		const changes: Record<string, unknown> = {}

		for (const [key, value] of Object.entries(data)) {
			if (key === 'id') continue
			if (JSON.stringify(value) !== JSON.stringify(serverData[key])) {
				changes[key] = value
			}
		}

		return Object.keys(changes).length > 0 ? changes : null
	}

	/**
	 * Simple create data collection.
	 */
	private collectCreateData(
		entityType: string,
		entityId: string,
	): Record<string, unknown> | null {
		const snapshot = this.store.getEntitySnapshot(entityType, entityId)
		if (!snapshot) return null

		const data = snapshot.data as Record<string, unknown>
		const createData: Record<string, unknown> = {}

		for (const [key, value] of Object.entries(data)) {
			if (key === 'id' && typeof value === 'string' && value.startsWith('__temp_')) {
				continue
			}
			if (value !== null && value !== undefined) {
				createData[key] = value
			}
		}

		return Object.keys(createData).length > 0 ? createData : null
	}

	/**
	 * Executes mutations as a transaction.
	 */
	private async executeTransaction(
		mutations: TransactionMutation[],
		signal?: AbortSignal,
	): Promise<TransactionResult> {
		// Check if adapter supports transactions
		if ('persistTransaction' in this.adapter && typeof this.adapter.persistTransaction === 'function') {
			try {
				return await this.adapter.persistTransaction(mutations)
			} catch (error) {
				// Adapter threw an exception - mark all as failed
				return {
					ok: false,
					results: mutations.map(m => ({
						entityType: m.entityType,
						entityId: m.entityId,
						ok: false,
						errorMessage: error instanceof Error ? error.message : String(error),
					})),
				}
			}
		}

		// Fallback: execute sequentially (not truly transactional)
		const results: TransactionResult['results'][number][] = []
		let allOk = true

		for (const mutation of mutations) {
			if (signal?.aborted) {
				allOk = false
				results.push({
					entityType: mutation.entityType,
					entityId: mutation.entityId,
					ok: false,
					errorMessage: 'Operation aborted',
				})
				continue
			}

			try {
				if (mutation.operation === 'delete') {
					if (this.adapter.delete) {
						const result = await this.adapter.delete(mutation.entityType, mutation.entityId)
						results.push({
							entityType: mutation.entityType,
							entityId: mutation.entityId,
							ok: result.ok,
							errorMessage: result.errorMessage,
							mutationResult: result.mutationResult,
						})
						if (!result.ok) allOk = false
					}
				} else if (mutation.operation === 'create') {
					if (this.adapter.create && mutation.data) {
						const result = await this.adapter.create(mutation.entityType, mutation.data)
						const persistedId = result.data?.['id'] as string | undefined
						results.push({
							entityType: mutation.entityType,
							entityId: mutation.entityId,
							ok: result.ok,
							persistedId,
							errorMessage: result.errorMessage,
							mutationResult: result.mutationResult,
						})
						if (!result.ok) allOk = false
					}
				} else {
					// update
					if (mutation.data) {
						const result = await this.adapter.persist(
							mutation.entityType,
							mutation.entityId,
							mutation.data,
						)
						results.push({
							entityType: mutation.entityType,
							entityId: mutation.entityId,
							ok: result.ok,
							errorMessage: result.errorMessage,
							mutationResult: result.mutationResult,
						})
						if (!result.ok) allOk = false
					}
				}
			} catch (error) {
				allOk = false
				results.push({
					entityType: mutation.entityType,
					entityId: mutation.entityId,
					ok: false,
					errorMessage: error instanceof Error ? error.message : String(error),
				})
			}
		}

		return { ok: allOk, results }
	}

	/**
	 * Processes transaction result and commits/rolls back as needed.
	 */
	private processTransactionResult(
		entities: DirtyEntity[],
		transactionResult: TransactionResult,
		scope: PersistScope,
	): PersistenceResult {
		const results: EntityPersistResult[] = []
		let successCount = 0
		let failedCount = 0

		if (transactionResult.ok) {
			// All succeeded - commit all
			for (let i = 0; i < transactionResult.results.length; i++) {
				const mutationResult = transactionResult.results[i]!
				const entity = entities.find(
					e => e.entityType === mutationResult.entityType && e.entityId === mutationResult.entityId,
				)

				if (entity) {
					// Commit based on scope
					if (scope.type === 'fields' && scope.entityType === entity.entityType && scope.entityId === entity.entityId) {
						// Partial commit for field scope
						this.store.commitFields(entity.entityType, entity.entityId, [...scope.fields])
					} else {
						// Full commit
						this.dispatcher.dispatch(commitEntity(entity.entityType, entity.entityId))
						this.store.commitAllRelations(entity.entityType, entity.entityId)
					}

					// Map temp ID if create
					if (entity.changeType === 'create' && mutationResult.persistedId) {
						this.store.mapTempIdToPersistedId(
							entity.entityType,
							entity.entityId,
							mutationResult.persistedId,
						)
					}

					results.push({
						entityType: entity.entityType,
						entityId: entity.entityId,
						operation: entity.changeType,
						success: true,
						persistedId: mutationResult.persistedId,
					})
					successCount++
				}
			}
		} else {
			// Transaction failed - map errors, don't commit anything
			for (const mutationResult of transactionResult.results) {
				const entity = entities.find(
					e => e.entityType === mutationResult.entityType && e.entityId === mutationResult.entityId,
				)

				if (entity) {
					if (!mutationResult.ok) {
						// Map errors to fields
						this.mapServerErrors(
							entity.entityType,
							entity.entityId,
							mutationResult.mutationResult,
							mutationResult.errorMessage,
						)
					}

					results.push({
						entityType: entity.entityType,
						entityId: entity.entityId,
						operation: entity.changeType,
						success: mutationResult.ok,
						error: mutationResult.ok ? undefined : {
							message: mutationResult.errorMessage ?? 'Unknown error',
							mutationResult: mutationResult.mutationResult,
						},
						persistedId: mutationResult.persistedId,
					})

					if (mutationResult.ok) {
						successCount++
					} else {
						failedCount++
					}
				}
			}
		}

		return {
			success: transactionResult.ok,
			results,
			successCount,
			failedCount,
			skippedCount: 0,
		}
	}

	/**
	 * Maps server errors to entity fields/relations.
	 */
	private mapServerErrors(
		entityType: string,
		entityId: string,
		mutationResult?: ContemberMutationResult,
		errorMessage?: string,
	): void {
		if (!mutationResult) {
			if (errorMessage) {
				this.dispatcher.dispatch(
					addEntityError(entityType, entityId, createServerError(errorMessage)),
				)
			}
			return
		}

		if (this.schema) {
			const mappedErrors = extractMappedErrors(mutationResult, entityType, this.schema)

			for (const mapped of mappedErrors) {
				if (mapped.type === 'field' && mapped.name) {
					this.dispatcher.dispatch(
						addFieldError(entityType, entityId, mapped.name, mapped.error),
					)
				} else if (mapped.type === 'relation' && mapped.name) {
					this.dispatcher.dispatch(
						addRelationError(entityType, entityId, mapped.name, mapped.error),
					)
				} else {
					this.dispatcher.dispatch(
						addEntityError(entityType, entityId, mapped.error),
					)
				}
			}
		} else {
			for (const error of mutationResult.errors) {
				this.dispatcher.dispatch(
					addEntityError(entityType, entityId, createServerError(error.message, error.type)),
				)
			}
			for (const error of mutationResult.validation.errors) {
				this.dispatcher.dispatch(
					addEntityError(entityType, entityId, createServerError(error.message.text, undefined, 'VALIDATION_ERROR')),
				)
			}
		}
	}

	/**
	 * Cancels all in-flight operations.
	 */
	cancelAll(): void {
		this.changeRegistry.clearAllInFlight()
	}
}
