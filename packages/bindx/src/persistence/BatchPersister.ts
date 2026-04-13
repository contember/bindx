import type { BackendAdapter } from '../adapter/types.js'
import type { ActionDispatcher } from '../core/ActionDispatcher.js'
import type { MutationDataCollector } from './types.js'
import type { SchemaRegistry } from '../schema/SchemaRegistry.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import { isTempId } from '../store/entityId.js'
import type { UndoManager } from '../undo/UndoManager.js'
import { ChangeRegistry, type DirtyEntity } from './ChangeRegistry.js'
import type {
	BatchPersistOptions,
	EntityPersistResult,
	PersistenceResult,
	PersistScope,
	TransactionMutation,
	TransactionMutationResult,
	TransactionResult,
	UpdateMode,
} from './types.js'
import { setPersisting, commitEntity, resetEntity, addFieldError, addEntityError, addRelationError, clearAllServerErrors } from '../core/actions.js'
import { type ContemberMutationResult } from '../errors/pathMapper.js'
import { resolveAllErrors } from '../errors/errorPathResolver.js'
import { createServerError } from '../errors/types.js'
import { MutationCollector } from './MutationCollector.js'
import type { EntitySnapshot } from '../store/snapshots.js'
import type { StoredHasManyState, StoredRelationState } from '../store/SnapshotStore.js'
import { deepEqual } from '../utils/deepEqual.js'

/**
 * Captured state for pessimistic mode restoration.
 * Contains all the data needed to restore an entity's dirty state after
 * temporarily resetting it to server state during pessimistic persistence.
 */
interface CapturedEntityState {
	entityType: string
	entityId: string
	snapshot: EntitySnapshot | undefined
	relations: Map<string, StoredRelationState>
	hasManyStates: Map<string, StoredHasManyState>
}

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

	/**
	 * Default update mode for all persist operations.
	 * Can be overridden per-operation via BatchPersistOptions.
	 * @default 'optimistic'
	 */
	defaultUpdateMode?: UpdateMode
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
	private readonly defaultUpdateMode: UpdateMode

	constructor(
		private readonly adapter: BackendAdapter,
		private readonly store: SnapshotStore,
		private readonly dispatcher: ActionDispatcher,
		options?: BatchPersisterOptions,
	) {
		this.changeRegistry = new ChangeRegistry(store)
		this.undoManager = options?.undoManager
		this.schema = options?.schema
		this.defaultUpdateMode = options?.defaultUpdateMode ?? 'optimistic'
		// Use provided mutationCollector, or auto-create one from schema
		this.mutationCollector = options?.mutationCollector
			?? (options?.schema ? new MutationCollector(store, options.schema) : undefined)
	}

	/**
	 * Gets the default update mode for this persister.
	 */
	getDefaultUpdateMode(): UpdateMode {
		return this.defaultUpdateMode
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
		const updateMode = options?.updateMode ?? this.defaultUpdateMode

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

		// For pessimistic mode, capture dirty state before building mutations
		// This allows us to restore and commit the state after server confirmation
		let capturedStates: CapturedEntityState[] | null = null
		if (updateMode === 'pessimistic') {
			capturedStates = this.captureEntityStates(sortedEntities)
		}

		try {
			// Build mutations BEFORE resetting state (for pessimistic mode)
			// The mutations need to contain the dirty data to send to server
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

			// For pessimistic mode, reset entities to server state after capturing
			// This makes the UI show the "old" (server) data while persisting
			if (updateMode === 'pessimistic') {
				for (const entity of sortedEntities) {
					// Only reset updates, not creates (creates don't have server state)
					if (entity.changeType === 'update') {
						this.dispatcher.dispatch(resetEntity(entity.entityType, entity.entityId))
						this.store.resetAllRelations(entity.entityType, entity.entityId)
					}
				}
			}

			// Execute transaction
			const transactionResult = await this.executeTransaction(mutations, options?.signal)

			// Process results with captured state for pessimistic mode
			return this.processTransactionResult(sortedEntities, transactionResult, scope, options, capturedStates)

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
		// Exclude only non-create entities from nesting —
		// new entities should be nested inside their parent's mutation
		// to maintain correct relation connections without transaction support.
		if (this.mutationCollector instanceof MutationCollector) {
			const excludedIds = new Set(
				entities.filter(e => e.changeType !== 'create').map(e => e.entityId),
			)
			this.mutationCollector.setExcludedEntities(excludedIds)
		}

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
				const mc = this.mutationCollector
				data = mc?.collectCreateData
					? mc.collectCreateData(entity.entityType, entity.entityId)
					: this.collectCreateDataWithRelationCheck(entity)
			} else {
				data = this.mutationCollector
					? this.mutationCollector.collectUpdateData(entity.entityType, entity.entityId)
					: this.collectUpdateDataWithRelationCheck(entity)
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

		// Remove standalone create mutations for entities that were included
		// as nested inline creates inside another entity's mutation.
		if (this.mutationCollector instanceof MutationCollector) {
			const nestedIds = this.mutationCollector.getNestedEntityIds()
			if (nestedIds.size > 0) {
				return mutations.filter(m => !(m.operation === 'create' && nestedIds.has(m.entityId)))
			}
		}

		return mutations
	}

	/**
	 * Collects create data, throwing if dirty relations exist without a MutationCollector.
	 */
	private collectCreateDataWithRelationCheck(entity: DirtyEntity): Record<string, unknown> | null {
		this.assertNoRelationChanges(entity)
		return this.collectCreateData(entity.entityType, entity.entityId)
	}

	/**
	 * Collects update data, throwing if dirty relations exist without a MutationCollector.
	 */
	private collectUpdateDataWithRelationCheck(entity: DirtyEntity): Record<string, unknown> | null {
		this.assertNoRelationChanges(entity)
		return this.collectUpdateData(entity.entityType, entity.entityId)
	}

	/**
	 * Throws if the entity has dirty relations but no MutationCollector is configured.
	 */
	private assertNoRelationChanges(entity: DirtyEntity): void {
		if (entity.dirtyRelations.length > 0) {
			throw new Error(
				`Entity ${entity.entityType}:${entity.entityId} has dirty relations (${entity.dirtyRelations.join(', ')}), ` +
				`but no MutationCollector is configured. Relation changes would be silently lost. ` +
				`Provide a 'schema' or 'mutationCollector' option to enable relation persistence.`,
			)
		}
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
			if (!deepEqual(value, serverData[key])) {
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
			if (key === 'id' && typeof value === 'string' && isTempId(value)) {
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
						const nestedResults = result.ok && result.data && mutation.data
							? this.extractNestedResultsFromNode(mutation.data, result.data, mutation.entityType, mutation.entityId)
							: undefined
						results.push({
							entityType: mutation.entityType,
							entityId: mutation.entityId,
							ok: result.ok,
							persistedId,
							nestedResults,
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
						const nestedResults = result.ok && result.data && mutation.data
							? this.extractNestedResultsFromNode(mutation.data, result.data, mutation.entityType, mutation.entityId)
							: undefined
						results.push({
							entityType: mutation.entityType,
							entityId: mutation.entityId,
							ok: result.ok,
							nestedResults,
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
	 * For pessimistic mode, restores captured state on success.
	 */
	private processTransactionResult(
		entities: DirtyEntity[],
		transactionResult: TransactionResult,
		scope: PersistScope,
		options?: BatchPersistOptions,
		capturedStates?: CapturedEntityState[] | null,
	): PersistenceResult {
		const results: EntityPersistResult[] = []
		let successCount = 0
		let failedCount = 0
		const rollbackOnError = options?.rollbackOnError ?? false
		const isPessimistic = capturedStates != null

		if (transactionResult.ok) {
			// All succeeded - commit all
			for (let i = 0; i < transactionResult.results.length; i++) {
				const mutationResult = transactionResult.results[i]!
				const entity = entities.find(
					e => e.entityType === mutationResult.entityType && e.entityId === mutationResult.entityId,
				)

				if (entity) {
					// For pessimistic mode, restore captured state and commit
					if (isPessimistic && capturedStates) {
						const capturedState = capturedStates.find(
							s => s.entityType === entity.entityType && s.entityId === entity.entityId,
						)
						if (capturedState) {
							this.restoreAndCommitEntityState(capturedState)
						}
					} else {
						// Commit based on scope
						if (scope.type === 'fields' && scope.entityType === entity.entityType && scope.entityId === entity.entityId) {
							// Partial commit for field scope
							this.store.commitFields(entity.entityType, entity.entityId, [...scope.fields])
						} else {
							// Full commit
							this.dispatcher.dispatch(commitEntity(entity.entityType, entity.entityId))
							this.store.commitAllRelations(entity.entityType, entity.entityId)
						}
					}

					// Map temp ID if create
					if (entity.changeType === 'create' && mutationResult.persistedId) {
						this.store.mapTempIdToPersistedId(
							entity.entityType,
							entity.entityId,
							mutationResult.persistedId,
						)
					}

					// Process nested results (inline-created entities within this mutation)
					if (mutationResult.nestedResults) {
						this.commitNestedResults(mutationResult.nestedResults)
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

			// Commit nested entities that don't have explicit results from the adapter.
			// These entities were nested inside a parent mutation's data and exist on the server,
			// but the adapter may not provide individual results for them.
			this.commitUnresolvedNestedEntities(entities)
		} else {
			// Transaction failed - map errors and optionally rollback
			// For pessimistic mode, entities are already at server state, no rollback needed
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

						// Rollback optimistic changes if enabled (and not in pessimistic mode)
						// In pessimistic mode, we're already at server state, no rollback needed
						if (rollbackOnError && !isPessimistic) {
							this.rollbackEntity(entity)
						}
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
	 * Captures the current state of entities for pessimistic mode.
	 * This allows us to restore the dirty state after a successful persist.
	 */
	private captureEntityStates(entities: DirtyEntity[]): CapturedEntityState[] {
		return entities.map(entity => {
			const snapshot = this.store.getEntitySnapshot(entity.entityType, entity.entityId)
			const relations = this.store.getAllRelationsForEntity(entity.entityType, entity.entityId)
			const hasManyStates = this.store.getAllHasManyForEntity(entity.entityType, entity.entityId)

			return {
				entityType: entity.entityType,
				entityId: entity.entityId,
				snapshot,
				relations,
				hasManyStates,
			}
		})
	}

	/**
	 * Restores a captured entity state and commits it.
	 * Used in pessimistic mode after successful server confirmation.
	 */
	private restoreAndCommitEntityState(capturedState: CapturedEntityState): void {
		if (capturedState.snapshot) {
			// Restore the entity data from captured snapshot
			this.store.setEntityData(
				capturedState.entityType,
				capturedState.entityId,
				capturedState.snapshot.data as Record<string, unknown>,
				true, // Mark as server data since it's now confirmed
			)
		}

		// Restore and commit relations
		for (const [relationKey, relationState] of capturedState.relations) {
			const fieldName = relationKey.split(':')[2]
			if (fieldName) {
				this.store.setRelation(capturedState.entityType, capturedState.entityId, fieldName, {
					currentId: relationState.currentId,
					state: relationState.state,
				})
				this.store.commitRelation(capturedState.entityType, capturedState.entityId, fieldName)
			}
		}

		// Restore and commit has-many states
		for (const [hasManyKey, hasManyState] of capturedState.hasManyStates) {
			const fieldName = hasManyKey.split(':')[2]
			if (fieldName) {
				this.store.restoreHasManyState(capturedState.entityType, capturedState.entityId, fieldName, hasManyState)
				// Compute new server IDs: serverIds - removals + connections
				const newServerIds = new Set(hasManyState.serverIds)
				for (const removedId of hasManyState.plannedRemovals.keys()) {
					newServerIds.delete(removedId)
				}
				for (const connectedId of hasManyState.plannedConnections) {
					newServerIds.add(connectedId)
				}
				this.store.commitHasMany(capturedState.entityType, capturedState.entityId, fieldName, Array.from(newServerIds))
			}
		}
	}

	/**
	 * Rolls back an entity's optimistic changes to server state.
	 * Handles all mutation types: create, update, and delete.
	 */
	private rollbackEntity(entity: DirtyEntity): void {
		switch (entity.changeType) {
			case 'create':
				// For new entities, remove them from the store entirely
				// They don't exist on the server, so there's nothing to revert to
				this.store.removeEntity(entity.entityType, entity.entityId)
				break

			case 'update':
				// Reset entity data to server state
				this.dispatcher.dispatch(resetEntity(entity.entityType, entity.entityId))
				// Reset all relations to server state
				this.store.resetAllRelations(entity.entityType, entity.entityId)
				break

			case 'delete':
				// Unschedule deletion - the entity should remain as-is
				this.store.unscheduleForDeletion(entity.entityType, entity.entityId)
				break
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
			const resolved = resolveAllErrors(mutationResult, entityType, entityId, {
				schema: this.schema,
				store: this.store,
			})

			// Clear server errors for all resolved target entities
			const clearedEntities = new Set<string>()
			for (const { target } of resolved) {
				const key = `${target.entityType}:${target.entityId}`
				if (!clearedEntities.has(key)) {
					clearedEntities.add(key)
					this.dispatcher.dispatch(clearAllServerErrors(target.entityType, target.entityId))
				}
			}

			for (const { target, error } of resolved) {
				if (target.type === 'field' && target.fieldName) {
					this.dispatcher.dispatch(
						addFieldError(target.entityType, target.entityId, target.fieldName, error),
					)
				} else if (target.type === 'relation' && target.fieldName) {
					this.dispatcher.dispatch(
						addRelationError(target.entityType, target.entityId, target.fieldName, error),
					)
				} else {
					this.dispatcher.dispatch(
						addEntityError(target.entityType, target.entityId, error),
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
	 * Recursively commits nested entity results and maps their server IDs.
	 * Called when the adapter provides nestedResults in the transaction response.
	 * Uses the MutationCollector's nestedEntityTypes map to resolve entity types,
	 * since the adapter may not know the correct entity type for nested entities.
	 */
	private commitNestedResults(nestedResults: readonly TransactionMutationResult[]): void {
		const nestedTypes = this.mutationCollector instanceof MutationCollector
			? this.mutationCollector.getNestedEntityTypes()
			: null

		for (const nested of nestedResults) {
			if (!nested.ok) continue

			// Resolve entity type from collector's tracking (adapter may report 'Unknown')
			const entityType = nestedTypes?.get(nested.entityId) ?? nested.entityType
			const snapshot = this.store.getEntitySnapshot(entityType, nested.entityId)
			if (!snapshot) continue

			// Commit the nested entity
			this.dispatcher.dispatch(commitEntity(entityType, nested.entityId))
			this.store.commitAllRelations(entityType, nested.entityId)
			this.store.setExistsOnServer(entityType, nested.entityId, true)

			// Map temp ID to server-assigned ID
			if (nested.persistedId) {
				this.store.mapTempIdToPersistedId(
					entityType,
					nested.entityId,
					nested.persistedId,
				)
			}

			// Recurse for deeper nesting
			if (nested.nestedResults) {
				this.commitNestedResults(nested.nestedResults)
			}
		}
	}

	/**
	 * Commits nested entities that were part of the transaction but don't have
	 * explicit results from the adapter. These entities were created inline
	 * inside a parent mutation and exist on the server after a successful persist.
	 */
	private commitUnresolvedNestedEntities(entities: DirtyEntity[]): void {
		if (!(this.mutationCollector instanceof MutationCollector)) return

		const nestedTypes = this.mutationCollector.getNestedEntityTypes()
		if (nestedTypes.size === 0) return

		// Find nested entities that are in the entities list but weren't committed
		// by the main result processing (they had no matching result from the adapter)
		for (const entity of entities) {
			if (entity.changeType !== 'create') continue
			if (!nestedTypes.has(entity.entityId)) continue

			// Check if this entity was already committed (has server data)
			if (this.store.existsOnServer(entity.entityType, entity.entityId)) continue

			// Commit it — the parent mutation succeeded, so this entity exists on the server
			this.dispatcher.dispatch(commitEntity(entity.entityType, entity.entityId))
			this.store.commitAllRelations(entity.entityType, entity.entityId)
			this.store.setExistsOnServer(entity.entityType, entity.entityId, true)
		}

		// Also commit materialized entities that may not be in the entities list
		// (they were created during mutation building by materializeEmbeddedHasMany/HasOne)
		for (const [tempId, entityType] of nestedTypes) {
			if (this.store.existsOnServer(entityType, tempId)) continue

			const snapshot = this.store.getEntitySnapshot(entityType, tempId)
			if (!snapshot) continue

			this.dispatcher.dispatch(commitEntity(entityType, tempId))
			this.store.commitAllRelations(entityType, tempId)
			this.store.setExistsOnServer(entityType, tempId, true)
		}
	}

	/**
	 * Extracts nested entity results from a mutation's node response data.
	 * Walks the mutation data structure to find inline create operations,
	 * then matches them against the node response to extract server-assigned IDs.
	 *
	 * For hasOne creates: looks up the temp ID from the store's relation state
	 * for the parent entity, then gets the server ID from the response node field.
	 * For hasMany creates: filters new IDs from the response array by excluding
	 * known pre-existing IDs, matching to temp IDs (aliases) by position.
	 */
	private extractNestedResultsFromNode(
		mutationData: Record<string, unknown>,
		nodeData: Record<string, unknown>,
		parentEntityType: string,
		parentEntityId: string,
	): TransactionMutationResult[] {
		const results: TransactionMutationResult[] = []
		const nestedTypes = this.mutationCollector instanceof MutationCollector
			? this.mutationCollector.getNestedEntityTypes()
			: null

		const makeResult = (
			tempId: string,
			createData: Record<string, unknown>,
			nodeItem: Record<string, unknown>,
		): TransactionMutationResult => {
			const childResults = this.extractNestedResultsFromNode(
				createData, nodeItem,
				nestedTypes?.get(tempId) ?? 'Unknown', tempId,
			)
			return {
				entityType: nestedTypes?.get(tempId) ?? 'Unknown',
				entityId: tempId,
				ok: true,
				persistedId: nodeItem['id'] as string,
				nestedResults: childResults.length > 0 ? childResults : undefined,
			}
		}

		for (const [fieldName, fieldValue] of Object.entries(mutationData)) {
			if (fieldValue === null || fieldValue === undefined) continue

			if (Array.isArray(fieldValue)) {
				const nodeItems = nodeData[fieldName]
				if (!Array.isArray(nodeItems)) continue

				// Separate create ops from known IDs (connect/update)
				const knownIds = new Set<string>()
				const createOps: Array<{ alias: string; createData: Record<string, unknown> }> = []

				for (const op of fieldValue) {
					if (typeof op !== 'object' || op === null) continue
					const opObj = op as Record<string, unknown>

					if ('connect' in opObj) {
						const connectBy = opObj['connect'] as Record<string, unknown>
						if (connectBy['id']) knownIds.add(connectBy['id'] as string)
					} else if ('update' in opObj) {
						const by = (opObj['update'] as Record<string, unknown>)['by'] as Record<string, unknown> | undefined
						if (by?.['id']) knownIds.add(by['id'] as string)
					} else if ('create' in opObj && opObj['alias']) {
						createOps.push({
							alias: opObj['alias'] as string,
							createData: opObj['create'] as Record<string, unknown>,
						})
					}
				}

				// Include pre-existing server IDs
				const hasManyState = this.store.getHasMany(parentEntityType, parentEntityId, fieldName)
				if (hasManyState) {
					for (const id of hasManyState.serverIds) knownIds.add(id)
				}

				// Filter response to new items only, then content-match to create ops.
				// Contember API does not guarantee hasMany ordering in node response,
				// so we match by scalar field values instead of position.
				// Unmatched creates keep their temp IDs until the next fetch.
				const unmatchedItems = (nodeItems as Record<string, unknown>[])
					.filter(it => typeof it === 'object' && it !== null && !knownIds.has(it['id'] as string))

				for (const createOp of createOps) {
					const idx = unmatchedItems.findIndex(it => this.isCreateDataMatchingNode(createOp.createData, it))
					if (idx < 0) continue
					results.push(makeResult(createOp.alias, createOp.createData, unmatchedItems.splice(idx, 1)[0]!))
				}
			} else if (typeof fieldValue === 'object') {
				const opObj = fieldValue as Record<string, unknown>
				const nodeField = nodeData[fieldName]

				if ('create' in opObj && typeof nodeField === 'object' && nodeField !== null) {
					const serverId = (nodeField as Record<string, unknown>)['id'] as string | undefined
					if (!serverId) continue

					const relationState = this.store.getRelation(parentEntityType, parentEntityId, fieldName)
					if (!relationState?.currentId) continue

					results.push(makeResult(
						relationState.currentId,
						opObj['create'] as Record<string, unknown>,
						nodeField as Record<string, unknown>,
					))
				}
			}
		}

		return results
	}

	/**
	 * Content-based matching: checks whether create data matches a response node
	 * by comparing scalars and hasOne relation IDs. Same approach as the legacy
	 * binding's TreeAugmenter.isEntityMatching.
	 */
	private isCreateDataMatchingNode(
		createData: Record<string, unknown>,
		nodeItem: Record<string, unknown>,
	): boolean {
		for (const [key, value] of Object.entries(createData)) {
			if (value === null || value === undefined) continue

			if (typeof value !== 'object') {
				if (nodeItem[key] !== value) return false
			} else if (!Array.isArray(value)) {
				const op = value as Record<string, unknown>
				const nodeField = nodeItem[key]
				if (!nodeField || typeof nodeField !== 'object') continue

				if ('connect' in op) {
					if ((op['connect'] as Record<string, unknown>)['id'] !== (nodeField as Record<string, unknown>)['id']) return false
				} else if ('create' in op) {
					if (!this.isCreateDataMatchingNode(op['create'] as Record<string, unknown>, nodeField as Record<string, unknown>)) return false
				}
			}
		}
		return true
	}

	/**
	 * Cancels all in-flight operations.
	 */
	cancelAll(): void {
		this.changeRegistry.clearAllInFlight()
	}
}
