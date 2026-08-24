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
	UpdateMode,
} from './types.js'
import { setPersisting, resetEntity, addFieldError, addEntityError, addRelationError, clearAllServerErrors } from '../core/actions.js'
import { type ContemberMutationResult } from '../errors/pathMapper.js'
import { resolveAllErrors } from '../errors/errorPathResolver.js'
import { createServerError } from '../errors/types.js'
import { MutationCollector } from './MutationCollector.js'
import type { EntityPersistedEvent, EntityPersistFailedEvent, EntityPersistingEvent } from '../events/types.js'
import { deepEqual } from '../utils/deepEqual.js'
import {
	createPersistExecution,
	entityIdentityKey,
	type ExecutionEntity,
	type PersistExecution,
} from './PersistExecution.js'

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

/** One inline create operation inside a hasMany mutation, keyed by its alias (a temp ID). */
interface NodeCreateOp {
	readonly alias: string
	readonly entityType: string
	readonly createData: Record<string, unknown>
}

/** A create operation and the response row it produced. */
interface NodeCreatePair {
	readonly op: NodeCreateOp
	readonly nodeItem: Record<string, unknown>
}

interface ExecutedMutationResult extends TransactionMutationResult {
	readonly nodeData?: Record<string, unknown>
}

type ExecutedPersist =
	| {
		readonly mode: 'atomic'
		readonly ok: boolean
		readonly results: readonly ExecutedMutationResult[]
	}
	| {
		readonly mode: 'sequential'
		readonly ok: boolean
		readonly results: readonly ExecutedMutationResult[]
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
	private readonly nestedOutcomes = new WeakMap<PersistenceResult, readonly EntityPersistResult[]>()
	private readonly eventOutcomes = new WeakMap<PersistenceResult, readonly EntityPersistResult[]>()

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
		const collector = this.mutationCollector instanceof MutationCollector
			? this.mutationCollector.forkSession()
			: this.mutationCollector
		try {
			const result = await this.executePersist(sortedEntities, scope, options, updateMode, collector)
			const callbackOutcomes = [...result.results, ...(this.nestedOutcomes.get(result) ?? [])]
			this.emitPersistOutcome(this.eventOutcomes.get(result) ?? callbackOutcomes)
			for (const entry of callbackOutcomes) options?.onEntityPersisted?.(entry)
			return result
		} catch (error) {
			this.emitPersistFailed(sortedEntities, toError(error))
			throw error
		}
	}

	/**
	 * Runs the persist lifecycle for entities that passed the before-persist hooks.
	 * They are already marked in-flight by the caller; this method releases them.
	 */
	private async executePersist(
		sortedEntities: DirtyEntity[],
		scope: PersistScope,
		options: BatchPersistOptions | undefined,
		updateMode: UpdateMode,
		collector: MutationDataCollector | undefined,
	): Promise<PersistenceResult> {
		const claimed = new Map<string, DirtyEntity>()
		const accepted = new Map<string, DirtyEntity>()
		const vetoed = new Map<string, DirtyEntity>()
		const offered = new Set<string>()
		const initialKeys = new Set(sortedEntities.map(entity => entityIdentityKey(entity.entityType, entity.entityId)))
		this.claimEntities(sortedEntities, claimed, updateMode)
		this.undoManager?.block()

		let result: PersistenceResult | undefined
		try {
			let execution: PersistExecution
			while (true) {
				const pending = [...claimed.values()].filter(entity => !offered.has(entityIdentityKey(entity.entityType, entity.entityId)))
				for (const entity of pending) {
					const key = entityIdentityKey(entity.entityType, entity.entityId)
					offered.add(key)
					if (options?.onEntityPersisting) {
						await options.onEntityPersisting(entity.entityType, entity.entityId)
					}
					const outcome = this.hasPersistingInterceptors([entity])
						? await this.runPersistingInterceptors([entity])
						: { accepted: [entity], cancelled: [] }
					if (outcome.cancelled.length > 0) {
						vetoed.set(key, entity)
						this.releaseEntities([entity])
					} else {
						accepted.set(key, entity)
					}
				}

				const topLevel = sortedEntities.filter(entity => accepted.has(entityIdentityKey(entity.entityType, entity.entityId)))
				const vetoedKeys = new Set(vetoed.keys())
				const mutations = this.buildMutations(topLevel, vetoedKeys, scope, collector)
				const nested = collector instanceof MutationCollector ? collector.getNestedEntities() : []
				const discovered: DirtyEntity[] = []
				for (const entity of nested) {
					const key = entityIdentityKey(entity.entityType, entity.entityId)
					if (claimed.has(key) || vetoed.has(key)) continue
					const dirty: DirtyEntity = {
						entityType: entity.entityType,
						entityId: entity.entityId,
						changeType: 'create',
						dirtyFields: this.store.getDirtyFields(entity.entityType, entity.entityId),
						dirtyRelations: this.store.getDirtyRelations(entity.entityType, entity.entityId),
					}
					discovered.push(dirty)
				}
				if (discovered.length > 0) {
					this.claimEntities(discovered, claimed, updateMode)
					continue
				}

				const executionEntities = [...accepted.values()].filter(entity => initialKeys.has(entityIdentityKey(entity.entityType, entity.entityId)))
				execution = createPersistExecution(
					this.store,
					mutations,
					executionEntities,
					nested,
					collector instanceof MutationCollector ? collector.getCollectedRelationFields() : [],
					collector instanceof MutationCollector ? collector.getCollectedNestedCreates() : [],
					collector instanceof MutationCollector ? collector.getCollectedNestedUpdates() : [],
					collector instanceof MutationCollector ? collector.getCollectedHasOneChanges() : [],
					collector instanceof MutationCollector ? collector.getCollectedHasManyChanges() : [],
					[...vetoed.values()],
					collector instanceof MutationCollector ? collector.getSuppressedRelationItems() : new Map(),
					scope,
				)
				break
			}

			this.assertCustomCollectorIsSafe(execution, collector)
			if (execution.mutations.length === 0) {
				result = this.mergeCancelled(emptyPersistenceResult(), execution.vetoed)
				return result
			}

			const transactionResult = await this.executeTransaction(execution, options?.signal)
			result = this.processExecutionResult(execution, transactionResult, options)
			result = this.mergeCancelled(result, execution.vetoed)
			return result

		} finally {
			this.releaseEntities([...claimed.values()])
			this.undoManager?.unblock()
			if (result?.success) {
				this.store.sweepUnreachableCreated()
			}
		}

		// Unreachable, but keeps the return type explicit when control-flow analysis changes.
		return emptyPersistenceResult()
	}

	/**
	 * Whether any entity in the batch has an `entity:persisting` interceptor.
	 */
	private hasPersistingInterceptors(entities: readonly DirtyEntity[]): boolean {
		const emitter = this.dispatcher.getEventEmitter()
		return entities.some(
			entity => emitter.hasInterceptors('entity:persisting', entity.entityType, entity.entityId),
		)
	}

	/**
	 * Runs `entity:persisting` interceptors for every entity in the batch.
	 * A `null` result vetoes that one entity — mirroring how ActionDispatcher treats
	 * a cancelling interceptor — while the rest of the batch proceeds.
	 */
	private async runPersistingInterceptors(
		entities: readonly DirtyEntity[],
	): Promise<{ accepted: DirtyEntity[]; cancelled: DirtyEntity[] }> {
		const emitter = this.dispatcher.getEventEmitter()
		const accepted: DirtyEntity[] = []
		const cancelled: DirtyEntity[] = []

		for (const entity of entities) {
			const event: EntityPersistingEvent = {
				type: 'entity:persisting',
				timestamp: Date.now(),
				entityType: entity.entityType,
				entityId: entity.entityId,
				isNew: entity.changeType === 'create',
			}
			const result = await emitter.runInterceptors(event)
			if (result === null) {
				cancelled.push(entity)
			} else {
				accepted.push(entity)
			}
		}

		return { accepted, cancelled }
	}

	/**
	 * Emits `entity:persisted` / `entity:persistFailed` for entities that were sent.
	 */
	private emitPersistOutcome(results: readonly EntityPersistResult[]): void {
		const emitter = this.dispatcher.getEventEmitter()

		for (const entry of results) {
			if (entry.skipped) continue
			if (entry.success) {
				emitter.emit({
					type: 'entity:persisted',
					timestamp: Date.now(),
					entityType: entry.entityType,
					entityId: entry.entityId,
					isNew: entry.operation === 'create',
					// Updates keep their id; creates carry the server-assigned one.
					persistedId: entry.persistedId ?? entry.entityId,
				} satisfies EntityPersistedEvent)
			} else {
				emitter.emit({
					type: 'entity:persistFailed',
					timestamp: Date.now(),
					entityType: entry.entityType,
					entityId: entry.entityId,
					isNew: entry.operation === 'create',
					error: new Error(entry.error?.message ?? 'Persist failed'),
				} satisfies EntityPersistFailedEvent)
			}
		}

	}

	/**
	 * Emits `entity:persistFailed` for the whole batch when the persist itself threw.
	 */
	private emitPersistFailed(entities: readonly DirtyEntity[], error: Error): void {
		const emitter = this.dispatcher.getEventEmitter()

		for (const entity of entities) {
			emitter.emit({
				type: 'entity:persistFailed',
				timestamp: Date.now(),
				entityType: entity.entityType,
				entityId: entity.entityId,
				isNew: entity.changeType === 'create',
				error,
			} satisfies EntityPersistFailedEvent)
		}
	}

	/**
	 * Folds vetoed entities into the result as skipped — never as successes, and never
	 * as server failures, so callers can tell a deliberate veto from a broken save.
	 * Their entries carry `skipped`, which keeps `failedCount` in step with `results`.
	 */
	private mergeCancelled(
		attempted: PersistenceResult,
		cancelled: readonly DirtyEntity[],
	): PersistenceResult {
		if (cancelled.length === 0) return attempted

		const cancelledResults = cancelled.map((entity): EntityPersistResult => ({
			entityType: entity.entityType,
			entityId: entity.entityId,
			operation: entity.changeType,
			success: false,
			skipped: true,
			error: { message: `Persist of ${entity.entityType}:${entity.entityId} was cancelled by an entity:persisting interceptor` },
		}))

		return {
			success: false,
			results: [...attempted.results, ...cancelledResults],
			successCount: attempted.successCount,
			failedCount: attempted.failedCount,
			skippedCount: attempted.skippedCount + cancelled.length,
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
		vetoedEntityKeys: ReadonlySet<string>,
		scope: PersistScope,
		collector: MutationDataCollector | undefined,
	): TransactionMutation[] {
		// Exclude only non-create entities from nesting —
		// new entities should be nested inside their parent's mutation
		// to maintain correct relation connections without transaction support.
		// Vetoed entities are kept apart: an excluded entity still has its parent-side
		// delete emitted, a vetoed one must not be written at all.
		if (collector instanceof MutationCollector) {
			const excludedIds = new Set<string>()
			for (const entity of entities) {
				if (entity.changeType !== 'create') excludedIds.add(entityIdentityKey(entity.entityType, entity.entityId))
			}
			collector.setExcludedEntityKeys(excludedIds)
			collector.setVetoedEntityKeys(vetoedEntityKeys)
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
				const mc = collector
				data = mc?.collectCreateData
					? mc.collectCreateData(entity.entityType, entity.entityId)
					: this.collectCreateDataWithRelationCheck(entity)
			} else {
				data = collector
					? collector.collectUpdateData(entity.entityType, entity.entityId)
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
		if (collector instanceof MutationCollector) {
			const nestedKeys = new Set(collector.getNestedEntities().map(entity => entityIdentityKey(entity.entityType, entity.entityId)))
			if (nestedKeys.size > 0) {
				return mutations.filter(m => !(m.operation === 'create' && nestedKeys.has(entityIdentityKey(m.entityType, m.entityId))))
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
		execution: PersistExecution,
		signal?: AbortSignal,
	): Promise<ExecutedPersist> {
		const mutations = execution.mutations
		// Check if adapter supports transactions
		if ('persistTransaction' in this.adapter && typeof this.adapter.persistTransaction === 'function') {
			try {
				const result = await this.adapter.persistTransaction(mutations)
				return { mode: 'atomic', ok: result.ok, results: result.results }
			} catch (error) {
				return {
					mode: 'atomic',
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

		const missingCreate = mutations.some(mutation => mutation.operation === 'create') && !this.adapter.create
		const missingDelete = mutations.some(mutation => mutation.operation === 'delete') && !this.adapter.delete
		if (missingCreate || missingDelete) {
			const message = [
				missingCreate ? 'Adapter does not implement create' : '',
				missingDelete ? 'Adapter does not implement delete' : '',
			].filter(Boolean).join('; ')
			return {
				mode: 'sequential',
				ok: false,
				results: mutations.map(mutation => ({
					entityType: mutation.entityType,
					entityId: mutation.entityId,
					ok: false,
					errorMessage: message,
				})),
			}
		}

		const results: ExecutedMutationResult[] = []
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
						const persistedId = getStringProperty(result.data, 'id')
						results.push({
							entityType: mutation.entityType,
							entityId: mutation.entityId,
							ok: result.ok,
							persistedId,
							nodeData: result.data,
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
							nodeData: result.data,
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

		return { mode: 'sequential', ok: allOk, results }
	}

	/**
	 * Processes transaction result and commits/rolls back as needed.
	 * For pessimistic mode, restores captured state on success.
	 */
	private processExecutionResult(
		execution: PersistExecution,
		transactionResult: ExecutedPersist,
		options?: BatchPersistOptions,
	): PersistenceResult {
		const results: EntityPersistResult[] = []
		const nestedResults: EntityPersistResult[] = []
		const rollbackOnError = options?.rollbackOnError ?? false
		const atomicFailure = transactionResult.mode === 'atomic' && (
			!transactionResult.ok || transactionResult.results.some(entry => !entry.ok)
		)

		for (const mutation of execution.mutations) {
			const mutationResult = transactionResult.results.find(entry => (
				entry.entityType === mutation.entityType && entry.entityId === mutation.entityId
			))
			const entity = execution.entities.find(entry => (
				entry.entityType === mutation.entityType && entry.entityId === mutation.entityId
			))
			if (!entity) continue

			const adapterSucceeded = mutationResult?.ok === true && !atomicFailure
			if (!adapterSucceeded) {
				const message = atomicFailure
					? mutationResult?.errorMessage ?? 'Atomic transaction failed'
					: mutationResult?.errorMessage ?? 'Mutation result missing'
				this.mapServerErrors(entity.entityType, entity.entityId, mutationResult?.mutationResult, message)
				if (rollbackOnError) this.rollbackExecutionEntity(entity)
				results.push(toFailedResult(entity, message, mutationResult?.mutationResult))
				for (const nested of this.expectedNestedEntities(execution, mutation)) {
					nestedResults.push(toFailedResult(nested, message))
				}
				for (const nested of this.expectedNestedUpdates(execution, mutation)) {
					nestedResults.push(toFailedResult(nested, message))
				}
				continue
			}
			if (entity.operation === 'create' && isTempId(entity.entityId) && !mutationResult?.persistedId) {
				const message = `Create of ${entity.entityType}:${entity.entityId} succeeded without a server ID`
				this.mapServerErrors(entity.entityType, entity.entityId, undefined, message)
				results.push(toFailedResult(entity, message))
				continue
			}

			const resolvedNested = this.resolveNestedResults(execution, mutation, mutationResult)
			const nestedUpdates = this.expectedNestedUpdates(execution, mutation)
			const involved = [entity, ...resolvedNested.entities, ...nestedUpdates]
			const conflicts = this.reconcileConfirmedEntities(execution, involved, new Set(resolvedNested.persistedIds.keys()))
			this.mapConfirmedIds(entity, mutationResult.persistedId, resolvedNested.persistedIds)

			for (const nested of resolvedNested.entities) {
				const key = entityIdentityKey(nested.entityType, nested.entityId)
				const conflict = conflicts.get(key)?.join('; ')
				nestedResults.push(conflict
					? toFailedResult(nested, conflict)
					: toSuccessResult(nested, resolvedNested.persistedIds.get(key)))
			}
			for (const nested of nestedUpdates) {
				const conflict = conflicts.get(entityIdentityKey(nested.entityType, nested.entityId))?.join('; ')
				nestedResults.push(conflict ? toFailedResult(nested, conflict) : toSuccessResult(nested))
			}
			const unresolvedMessage = resolvedNested.unresolved.length > 0
				? `Missing or ambiguous server ID for nested create ${resolvedNested.unresolved.map(item => `${item.entityType}:${item.entityId}`).join(', ')}`
				: undefined
			for (const nested of resolvedNested.unresolved) {
				nestedResults.push(toFailedResult(nested, unresolvedMessage ?? 'Nested create could not be resolved'))
			}
			const conflictMessage = [...conflicts.values()].flat().join('; ')
			const failure = [unresolvedMessage, conflictMessage || undefined].filter((message): message is string => message !== undefined).join('; ')
			if (failure) {
				this.mapServerErrors(entity.entityType, entity.entityId, undefined, failure)
				results.push(toFailedResult(entity, failure))
			} else {
				results.push(toSuccessResult(entity, this.persistedIdFor(entity, mutationResult.persistedId)))
			}
		}

		for (const nested of execution.entities.filter(entity => entity.nested)) {
			const key = entityIdentityKey(nested.entityType, nested.entityId)
			if (nestedResults.some(entry => entityIdentityKey(entry.entityType, entry.entityId) === key)) continue
			if (atomicFailure) nestedResults.push(toFailedResult(nested, 'Atomic transaction failed'))
		}

		const successCount = results.filter(entry => entry.success).length
		const failedCount = results.length - successCount
		const result: PersistenceResult = {
			success: failedCount === 0 && transactionResult.ok,
			results,
			successCount,
			failedCount,
			skippedCount: 0,
		}
		this.nestedOutcomes.set(result, nestedResults)
		if (atomicFailure) {
			this.eventOutcomes.set(result, [
				...execution.mutations.map(mutation => {
					const entity = execution.entities.find(candidate => (
						candidate.entityType === mutation.entityType && candidate.entityId === mutation.entityId
					))
					return entity ? toFailedResult(entity, 'Atomic transaction failed') : undefined
				}).filter((entry): entry is EntityPersistResult => entry !== undefined),
				...nestedResults,
			])
		}
		return result
	}

	private claimEntities(
		entities: readonly DirtyEntity[],
		claimed: Map<string, DirtyEntity>,
		updateMode: UpdateMode,
	): void {
		const fresh = entities.filter(entity => !claimed.has(entityIdentityKey(entity.entityType, entity.entityId)))
		if (fresh.length === 0) return
		this.changeRegistry.markInFlight(fresh)
		for (const entity of fresh) {
			claimed.set(entityIdentityKey(entity.entityType, entity.entityId), entity)
			this.dispatcher.dispatch(setPersisting(entity.entityType, entity.entityId, true, updateMode === 'pessimistic'))
			this.dispatcher.dispatch(clearAllServerErrors(entity.entityType, entity.entityId))
		}
	}

	private releaseEntities(entities: readonly DirtyEntity[]): void {
		if (entities.length === 0) return
		this.changeRegistry.clearInFlight(entities)
		for (const entity of entities) {
			this.dispatcher.dispatch(setPersisting(entity.entityType, entity.entityId, false))
		}
	}

	private assertCustomCollectorIsSafe(
		execution: PersistExecution,
		collector: MutationDataCollector | undefined,
	): void {
		if (!collector || collector instanceof MutationCollector) return
		for (const entity of execution.entities) {
			const relations = this.store.getDirtyRelations(entity.entityType, entity.entityId)
			if (relations.length > 0) {
				throw new Error(
					`Custom mutation collectors support scalar data only; ${entity.entityType}:${entity.entityId} has relation changes`,
				)
			}
		}
		if (execution.mutations.some(mutation => containsNestedMutation(mutation.data))) {
			throw new Error('Custom mutation collectors cannot emit nested or relation mutation operations')
		}
	}

	private resolveNestedResults(
		execution: PersistExecution,
		mutation: TransactionMutation,
		result: ExecutedMutationResult,
	): {
		readonly entities: readonly ExecutionEntity[]
		readonly unresolved: readonly ExecutionEntity[]
		readonly persistedIds: ReadonlyMap<string, string>
	} {
		const expected = this.expectedNestedEntities(execution, mutation)
		if (expected.length === 0) return { entities: [], unresolved: [], persistedIds: new Map() }

		let supplied = result.nestedResults ?? []
		if (supplied.length === 0 && result.nodeData) {
			supplied = this.extractNestedResultsFromNode(
				execution,
				result.nodeData,
				mutation.entityType,
				mutation.entityId,
			)
		}
		const flattened = flattenMutationResults(supplied)
		const persistedIds = new Map<string, string>()
		const unresolved: ExecutionEntity[] = []
		const typesById = new Map<string, Set<string>>()
		for (const entity of expected) {
			const types = typesById.get(entity.entityId)
			if (types) types.add(entity.entityType)
			else typesById.set(entity.entityId, new Set([entity.entityType]))
		}
		for (const entity of expected) {
			if ((typesById.get(entity.entityId)?.size ?? 0) > 1) {
				unresolved.push(entity)
				continue
			}
			const exactMatch = flattened.find(entry => (
				entry.entityType === entity.entityType && entry.entityId === entity.entityId && entry.ok
			))
			const match = exactMatch ?? flattened.find(entry => (
				entry.entityType === 'Unknown'
				&& entry.entityId === entity.entityId
				&& entry.ok
				&& typesById.get(entity.entityId)?.size === 1
			))
			const persistedId = match?.persistedId ?? (!isTempId(entity.entityId) ? entity.entityId : undefined)
			if (!persistedId) unresolved.push(entity)
			else persistedIds.set(entityIdentityKey(entity.entityType, entity.entityId), persistedId)
		}
		return { entities: expected.filter(entity => !unresolved.includes(entity)), unresolved, persistedIds }
	}

	private expectedNestedEntities(
		execution: PersistExecution,
		mutation: TransactionMutation,
	): ExecutionEntity[] {
		return this.expectedNestedGraph(execution, mutation).creates
	}

	private expectedNestedUpdates(execution: PersistExecution, mutation: TransactionMutation): ExecutionEntity[] {
		return this.expectedNestedGraph(execution, mutation).updates
	}

	private expectedNestedGraph(
		execution: PersistExecution,
		mutation: TransactionMutation,
	): { readonly creates: ExecutionEntity[]; readonly updates: ExecutionEntity[] } {
		const entities = new Map(execution.entities.map(entity => [entityIdentityKey(entity.entityType, entity.entityId), entity]))
		const ownerQueue = [entityIdentityKey(mutation.entityType, mutation.entityId)]
		const owners = new Set(ownerQueue)
		const creates = new Map<string, ExecutionEntity>()
		const updates = new Map<string, ExecutionEntity>()
		for (let index = 0; index < ownerQueue.length; index++) {
			const owner = ownerQueue[index]!
			for (const descriptor of execution.nestedCreates) {
				if (entityIdentityKey(descriptor.parentEntityType, descriptor.parentEntityId) !== owner) continue
				const key = entityIdentityKey(descriptor.entityType, descriptor.entityId)
				const entity = entities.get(key)
				if (!entity) continue
				creates.set(key, entity)
				if (!owners.has(key)) {
					owners.add(key)
					ownerQueue.push(key)
				}
			}
			for (const update of execution.nestedUpdates) {
				if (entityIdentityKey(update.parentEntityType, update.parentEntityId) !== owner) continue
				const key = entityIdentityKey(update.entityType, update.entityId)
				const entity = entities.get(key)
				if (!entity) continue
				updates.set(key, entity)
				if (!owners.has(key)) {
					owners.add(key)
					ownerQueue.push(key)
				}
			}
		}
		return { creates: [...creates.values()], updates: [...updates.values()] }
	}

	private reconcileConfirmedEntities(
		execution: PersistExecution,
		entities: readonly ExecutionEntity[],
		confirmedNestedCreates: ReadonlySet<string>,
	): ReadonlyMap<string, readonly string[]> {
		const keys = new Set(entities.map(entity => entityIdentityKey(entity.entityType, entity.entityId)))
		const conflicts = new Map<string, string[]>()
		const addConflict = (key: string, message: string): void => {
			const messages = conflicts.get(key)
			if (messages) messages.push(message)
			else conflicts.set(key, [message])
		}
		for (const entity of entities) {
			const key = entityIdentityKey(entity.entityType, entity.entityId)
			if (entity.operation === 'delete') {
				if (!this.store.isScheduledForDeletion(entity.entityType, entity.entityId)) {
					this.store.setExistsOnServer(entity.entityType, entity.entityId, false)
					addConflict(key, `Delete of ${entity.entityType}:${entity.entityId} completed after the local deletion was reversed`)
					continue
				}
				this.store.removeEntity(entity.entityType, entity.entityId)
				continue
			}
			this.store.refreshServerData(entity.entityType, entity.entityId, entity.scalarData)
		}

		for (const change of execution.hasOneChanges) {
			const ownerKey = entityIdentityKey(change.entityType, change.entityId)
			if (!keys.has(ownerKey)) continue
			if (change.transition.operation === 'create') {
				const descriptor = execution.nestedCreates.find(item => (
					item.parentEntityType === change.entityType
					&& item.parentEntityId === change.entityId
					&& item.fieldName === change.fieldName
					&& item.entityId === change.transition.targetId
				))
				if (!descriptor || !confirmedNestedCreates.has(entityIdentityKey(descriptor.entityType, descriptor.entityId))) continue
			}
			const outcome = this.store.reconcileSentRelation(
				change.entityType,
				change.entityId,
				change.fieldName,
				change.transition,
			)
			if (outcome === 'conflict') addConflict(ownerKey, relationConflictMessage(change.entityType, change.entityId, change.fieldName))
		}
		for (const change of execution.hasManyChanges) {
			const ownerKey = entityIdentityKey(change.entityType, change.entityId)
			if (!keys.has(ownerKey)) continue
			const additions = change.additions.filter(addition => {
				if (addition.kind !== 'created') return true
				const descriptor = execution.nestedCreates.find(item => (
					item.parentEntityType === change.entityType
					&& item.parentEntityId === change.entityId
					&& item.fieldName === change.fieldName
					&& item.entityId === addition.itemId
				))
				return descriptor !== undefined && confirmedNestedCreates.has(entityIdentityKey(descriptor.entityType, descriptor.entityId))
			})
			if (additions.length === 0 && change.removals.length === 0) continue
			const outcome = this.store.reconcileSentHasMany(
				change.entityType,
				change.entityId,
				change.fieldName,
				{ additions, removals: change.removals },
			)
			if (outcome === 'conflict') addConflict(ownerKey, relationConflictMessage(change.entityType, change.entityId, change.fieldName))
		}
		return conflicts
	}

	private mapConfirmedIds(
		entity: ExecutionEntity,
		persistedId: string | undefined,
		nestedIds: ReadonlyMap<string, string>,
	): void {
		for (const [key, id] of nestedIds) {
			const nested = splitExecutionKey(key)
			if (isTempId(nested.entityId)) {
				this.store.mapTempIdToPersistedId(nested.entityType, nested.entityId, id)
			}
		}
		if (entity.operation === 'create' && isTempId(entity.entityId) && persistedId) {
			this.store.mapTempIdToPersistedId(entity.entityType, entity.entityId, persistedId)
		}
	}

	private persistedIdFor(entity: ExecutionEntity, persistedId: string | undefined): string | undefined {
		if (entity.operation !== 'create') return undefined
		return persistedId ?? (!isTempId(entity.entityId) ? entity.entityId : undefined)
	}

	private rollbackExecutionEntity(entity: ExecutionEntity): void {
		this.rollbackEntity({
			entityType: entity.entityType,
			entityId: entity.entityId,
			changeType: entity.operation,
			dirtyFields: [],
			dirtyRelations: [],
		})
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

	/** Resolves nested create responses from the immutable planning descriptors. */
	private extractNestedResultsFromNode(
		execution: PersistExecution,
		nodeData: Record<string, unknown>,
		parentEntityType: string,
		parentEntityId: string,
	): TransactionMutationResult[] {
		const results: TransactionMutationResult[] = []
		const makeResult = (
			op: NodeCreateOp,
			nodeItem: Record<string, unknown>,
		): TransactionMutationResult => {
			const childResults = this.extractNestedResultsFromNode(
				execution,
				nodeItem,
				op.entityType,
				op.alias,
			)
			return {
				entityType: op.entityType,
				entityId: op.alias,
				ok: true,
				persistedId: getStringProperty(nodeItem, 'id'),
				nestedResults: childResults.length > 0 ? childResults : undefined,
			}
		}
		const descriptors = execution.nestedCreates.filter(descriptor => (
			descriptor.parentEntityType === parentEntityType && descriptor.parentEntityId === parentEntityId
		))
		for (const descriptor of descriptors.filter(item => item.relationType === 'hasOne')) {
			const nodeItem = nodeData[descriptor.fieldName]
			if (!isRecord(nodeItem)) continue
			results.push(makeResult({
				alias: descriptor.entityId,
				entityType: descriptor.entityType,
				createData: { ...descriptor.createData },
			}, nodeItem))
		}
		const hasManyFields = new Set(
			descriptors.filter(item => item.relationType === 'hasMany').map(item => item.fieldName),
		)
		for (const fieldName of hasManyFields) {
			const fieldDescriptors = descriptors.filter(item => item.relationType === 'hasMany' && item.fieldName === fieldName)
			const knownIds = new Set(fieldDescriptors.flatMap(item => item.knownServerIds))
			const nodeItems = recordArray(nodeData[fieldName]).filter(item => {
				const id = getStringProperty(item, 'id')
				return id === undefined || !knownIds.has(id)
			})
			const createOps = fieldDescriptors.map(descriptor => ({
				alias: descriptor.entityId,
				entityType: descriptor.entityType,
				createData: { ...descriptor.createData },
			}))
			for (const { op, nodeItem } of this.pairCreateOpsWithNodes(createOps, nodeItems)) {
				results.push(makeResult(op, nodeItem))
			}
		}
		const updates = execution.nestedUpdates.filter(update => (
			update.parentEntityType === parentEntityType && update.parentEntityId === parentEntityId
		))
		for (const update of updates) {
			if (update.relationType === 'hasOne') {
				const nodeItem = nodeData[update.fieldName]
				if (isRecord(nodeItem)) {
					results.push(...this.extractNestedResultsFromNode(
						execution,
						nodeItem,
						update.entityType,
						update.entityId,
					))
				}
				continue
			}
			const nodeItem = recordArray(nodeData[update.fieldName]).find(item => (
				getStringProperty(item, 'id') === update.entityId
			))
			if (nodeItem) {
				results.push(...this.extractNestedResultsFromNode(
					execution,
					nodeItem,
					update.entityType,
					update.entityId,
				))
			}
		}

		return results
	}

	/**
	 * Pairs inline create operations with the response rows they produced.
	 *
	 * An unambiguous match is taken first. Indistinguishable siblings remain unresolved
	 * instead of being paired by response position.
	 *
	 * A single op and row left over are paired by elimination. A server that echoes a
	 * value back normalised (a date, a decimal) matches nothing byte-for-byte, and
	 * discarding the pair would leave that op's whole subtree on temp IDs (issue #70).
	 */
	private pairCreateOpsWithNodes(
		createOps: readonly NodeCreateOp[],
		nodeItems: readonly Record<string, unknown>[],
	): NodeCreatePair[] {
		const pairs: NodeCreatePair[] = []
		const pendingOps = [...createOps]
		const freeItems = [...nodeItems]

		const takePair = (opIndex: number, nodeItem: Record<string, unknown>): void => {
			pairs.push({ op: pendingOps[opIndex]!, nodeItem })
			pendingOps.splice(opIndex, 1)
			freeItems.splice(freeItems.indexOf(nodeItem), 1)
		}

		while (pendingOps.length > 0 && freeItems.length > 0) {
			const candidatesPerOp = pendingOps.map(
				op => freeItems.filter(item => this.isCreateDataMatchingNode(op.createData, item)),
			)

			const unique = candidatesPerOp.findIndex(candidates => candidates.length === 1)
			if (unique >= 0) {
				takePair(unique, candidatesPerOp[unique]![0]!)
				continue
			}

			break
		}

		if (pendingOps.length === 1 && freeItems.length === 1) {
			takePair(0, freeItems[0]!)
		}

		return pairs
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

/**
 * Normalizes a thrown value into an Error for `entity:persistFailed`.
 */
function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error))
}

function emptyPersistenceResult(): PersistenceResult {
	return {
		success: true,
		results: [],
		successCount: 0,
		failedCount: 0,
		skippedCount: 0,
	}
}

function toSuccessResult(entity: ExecutionEntity, persistedId?: string): EntityPersistResult {
	return {
		entityType: entity.entityType,
		entityId: entity.entityId,
		operation: entity.operation,
		success: true,
		persistedId,
	}
}

function toFailedResult(
	entity: ExecutionEntity,
	message: string,
	mutationResult?: ContemberMutationResult,
): EntityPersistResult {
	return {
		entityType: entity.entityType,
		entityId: entity.entityId,
		operation: entity.operation,
		success: false,
		error: { message, mutationResult },
	}
}

function relationConflictMessage(entityType: string, entityId: string, fieldName: string): string {
	return `Persisted relation ${entityType}:${entityId}.${fieldName} conflicts with a newer local change`
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getStringProperty(value: unknown, property: string): string | undefined {
	if (!isRecord(value)) return undefined
	const propertyValue = value[property]
	return typeof propertyValue === 'string' ? propertyValue : undefined
}

function recordArray(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return []
	return value.filter(isRecord)
}

function containsNestedMutation(value: unknown): boolean {
	if (Array.isArray(value)) return value.some(containsNestedMutation)
	if (!isRecord(value)) return false
	if ('create' in value || 'connect' in value || 'disconnect' in value || 'delete' in value || 'update' in value) {
		return true
	}
	return Object.values(value).some(containsNestedMutation)
}

function flattenMutationResults(results: readonly TransactionMutationResult[]): TransactionMutationResult[] {
	const flattened: TransactionMutationResult[] = []
	for (const result of results) {
		flattened.push(result)
		if (result.nestedResults) flattened.push(...flattenMutationResults(result.nestedResults))
	}
	return flattened
}

function splitExecutionKey(key: string): { entityType: string; entityId: string } {
	const separator = key.indexOf(':')
	return {
		entityType: separator < 0 ? '' : key.slice(0, separator),
		entityId: separator < 0 ? key : key.slice(separator + 1),
	}
}
