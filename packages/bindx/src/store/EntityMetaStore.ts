import type { LoadStatus } from './snapshots.js'
import { isPersistedId, isPlaceholderId } from './entityId.js'

/**
 * Entity load state tracking.
 */
export interface EntityLoadState {
	status: LoadStatus
	error?: Error
}

/**
 * Entity metadata for mutation generation.
 */
export interface EntityMeta {
	/** Whether the entity exists on the server */
	existsOnServer: boolean
	/** Whether the entity is scheduled for deletion */
	isScheduledForDeletion: boolean
}

/**
 * Manages entity metadata, load states, persisting status, and temp ID mapping.
 *
 * Keys are pre-computed composite strings (e.g., "entityType:id").
 * Follows the same pattern as ErrorStore and RelationStore.
 */
export class EntityMetaStore {
	/** Load states keyed by "entityType:id" */
	private readonly loadStates = new Map<string, EntityLoadState>()

	/** Entity metadata keyed by "entityType:id" */
	private readonly entityMetas = new Map<string, EntityMeta>()

	/** Persisting status keyed by "entityType:id" */
	private readonly persistingEntities = new Set<string>()

	/** Mapping from temp ID to persisted ID (keyed by "entityType:tempId") */
	private readonly tempToPersistedId = new Map<string, string>()

	// ==================== Load State ====================

	getLoadState(key: string): EntityLoadState | undefined {
		return this.loadStates.get(key)
	}

	setLoadState(key: string, status: LoadStatus, error?: Error): void {
		this.loadStates.set(key, { status, error })
	}

	clearLoadState(key: string): void {
		this.loadStates.delete(key)
	}

	// ==================== Entity Meta ====================

	getEntityMeta(key: string): EntityMeta | undefined {
		return this.entityMetas.get(key)
	}

	setExistsOnServer(key: string, existsOnServer: boolean): void {
		const existing = this.entityMetas.get(key) ?? { existsOnServer: false, isScheduledForDeletion: false }
		this.entityMetas.set(key, { ...existing, existsOnServer })
	}

	existsOnServer(key: string): boolean {
		return this.entityMetas.get(key)?.existsOnServer ?? false
	}

	scheduleForDeletion(key: string): void {
		const existing = this.entityMetas.get(key) ?? { existsOnServer: false, isScheduledForDeletion: false }
		this.entityMetas.set(key, { ...existing, isScheduledForDeletion: true })
	}

	unscheduleForDeletion(key: string): void {
		const existing = this.entityMetas.get(key) ?? { existsOnServer: false, isScheduledForDeletion: false }
		this.entityMetas.set(key, { ...existing, isScheduledForDeletion: false })
	}

	isScheduledForDeletion(key: string): boolean {
		return this.entityMetas.get(key)?.isScheduledForDeletion ?? false
	}

	// ==================== Persisting State ====================

	isPersisting(key: string): boolean {
		return this.persistingEntities.has(key)
	}

	setPersisting(key: string, isPersisting: boolean): void {
		if (isPersisting) {
			this.persistingEntities.add(key)
		} else {
			this.persistingEntities.delete(key)
		}
	}

	// ==================== Temp ID Mapping ====================

	mapTempIdToPersistedId(key: string, persistedId: string): void {
		this.tempToPersistedId.set(key, persistedId)
		this.setExistsOnServer(key, true)
	}

	getPersistedId(key: string, id: string): string | null {
		if (isPlaceholderId(id)) return null
		if (isPersistedId(id)) return id
		return this.tempToPersistedId.get(key) ?? null
	}

	isNewEntity(key: string, id: string): boolean {
		if (isPlaceholderId(id)) return true
		if (isPersistedId(id)) return false
		return !this.tempToPersistedId.has(key)
	}

	// ==================== Bulk Operations ====================

	exportMetas(keys: string[]): Map<string, EntityMeta> {
		const result = new Map<string, EntityMeta>()
		for (const key of keys) {
			const meta = this.entityMetas.get(key)
			if (meta) {
				result.set(key, { ...meta })
			}
		}
		return result
	}

	importMetas(metas: Map<string, EntityMeta>): void {
		for (const [key, meta] of metas) {
			this.entityMetas.set(key, { ...meta })
		}
	}

	clear(): void {
		this.loadStates.clear()
		this.entityMetas.clear()
		this.persistingEntities.clear()
		this.tempToPersistedId.clear()
	}
}
