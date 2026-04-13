import type { ContemberMutationResult } from '../errors/pathMapper.js'
import type { FieldError } from '../errors/types.js'

// ==================== Mutation Data Collector ====================

/**
 * Interface for custom mutation data collectors.
 * Used to build proper nested mutations for persistence operations.
 */
export interface MutationDataCollector {
	/**
	 * Collects mutation data for updating an existing entity.
	 * Returns the mutation input or null if no changes.
	 */
	collectUpdateData(entityType: string, entityId: string): Record<string, unknown> | null

	/**
	 * Collects mutation data for creating a new entity.
	 * Returns the mutation input or null if no data.
	 */
	collectCreateData?(entityType: string, entityId: string): Record<string, unknown> | null
}

// ==================== Persist Scope ====================

/**
 * Scope that encompasses all dirty entities
 */
export interface AllScope {
	readonly type: 'all'
}

/**
 * Scope for a single entity
 */
export interface EntityScope {
	readonly type: 'entity'
	readonly entityType: string
	readonly entityId: string
}

/**
 * Scope for specific fields of an entity
 */
export interface FieldsScope {
	readonly type: 'fields'
	readonly entityType: string
	readonly entityId: string
	readonly fields: readonly string[]
}

/**
 * Scope for a specific relation of an entity
 */
export interface RelationScope {
	readonly type: 'relation'
	readonly entityType: string
	readonly entityId: string
	readonly relationName: string
}

/**
 * Custom scope with explicit entity list
 */
export interface CustomScope {
	readonly type: 'custom'
	readonly entities: ReadonlyArray<{
		readonly entityType: string
		readonly entityId: string
		readonly fields?: readonly string[]
	}>
}

/**
 * Union of all persist scope types
 */
export type PersistScope = AllScope | EntityScope | FieldsScope | RelationScope | CustomScope

// ==================== Persistence Results ====================

/**
 * Result for a single field persist operation
 */
export interface FieldPersistResult {
	readonly entityType: string
	readonly entityId: string
	readonly fieldName: string
	readonly success: boolean
	readonly error?: FieldError
}

/**
 * Result for a single entity persist operation
 */
export interface EntityPersistResult {
	readonly entityType: string
	readonly entityId: string
	readonly operation: 'create' | 'update' | 'delete'
	readonly success: boolean
	readonly error?: PersistError
	readonly fieldResults?: readonly FieldPersistResult[]
	/** Server-assigned ID for creates (when tempId was used) */
	readonly persistedId?: string
}

/**
 * Error information for failed persist operations
 */
export interface PersistError {
	readonly message: string
	readonly mutationResult?: ContemberMutationResult
}

/**
 * Result of a batch/transaction persist operation
 */
export interface PersistenceResult {
	/** Whether the entire operation succeeded */
	readonly success: boolean
	/** Results for each entity in the operation */
	readonly results: readonly EntityPersistResult[]
	/** Number of successfully persisted entities */
	readonly successCount: number
	/** Number of failed entities */
	readonly failedCount: number
	/** Number of entities skipped (e.g., already in-flight) */
	readonly skippedCount: number
}

// ==================== Transaction Types ====================

/**
 * A single mutation in a transaction
 */
export interface TransactionMutation {
	readonly entityType: string
	readonly entityId: string
	readonly operation: 'create' | 'update' | 'delete'
	readonly data?: Record<string, unknown>
}

/**
 * Result of a single mutation in a transaction
 */
export interface TransactionMutationResult {
	readonly entityType: string
	readonly entityId: string
	readonly ok: boolean
	/** Server-assigned ID for creates */
	readonly persistedId?: string
	readonly errorMessage?: string
	readonly mutationResult?: ContemberMutationResult
	/**
	 * Results for entities created inline within this mutation's data.
	 * Each entry maps a nested entity's temp ID (used as alias in the mutation)
	 * to its server-assigned ID. Recursive for deeply nested creates.
	 */
	readonly nestedResults?: readonly TransactionMutationResult[]
}

/**
 * Result of a transaction persist operation
 */
export interface TransactionResult {
	/** Whether all mutations succeeded */
	readonly ok: boolean
	/** Results per mutation, in same order as input */
	readonly results: readonly TransactionMutationResult[]
}

// ==================== Options ====================

/**
 * Update mode for persistence operations.
 * - 'optimistic': Update UI immediately, revert on failure (default)
 * - 'pessimistic': Wait for server confirmation before updating UI
 */
export type UpdateMode = 'optimistic' | 'pessimistic'

/**
 * Options for batch persist operations
 */
export interface BatchPersistOptions {
	/**
	 * Skip entities that are currently in-flight
	 * @default true
	 */
	readonly skipInFlight?: boolean

	/**
	 * AbortSignal for cancellation
	 */
	readonly signal?: AbortSignal

	/**
	 * Automatically rollback optimistic changes when persistence fails.
	 * When enabled, entity data, relations, and has-many lists are reverted
	 * to their server state on failure.
	 * @default false
	 */
	readonly rollbackOnError?: boolean

	/**
	 * Update mode for this operation.
	 * - 'optimistic': Changes shown in UI immediately (default)
	 * - 'pessimistic': Wait for server confirmation before showing in UI
	 *
	 * When using pessimistic mode:
	 * - Changes are staged but not visible in UI until server confirms
	 * - If server fails, staged changes are discarded (no UI change occurs)
	 * - Loading state is properly tracked via isPersisting
	 *
	 * @default Uses provider-level default or 'optimistic'
	 */
	readonly updateMode?: UpdateMode

	/**
	 * Called for each entity before persistence
	 */
	readonly onEntityPersisting?: (entityType: string, entityId: string) => void | Promise<void>

	/**
	 * Called for each entity after persistence (success or failure)
	 */
	readonly onEntityPersisted?: (result: EntityPersistResult) => void
}
