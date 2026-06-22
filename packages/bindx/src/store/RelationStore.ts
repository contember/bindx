import type { HasOneRelationState } from '../handles/types.js'
import type { EntitySnapshot } from './snapshots.js'
import type { RekeyContext, Rekeyable } from './RekeyOrchestrator.js'

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
	if (a.size !== b.size) return false
	for (const item of a) {
		if (!b.has(item)) return false
	}
	return true
}

/**
 * Removal type for has-many items
 */
export type HasManyRemovalType = 'disconnect' | 'delete'

/**
 * Has-many list state stored in SnapshotStore
 */
export interface StoredHasManyState {
	/** IDs of items from server */
	serverIds: Set<string>
	/** Explicit ordered list of item IDs, null means use default order (serverIds + plannedConnections) */
	orderedIds: string[] | null
	/** Planned removals (disconnect or delete) keyed by entity ID */
	plannedRemovals: Map<string, HasManyRemovalType>
	/** Planned connections (IDs to add to the list) */
	plannedConnections: Set<string>
	/** Entity IDs created via add() - tracked for proper remove() semantics and mutation generation */
	createdEntities: Set<string>
	version: number
}

/**
 * Relation state stored in SnapshotStore
 */
export interface StoredRelationState {
	currentId: string | null
	serverId: string | null
	state: HasOneRelationState
	serverState: HasOneRelationState
	placeholderData: Record<string, unknown>
	version: number
}

/**
 * Manages has-one and has-many relation state.
 *
 * Relation keys use the format "parentType:parentId:fieldName".
 * Notification is handled by callers via callback returns.
 */
export class RelationStore implements Rekeyable {
	/** Relation states keyed by "parentType:parentId:fieldName" */
	private readonly relationStates = new Map<string, StoredRelationState>()

	/** Has-many list states keyed by "parentType:parentId:fieldName" */
	private readonly hasManyStates = new Map<string, StoredHasManyState>()

	/**
	 * Monotonic counter bumped on every actual write to relation/has-many state.
	 * Used by {@link ReachabilityAnalyzer} to memoize its walk. All writes funnel
	 * through {@link writeRelation}/{@link writeHasMany} (plus the delete/clear
	 * paths), so a read-only `getOrCreate*` call on the per-render materialize
	 * path — which does not write when the entry already matches — never bumps it.
	 */
	private mutationVersion = 0

	getMutationVersion(): number {
		return this.mutationVersion
	}

	private writeRelation(key: string, state: StoredRelationState): void {
		this.relationStates.set(key, state)
		this.mutationVersion++
	}

	private writeHasMany(key: string, state: StoredHasManyState): void {
		this.hasManyStates.set(key, state)
		this.mutationVersion++
	}

	// ==================== Has-One Relations ====================

	/**
	 * Gets or creates relation state.
	 */
	getOrCreateRelation(
		key: string,
		initial: Omit<StoredRelationState, 'version'>,
	): StoredRelationState {
		if (!this.relationStates.has(key)) {
			this.writeRelation(key, { ...initial, version: 0 })
		}

		return this.relationStates.get(key)!
	}

	/**
	 * Gets relation state.
	 */
	getRelation(key: string): StoredRelationState | undefined {
		return this.relationStates.get(key)
	}

	/**
	 * Updates relation state.
	 * If the relation state doesn't exist, creates it using entity snapshot for server data.
	 */
	setRelation(
		key: string,
		updates: Partial<Omit<StoredRelationState, 'version'>>,
		entitySnapshot: EntitySnapshot | undefined,
		fieldName: string,
	): void {
		const existing = this.relationStates.get(key)

		if (!existing) {
			let serverId: string | null = null
			let serverState: HasOneRelationState = 'disconnected'

			if (entitySnapshot?.serverData) {
				const relatedData = (entitySnapshot.serverData as Record<string, unknown>)[fieldName]
				if (relatedData && typeof relatedData === 'object' && 'id' in relatedData) {
					serverId = (relatedData as { id: string }).id
					serverState = 'connected'
				}
			}

			this.writeRelation(key, {
				currentId: 'currentId' in updates ? updates.currentId! : serverId,
				serverId,
				state: 'state' in updates ? updates.state! : serverState,
				serverState,
				placeholderData: updates.placeholderData ?? {},
				version: 0,
			})
		} else {
			this.writeRelation(key, {
				...existing,
				...updates,
				version: existing.version + 1,
			})
		}
	}

	/**
	 * Commits relation state (server = current).
	 */
	commitRelation(key: string): void {
		const existing = this.relationStates.get(key)
		if (!existing) return

		this.writeRelation(key, {
			...existing,
			serverId: existing.currentId,
			serverState: existing.state === 'creating' ? 'connected' : existing.state,
			placeholderData: {},
			version: existing.version + 1,
		})
	}

	/**
	 * Resets relation to server state.
	 */
	resetRelation(key: string): void {
		const existing = this.relationStates.get(key)
		if (!existing) return

		this.writeRelation(key, {
			...existing,
			currentId: existing.serverId,
			state: existing.serverState,
			placeholderData: {},
			version: existing.version + 1,
		})
	}

	// ==================== Has-Many Relations ====================

	/**
	 * Gets or creates has-many list state.
	 */
	getOrCreateHasMany(key: string, serverIds?: string[]): StoredHasManyState {
		const existing = this.hasManyStates.get(key)
		if (!existing) {
			this.writeHasMany(key, {
				serverIds: new Set(serverIds ?? []),
				orderedIds: null,
				plannedRemovals: new Map(),
				plannedConnections: new Set(),
				createdEntities: new Set(),
				version: 0,
			})
		} else if (serverIds !== undefined) {
			const newServerIds = new Set(serverIds)
			if (!setsEqual(existing.serverIds, newServerIds)) {
				this.writeHasMany(key, {
					...existing,
					serverIds: newServerIds,
					orderedIds: null,
					version: existing.version + 1,
				})
			}
		}

		return this.hasManyStates.get(key)!
	}

	/**
	 * Gets has-many list state.
	 */
	getHasMany(key: string): StoredHasManyState | undefined {
		return this.hasManyStates.get(key)
	}

	/**
	 * Sets server IDs for a has-many relation.
	 */
	setHasManyServerIds(key: string, serverIds: string[]): void {
		const existing = this.hasManyStates.get(key)

		if (!existing) {
			this.writeHasMany(key, {
				serverIds: new Set(serverIds),
				orderedIds: null,
				plannedRemovals: new Map(),
				plannedConnections: new Set(),
				createdEntities: new Set(),
				version: 0,
			})
		} else {
			this.writeHasMany(key, {
				...existing,
				serverIds: new Set(serverIds),
				orderedIds: null,
				version: existing.version + 1,
			})
		}
	}

	/**
	 * Plans a removal for a has-many item.
	 */
	planHasManyRemoval(key: string, itemId: string, type: HasManyRemovalType): void {
		const existing = this.hasManyStates.get(key)

		if (!existing) {
			this.writeHasMany(key, {
				serverIds: new Set(),
				orderedIds: null,
				plannedRemovals: new Map([[itemId, type]]),
				plannedConnections: new Set(),
				createdEntities: new Set(),
				version: 0,
			})
		} else {
			const newPlannedRemovals = new Map(existing.plannedRemovals)
			newPlannedRemovals.set(itemId, type)
			const newPlannedConnections = new Set(existing.plannedConnections)
			newPlannedConnections.delete(itemId)
			let newOrderedIds = existing.orderedIds
			if (newOrderedIds !== null) {
				newOrderedIds = newOrderedIds.filter(id => id !== itemId)
			}
			const newCreatedEntities = new Set(existing.createdEntities)
			newCreatedEntities.delete(itemId)
			this.writeHasMany(key, {
				...existing,
				orderedIds: newOrderedIds,
				plannedRemovals: newPlannedRemovals,
				plannedConnections: newPlannedConnections,
				createdEntities: newCreatedEntities,
				version: existing.version + 1,
			})
		}
	}

	/**
	 * Plans a connection for a has-many item.
	 */
	planHasManyConnection(key: string, itemId: string): void {
		const existing = this.hasManyStates.get(key)

		if (!existing) {
			this.writeHasMany(key, {
				serverIds: new Set(),
				orderedIds: null,
				plannedRemovals: new Map(),
				plannedConnections: new Set([itemId]),
				createdEntities: new Set(),
				version: 0,
			})
		} else {
			const newPlannedConnections = new Set(existing.plannedConnections)
			newPlannedConnections.add(itemId)
			const newPlannedRemovals = new Map(existing.plannedRemovals)
			newPlannedRemovals.delete(itemId)
			let newOrderedIds = existing.orderedIds
			if (newOrderedIds !== null && !newOrderedIds.includes(itemId)) {
				newOrderedIds = [...newOrderedIds, itemId]
			}
			this.writeHasMany(key, {
				...existing,
				orderedIds: newOrderedIds,
				plannedConnections: newPlannedConnections,
				plannedRemovals: newPlannedRemovals,
				version: existing.version + 1,
			})
		}
	}

	/**
	 * Commits has-many state after successful persist.
	 */
	commitHasMany(key: string, newServerIds: string[]): void {
		const existing = this.hasManyStates.get(key)

		this.writeHasMany(key, {
			serverIds: new Set(newServerIds),
			orderedIds: null,
			plannedRemovals: new Map(),
			plannedConnections: new Set(),
			createdEntities: new Set(),
			version: (existing?.version ?? 0) + 1,
		})
	}

	/**
	 * Resets has-many state to server state (clears planned operations).
	 */
	resetHasMany(key: string): void {
		const existing = this.hasManyStates.get(key)
		if (!existing) return

		this.writeHasMany(key, {
			serverIds: existing.serverIds,
			orderedIds: null,
			plannedRemovals: new Map(),
			plannedConnections: new Set(),
			createdEntities: new Set(),
			version: existing.version + 1,
		})
	}

	/**
	 * Adds a newly created entity to a has-many relation.
	 * Used by HasManyListHandle.add() for inline entity creation.
	 */
	addToHasMany(key: string, itemId: string): void {
		const existing = this.hasManyStates.get(key)

		if (!existing) {
			this.writeHasMany(key, {
				serverIds: new Set(),
				orderedIds: [itemId],
				plannedRemovals: new Map(),
				plannedConnections: new Set([itemId]),
				createdEntities: new Set([itemId]),
				version: 0,
			})
		} else {
			const newPlannedConnections = new Set(existing.plannedConnections)
			newPlannedConnections.add(itemId)
			const newCreatedEntities = new Set(existing.createdEntities)
			newCreatedEntities.add(itemId)
			const currentOrderedIds = existing.orderedIds ?? computeDefaultOrderedIds(existing)
			const newOrderedIds = [...currentOrderedIds, itemId]
			this.writeHasMany(key, {
				...existing,
				orderedIds: newOrderedIds,
				plannedConnections: newPlannedConnections,
				createdEntities: newCreatedEntities,
				version: existing.version + 1,
			})
		}
	}

	/**
	 * Connects an existing (persisted) entity to a has-many relation.
	 * Unlike addToHasMany, does NOT add to createdEntities — used for
	 * materializing embedded connect references to existing entities.
	 */
	connectExistingToHasMany(key: string, itemId: string): void {
		const existing = this.hasManyStates.get(key)

		if (!existing) {
			this.writeHasMany(key, {
				serverIds: new Set(),
				orderedIds: [itemId],
				plannedRemovals: new Map(),
				plannedConnections: new Set([itemId]),
				createdEntities: new Set(),
				version: 0,
			})
		} else {
			const newPlannedConnections = new Set(existing.plannedConnections)
			newPlannedConnections.add(itemId)
			const currentOrderedIds = existing.orderedIds ?? computeDefaultOrderedIds(existing)
			const newOrderedIds = [...currentOrderedIds, itemId]
			this.writeHasMany(key, {
				...existing,
				orderedIds: newOrderedIds,
				plannedConnections: newPlannedConnections,
				version: existing.version + 1,
			})
		}
	}

	/**
	 * Removes an entity from a has-many relation.
	 * For newly created entities (via add()), cancels the connection.
	 * For existing server entities, plans the specified removal type.
	 * Returns true if the state changed (caller should notify), false if it was a no-op.
	 */
	removeFromHasMany(key: string, itemId: string, removalType: HasManyRemovalType): boolean {
		const existing = this.hasManyStates.get(key)
		if (!existing) return false

		const isCreatedEntity = existing.createdEntities.has(itemId)

		if (isCreatedEntity) {
			const newPlannedConnections = new Set(existing.plannedConnections)
			newPlannedConnections.delete(itemId)
			const newCreatedEntities = new Set(existing.createdEntities)
			newCreatedEntities.delete(itemId)
			let newOrderedIds = existing.orderedIds
			if (newOrderedIds !== null) {
				newOrderedIds = newOrderedIds.filter(id => id !== itemId)
			}

			const newState: StoredHasManyState = {
				...existing,
				orderedIds: newOrderedIds,
				plannedConnections: newPlannedConnections,
				createdEntities: newCreatedEntities,
				version: existing.version + 1,
			}

			if (
				newPlannedConnections.size === 0 &&
				newCreatedEntities.size === 0 &&
				existing.plannedRemovals.size === 0 &&
				newOrderedIds !== null
			) {
				const defaultOrder = computeDefaultOrderedIds(newState)
				if (arraysEqual(newOrderedIds, defaultOrder)) {
					newState.orderedIds = null
				}
			}

			this.writeHasMany(key, newState)
			return true
		} else {
			this.planHasManyRemoval(key, itemId, removalType)
			return true
		}
	}

	/**
	 * Collects the ids of child entities currently reachable through an entity's
	 * LIVE relations (key prefix "parentType:parentId:"). Used by reachability-based
	 * create detection to walk the relation graph from roots.
	 *
	 * Live edges are:
	 *   - has-one: currentId, when the relation is not disconnected/deleted
	 *     (a disconnected relation has a null currentId; a 'deleted' relation is
	 *     removing its target, so the target is not anchored by it).
	 *   - has-many: effective members = (serverIds ∪ plannedConnections ∪
	 *     createdEntities) minus plannedRemovals.
	 */
	getLiveChildIds(keyPrefix: string): string[] {
		const ids = new Set<string>()

		for (const [key, state] of this.relationStates) {
			if (!key.startsWith(keyPrefix)) continue
			if (state.currentId !== null && state.state !== 'deleted') {
				ids.add(state.currentId)
			}
		}

		for (const [key, state] of this.hasManyStates) {
			if (!key.startsWith(keyPrefix)) continue
			for (const id of state.serverIds) {
				if (!state.plannedRemovals.has(id)) ids.add(id)
			}
			for (const id of state.plannedConnections) {
				if (!state.plannedRemovals.has(id)) ids.add(id)
			}
			for (const id of state.createdEntities) {
				if (!state.plannedRemovals.has(id)) ids.add(id)
			}
		}

		return Array.from(ids)
	}

	/**
	 * Removes all relation and has-many state owned by an entity (keys under the
	 * given owner prefix). Called by removeEntity so a removed entity leaves no
	 * stale relation state behind.
	 */
	removeOwnedRelations(keyPrefix: string): void {
		let changed = false
		for (const key of [...this.relationStates.keys()]) {
			if (key.startsWith(keyPrefix)) {
				this.relationStates.delete(key)
				changed = true
			}
		}
		for (const key of [...this.hasManyStates.keys()]) {
			if (key.startsWith(keyPrefix)) {
				this.hasManyStates.delete(key)
				changed = true
			}
		}
		if (changed) this.mutationVersion++
	}

	/**
	 * Moves an item within a has-many relation from one index to another.
	 */
	moveInHasMany(key: string, fromIndex: number, toIndex: number): void {
		const existing = this.hasManyStates.get(key)
		if (!existing) return

		const currentOrderedIds = existing.orderedIds ?? computeDefaultOrderedIds(existing)

		if (fromIndex < 0 || fromIndex >= currentOrderedIds.length) return
		if (toIndex < 0 || toIndex >= currentOrderedIds.length) return
		if (fromIndex === toIndex) return

		const newOrderedIds = [...currentOrderedIds]
		const movedItem = newOrderedIds.splice(fromIndex, 1)[0]
		if (movedItem === undefined) return
		newOrderedIds.splice(toIndex, 0, movedItem)

		this.writeHasMany(key, {
			...existing,
			orderedIds: newOrderedIds,
			version: existing.version + 1,
		})
	}

	/**
	 * Gets the ordered list of item IDs for a has-many relation.
	 */
	getHasManyOrderedIds(key: string): string[] {
		const existing = this.hasManyStates.get(key)
		if (!existing) return []

		if (existing.orderedIds !== null) {
			return existing.orderedIds
		}

		return computeDefaultOrderedIds(existing)
	}

	// ==================== Bulk Operations ====================

	/**
	 * Commits all relations (hasOne and hasMany) for an entity.
	 */
	commitAllRelations(keyPrefix: string): void {
		for (const key of this.relationStates.keys()) {
			if (key.startsWith(keyPrefix)) {
				this.commitRelation(key)
			}
		}

		for (const [key, state] of this.hasManyStates) {
			if (key.startsWith(keyPrefix)) {
				const newServerIds = new Set(state.serverIds)
				for (const removedId of state.plannedRemovals.keys()) {
					newServerIds.delete(removedId)
				}
				for (const connectedId of state.plannedConnections) {
					newServerIds.add(connectedId)
				}
				this.commitHasMany(key, Array.from(newServerIds))
			}
		}
	}

	/**
	 * Resets all relations (hasOne and hasMany) for an entity to server state.
	 */
	resetAllRelations(keyPrefix: string): void {
		for (const key of this.relationStates.keys()) {
			if (key.startsWith(keyPrefix)) {
				this.resetRelation(key)
			}
		}

		for (const key of this.hasManyStates.keys()) {
			if (key.startsWith(keyPrefix)) {
				this.resetHasMany(key)
			}
		}
	}

	// ==================== Dirty Tracking ====================

	/**
	 * Gets the list of dirty relations for an entity.
	 */
	getDirtyRelations(keyPrefix: string): string[] {
		const dirtyRelations: string[] = []

		for (const [key, state] of this.relationStates) {
			if (!key.startsWith(keyPrefix)) continue
			const fieldName = key.slice(keyPrefix.length)

			if (
				state.currentId !== state.serverId ||
				state.state !== state.serverState ||
				Object.keys(state.placeholderData).length > 0
			) {
				dirtyRelations.push(fieldName)
			}
		}

		for (const [key, state] of this.hasManyStates) {
			if (!key.startsWith(keyPrefix)) continue
			const fieldName = key.slice(keyPrefix.length)

			if (state.plannedRemovals.size > 0 || state.plannedConnections.size > 0) {
				dirtyRelations.push(fieldName)
			}
		}

		return dirtyRelations
	}

	// ==================== Export/Import ====================

	/**
	 * Exports relation states for given keys.
	 */
	exportRelationStates(keys: string[]): Map<string, StoredRelationState> {
		const result = new Map<string, StoredRelationState>()
		for (const key of keys) {
			const state = this.relationStates.get(key)
			if (state) {
				result.set(key, {
					...state,
					placeholderData: { ...state.placeholderData },
				})
			}
		}
		return result
	}

	/**
	 * Exports has-many states for given keys.
	 */
	exportHasManyStates(keys: string[]): Map<string, StoredHasManyState> {
		const result = new Map<string, StoredHasManyState>()
		for (const key of keys) {
			const state = this.hasManyStates.get(key)
			if (state) {
				result.set(key, {
					serverIds: new Set(state.serverIds),
					orderedIds: state.orderedIds ? [...state.orderedIds] : null,
					plannedRemovals: new Map(state.plannedRemovals),
					plannedConnections: new Set(state.plannedConnections),
					createdEntities: new Set(state.createdEntities),
					version: state.version,
				})
			}
		}
		return result
	}

	/**
	 * Imports relation states from a snapshot.
	 * Returns the keys that were imported for notification.
	 */
	importRelationStates(states: Map<string, StoredRelationState>): string[] {
		const keys: string[] = []
		for (const [key, state] of states) {
			this.writeRelation(key, {
				...state,
				placeholderData: { ...state.placeholderData },
			})
			keys.push(key)
		}
		return keys
	}

	/**
	 * Imports has-many states from a snapshot.
	 * Returns the keys that were imported for notification.
	 */
	importHasManyStates(states: Map<string, StoredHasManyState>): string[] {
		const keys: string[] = []
		for (const [key, state] of states) {
			this.writeHasMany(key, {
				serverIds: new Set(state.serverIds),
				orderedIds: state.orderedIds ? [...state.orderedIds] : null,
				plannedRemovals: new Map(state.plannedRemovals),
				plannedConnections: new Set(state.plannedConnections),
				createdEntities: new Set(state.createdEntities),
				version: state.version + 1,
			})
			keys.push(key)
		}
		return keys
	}

	/**
	 * Replaces all occurrences of oldId with newId across relation and hasMany states.
	 * Used after persist to rekey temp IDs to server-assigned IDs.
	 */
	replaceEntityId(oldId: string, newId: string): void {
		// Replace in has-one relation states: currentId, serverId
		for (const [key, state] of this.relationStates) {
			let changed = false
			let currentId = state.currentId
			let serverId = state.serverId

			if (currentId === oldId) { currentId = newId; changed = true }
			if (serverId === oldId) { serverId = newId; changed = true }

			if (changed) {
				this.writeRelation(key, { ...state, currentId, serverId, version: state.version + 1 })
			}
		}

		// Replace in has-many states: serverIds, orderedIds, plannedConnections, createdEntities, plannedRemovals
		for (const [key, state] of this.hasManyStates) {
			let changed = false

			let serverIds = state.serverIds
			if (serverIds.has(oldId)) {
				serverIds = new Set(serverIds)
				serverIds.delete(oldId)
				serverIds.add(newId)
				changed = true
			}

			let orderedIds = state.orderedIds
			if (orderedIds) {
				const idx = orderedIds.indexOf(oldId)
				if (idx !== -1) {
					orderedIds = [...orderedIds]
					orderedIds[idx] = newId
					changed = true
				}
			}

			let plannedConnections = state.plannedConnections
			if (plannedConnections.has(oldId)) {
				plannedConnections = new Set(plannedConnections)
				plannedConnections.delete(oldId)
				plannedConnections.add(newId)
				changed = true
			}

			let createdEntities = state.createdEntities
			if (createdEntities.has(oldId)) {
				createdEntities = new Set(createdEntities)
				createdEntities.delete(oldId)
				createdEntities.add(newId)
				changed = true
			}

			let plannedRemovals = state.plannedRemovals
			if (plannedRemovals.has(oldId)) {
				const removalType = plannedRemovals.get(oldId)!
				plannedRemovals = new Map(plannedRemovals)
				plannedRemovals.delete(oldId)
				plannedRemovals.set(newId, removalType)
				changed = true
			}

			if (changed) {
				this.writeHasMany(key, {
					serverIds,
					orderedIds,
					plannedRemovals,
					plannedConnections,
					createdEntities,
					version: state.version + 1,
				})
			}
		}
	}

	/**
	 * Migrates an entity's relation state for a temp→persisted rekey: first the
	 * relation/has-many keys it owns (the parent id in the key), then every value
	 * reference to its id from other entities' relations.
	 */
	rekey(ctx: RekeyContext): void {
		this.rekeyOwner(ctx.oldKeyPrefix, ctx.newKeyPrefix)
		this.replaceEntityId(ctx.oldId, ctx.newId)
	}

	/**
	 * Rekeys relation/hasMany entries owned by an entity (changes the parent ID in the key).
	 */
	rekeyOwner(oldKeyPrefix: string, newKeyPrefix: string): void {
		const toMoveRelations: [string, StoredRelationState][] = []
		for (const [key, value] of this.relationStates) {
			if (key.startsWith(oldKeyPrefix)) {
				toMoveRelations.push([key, value])
			}
		}
		for (const [oldKey, value] of toMoveRelations) {
			this.relationStates.delete(oldKey)
			this.writeRelation(newKeyPrefix + oldKey.slice(oldKeyPrefix.length), value)
		}

		const toMoveHasMany: [string, StoredHasManyState][] = []
		for (const [key, value] of this.hasManyStates) {
			if (key.startsWith(oldKeyPrefix)) {
				toMoveHasMany.push([key, value])
			}
		}
		for (const [oldKey, value] of toMoveHasMany) {
			this.hasManyStates.delete(oldKey)
			this.writeHasMany(newKeyPrefix + oldKey.slice(oldKeyPrefix.length), value)
		}
	}

	/**
	 * Clears all relation data.
	 */
	clear(): void {
		this.relationStates.clear()
		this.hasManyStates.clear()
		this.mutationVersion++
	}
}

// ==================== Helper Functions ====================

/**
 * Computes the default ordered IDs for a has-many relation.
 * Order is: serverIds (minus removals) + plannedConnections
 */
export function computeDefaultOrderedIds(state: StoredHasManyState): string[] {
	const result: string[] = []

	for (const id of state.serverIds) {
		if (!state.plannedRemovals.has(id)) {
			result.push(id)
		}
	}

	for (const id of state.plannedConnections) {
		if (!result.includes(id)) {
			result.push(id)
		}
	}

	return result
}

function arraysEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false
	}
	return true
}
