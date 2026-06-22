import type { LoadStatus } from './snapshots.js'
import type { FieldError } from '../errors/types.js'
import type { RekeyContext, Rekeyable } from './RekeyOrchestrator.js'

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
export class EntityMetaStore implements Rekeyable {
	/** Load states keyed by "entityType:id" */
	private readonly loadStates = new Map<string, EntityLoadState>()

	/** Entity metadata keyed by "entityType:id" */
	private readonly entityMetas = new Map<string, EntityMeta>()

	/** Persisting status keyed by "entityType:id" */
	private readonly persistingEntities = new Set<string>()

	/**
	 * Entities whose in-flight persist is pessimistic, keyed by "entityType:id".
	 * A subset of {@link persistingEntities}. While present, the entity is
	 * presented at its server baseline (see SnapshotStore.getPresentationSnapshot)
	 * even though its canonical data stays dirty.
	 */
	private readonly pessimisticInFlight = new Set<string>()

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

	setPersisting(key: string, isPersisting: boolean, pessimistic: boolean = false): void {
		if (isPersisting) {
			if (!this.persistingEntities.has(key)) {
				this.persistingEntities.add(key)
				this.mutationVersion++
			}
			// The pessimistic flag drives presentation only, not reachability, so it
			// deliberately does not bump mutationVersion.
			if (pessimistic) {
				this.pessimisticInFlight.add(key)
			} else {
				this.pessimisticInFlight.delete(key)
			}
		} else {
			if (this.persistingEntities.delete(key)) {
				this.mutationVersion++
			}
			this.pessimisticInFlight.delete(key)
		}
	}

	isPessimisticInFlight(key: string): boolean {
		return this.pessimisticInFlight.has(key)
	}

	/**
	 * Removes all metadata for an entity (load state, meta, persisting).
	 */
	remove(key: string): void {
		this.loadStates.delete(key)
		this.entityMetas.delete(key)
		this.persistingEntities.delete(key)
		this.pessimisticInFlight.delete(key)
		this.mutationVersion++
	}

	/**
	 * Moves all metadata from the temp key to the persisted key. The entity has
	 * just been confirmed by the server, so it is also marked as existing there
	 * (this replaces the former separate mapTempIdToPersistedId step).
	 */
	rekey(ctx: RekeyContext): void {
		const meta = this.entityMetas.get(ctx.oldKey)
		if (meta) {
			this.entityMetas.delete(ctx.oldKey)
			this.entityMetas.set(ctx.newKey, meta)
		}

		const loadState = this.loadStates.get(ctx.oldKey)
		if (loadState) {
			this.loadStates.delete(ctx.oldKey)
			this.loadStates.set(ctx.newKey, loadState)
		}

		if (this.persistingEntities.has(ctx.oldKey)) {
			this.persistingEntities.delete(ctx.oldKey)
			this.persistingEntities.add(ctx.newKey)
		}

		if (this.pessimisticInFlight.has(ctx.oldKey)) {
			this.pessimisticInFlight.delete(ctx.oldKey)
			this.pessimisticInFlight.add(ctx.newKey)
		}

		this.mutationVersion++
		this.setExistsOnServer(ctx.newKey, true)
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
		this.pessimisticInFlight.clear()
		this.mutationVersion++
	}
}
