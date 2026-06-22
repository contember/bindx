import type { LoadStatus } from './snapshots.js'
import { isPersistedId, isPlaceholderId } from './entityId.js'
import type { FieldError } from '../errors/types.js'

/**
 * Entity load state tracking.
 */
export interface EntityLoadState {
	status: LoadStatus
	error?: FieldError
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

	/**
	 * Monotonic counter bumped when reachability-relevant metadata changes —
	 * `existsOnServer` and `isPersisting` (which seed the reachability roots) plus
	 * entity removal/rekey. Load state and deletion scheduling do NOT bump it.
	 * Used by {@link ReachabilityAnalyzer} to memoize its walk.
	 */
	private mutationVersion = 0

	getMutationVersion(): number {
		return this.mutationVersion
	}

	// ==================== Load State ====================

	getLoadState(key: string): EntityLoadState | undefined {
		return this.loadStates.get(key)
	}

	setLoadState(key: string, status: LoadStatus, error?: FieldError): void {
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
		const existing = this.entityMetas.get(key)
		if (existing && existing.existsOnServer === existsOnServer) {
			return
		}
		this.entityMetas.set(key, {
			existsOnServer,
			isScheduledForDeletion: existing?.isScheduledForDeletion ?? false,
		})
		this.mutationVersion++
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
			if (!this.persistingEntities.has(key)) {
				this.persistingEntities.add(key)
				this.mutationVersion++
			}
		} else if (this.persistingEntities.delete(key)) {
			this.mutationVersion++
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

	/**
	 * Removes all metadata for an entity (load state, meta, persisting, temp mapping).
	 */
	remove(key: string): void {
		this.loadStates.delete(key)
		this.entityMetas.delete(key)
		this.persistingEntities.delete(key)
		this.tempToPersistedId.delete(key)
		this.mutationVersion++
	}

	/**
	 * Moves all metadata from oldKey to newKey.
	 */
	rekey(oldKey: string, newKey: string): void {
		const meta = this.entityMetas.get(oldKey)
		if (meta) {
			this.entityMetas.delete(oldKey)
			this.entityMetas.set(newKey, meta)
		}

		const loadState = this.loadStates.get(oldKey)
		if (loadState) {
			this.loadStates.delete(oldKey)
			this.loadStates.set(newKey, loadState)
		}

		if (this.persistingEntities.has(oldKey)) {
			this.persistingEntities.delete(oldKey)
			this.persistingEntities.add(newKey)
		}

		// Move temp ID mapping
		const persistedId = this.tempToPersistedId.get(oldKey)
		if (persistedId !== undefined) {
			this.tempToPersistedId.delete(oldKey)
			this.tempToPersistedId.set(newKey, persistedId)
		}

		this.mutationVersion++
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
		let imported = false
		for (const [key, meta] of metas) {
			this.entityMetas.set(key, { ...meta })
			imported = true
		}
		if (imported) this.mutationVersion++
	}

	clear(): void {
		this.loadStates.clear()
		this.entityMetas.clear()
		this.persistingEntities.clear()
		this.tempToPersistedId.clear()
		this.mutationVersion++
	}
}
