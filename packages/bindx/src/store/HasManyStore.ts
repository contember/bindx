import { parentKeyFromOwnerPrefix, parentKeyFromRelationKey } from './relationKey.js'
import { RelationEdgeIndex } from './RelationEdgeIndex.js'

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
	if (a.size !== b.size) return false
	for (const item of a) {
		if (!b.has(item)) return false
	}
	return true
}

function arraysEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false
	}
	return true
}

/**
 * Removal type for has-many items
 */
export type HasManyRemovalType = 'disconnect' | 'delete'

/**
 * Kind of a planned has-many addition:
 *   - 'created': a newly created entity (via add())
 *   - 'connected': an existing persisted entity being connected (via connect())
 */
export type HasManyAdditionKind = 'created' | 'connected'

/**
 * Has-many list state stored in SnapshotStore
 */
export interface StoredHasManyState {
	/** IDs of items from server */
	serverIds: Set<string>
	/** Explicit ordered list of item IDs, null means use default order (serverIds + plannedAdditions) */
	orderedIds: string[] | null
	/** Planned removals (disconnect or delete) keyed by entity ID */
	plannedRemovals: Map<string, HasManyRemovalType>
	/**
	 * Planned additions (IDs to add to the list) keyed by entity ID, with the
	 * value distinguishing newly CREATED entities (add()) from existing PERSISTED
	 * entities being CONNECTED (connect()). The keys are exactly the connections;
	 * the keys whose value is 'created' are exactly the created entities, so the
	 * "created ⊆ connections" invariant is structural.
	 */
	plannedAdditions: Map<string, HasManyAdditionKind>
	version: number
}

/**
 * Computes the default ordered IDs for a has-many relation.
 * Order is: serverIds (minus removals) + plannedAdditions
 */
export function computeDefaultOrderedIds(state: StoredHasManyState): string[] {
	const result: string[] = []

	for (const id of state.serverIds) {
		if (!state.plannedRemovals.has(id)) {
			result.push(id)
		}
	}

	for (const id of state.plannedAdditions.keys()) {
		if (!result.includes(id)) {
			result.push(id)
		}
	}

	return result
}

/**
 * Owns has-many list state ("parentType:parentId:fieldName" → {@link StoredHasManyState}).
 *
 * Has its own monotonic {@link mutationVersion} bumped on every actual write
 * (funnelled through {@link writeHasMany} plus the delete/clear paths); the
 * facade sums this with the has-one counter for {@link ReachabilityAnalyzer}.
 */
export class HasManyStore {
	/** Has-many list states keyed by "parentType:parentId:fieldName" */
	private readonly hasManyStates = new Map<string, StoredHasManyState>()

	/**
	 * Bidirectional live-edge index, maintained by {@link writeHasMany} /
	 * {@link deleteHasMany} so the parent↔child queries are O(degree) and the two
	 * directions stay consistent by construction.
	 */
	private readonly edges = new RelationEdgeIndex()

	private mutationVersion = 0

	getMutationVersion(): number {
		return this.mutationVersion
	}

	/**
	 * The single write chokepoint. Reconciles the edge index by diffing the live
	 * members of the previous state against the next, so every state-changing path
	 * (server ids / planned add/remove / move / import / replaceEntityId / ...)
	 * keeps the index correct without tracking the reverse direction itself.
	 */
	private writeHasMany(key: string, state: StoredHasManyState): void {
		const oldLive = liveHasManyChildIds(this.hasManyStates.get(key))
		const newLive = liveHasManyChildIds(state)
		this.hasManyStates.set(key, state)
		const parentKey = parentKeyFromRelationKey(key)
		for (const id of newLive) if (!oldLive.has(id)) this.edges.addEdge(parentKey, id)
		for (const id of oldLive) if (!newLive.has(id)) this.edges.removeEdge(parentKey, id)
		this.mutationVersion++
	}

	/**
	 * The single delete chokepoint — removes an entry and its live edges. Used by
	 * the bulk remove and rekey-owner paths so they don't leak edges.
	 */
	private deleteHasMany(key: string): void {
		const existing = this.hasManyStates.get(key)
		if (!existing) return
		const parentKey = parentKeyFromRelationKey(key)
		for (const id of liveHasManyChildIds(existing)) this.edges.removeEdge(parentKey, id)
		this.hasManyStates.delete(key)
		this.mutationVersion++
	}

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
				plannedAdditions: new Map(),
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
				plannedAdditions: new Map(),
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
				plannedAdditions: new Map(),
				version: 0,
			})
		} else {
			const newPlannedRemovals = new Map(existing.plannedRemovals)
			newPlannedRemovals.set(itemId, type)
			const newPlannedAdditions = new Map(existing.plannedAdditions)
			newPlannedAdditions.delete(itemId)
			let newOrderedIds = existing.orderedIds
			if (newOrderedIds !== null) {
				newOrderedIds = newOrderedIds.filter(id => id !== itemId)
			}
			this.writeHasMany(key, {
				...existing,
				orderedIds: newOrderedIds,
				plannedRemovals: newPlannedRemovals,
				plannedAdditions: newPlannedAdditions,
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
				plannedAdditions: new Map([[itemId, 'connected']]),
				version: 0,
			})
		} else {
			const newPlannedAdditions = new Map(existing.plannedAdditions)
			// Do not downgrade an existing 'created' addition to 'connected'.
			if (newPlannedAdditions.get(itemId) !== 'created') {
				newPlannedAdditions.set(itemId, 'connected')
			}
			const newPlannedRemovals = new Map(existing.plannedRemovals)
			newPlannedRemovals.delete(itemId)
			let newOrderedIds = existing.orderedIds
			if (newOrderedIds !== null && !newOrderedIds.includes(itemId)) {
				newOrderedIds = [...newOrderedIds, itemId]
			}
			this.writeHasMany(key, {
				...existing,
				orderedIds: newOrderedIds,
				plannedAdditions: newPlannedAdditions,
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
			plannedAdditions: new Map(),
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
			plannedAdditions: new Map(),
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
				plannedAdditions: new Map([[itemId, 'created']]),
				version: 0,
			})
		} else {
			const newPlannedAdditions = new Map(existing.plannedAdditions)
			newPlannedAdditions.set(itemId, 'created')
			const currentOrderedIds = existing.orderedIds ?? computeDefaultOrderedIds(existing)
			const newOrderedIds = [...currentOrderedIds, itemId]
			this.writeHasMany(key, {
				...existing,
				orderedIds: newOrderedIds,
				plannedAdditions: newPlannedAdditions,
				version: existing.version + 1,
			})
		}
	}

	/**
	 * Connects an existing (persisted) entity to a has-many relation.
	 * Unlike addToHasMany, records the addition as 'connected' (not 'created') —
	 * used for materializing embedded connect references to existing entities.
	 */
	connectExistingToHasMany(key: string, itemId: string): void {
		const existing = this.hasManyStates.get(key)

		if (!existing) {
			this.writeHasMany(key, {
				serverIds: new Set(),
				orderedIds: [itemId],
				plannedRemovals: new Map(),
				plannedAdditions: new Map([[itemId, 'connected']]),
				version: 0,
			})
		} else {
			const newPlannedAdditions = new Map(existing.plannedAdditions)
			// Do not downgrade an existing 'created' addition to 'connected'.
			if (newPlannedAdditions.get(itemId) !== 'created') {
				newPlannedAdditions.set(itemId, 'connected')
			}
			// Only touch an explicit order — the default order already derives from
			// plannedAdditions (see computeDefaultOrderedIds). Guard against
			// re-appending an id that is already listed: this path re-runs whenever an
			// embedded connect reference is re-materialized, and an unconditional
			// append would surface the same item twice (mirrors planHasManyConnection).
			let newOrderedIds = existing.orderedIds
			if (newOrderedIds !== null && !newOrderedIds.includes(itemId)) {
				newOrderedIds = [...newOrderedIds, itemId]
			}
			this.writeHasMany(key, {
				...existing,
				orderedIds: newOrderedIds,
				plannedAdditions: newPlannedAdditions,
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

		const isCreatedEntity = existing.plannedAdditions.get(itemId) === 'created'

		if (isCreatedEntity) {
			const newPlannedAdditions = new Map(existing.plannedAdditions)
			newPlannedAdditions.delete(itemId)
			let newOrderedIds = existing.orderedIds
			if (newOrderedIds !== null) {
				newOrderedIds = newOrderedIds.filter(id => id !== itemId)
			}

			const newState: StoredHasManyState = {
				...existing,
				orderedIds: newOrderedIds,
				plannedAdditions: newPlannedAdditions,
				version: existing.version + 1,
			}

			if (
				newPlannedAdditions.size === 0 &&
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

	/**
	 * Collects the ids of child entities reachable through LIVE has-many edges
	 * (key prefix "parentType:parentId:") — an O(degree) read of the edge index.
	 */
	collectLiveChildIds(keyPrefix: string, ids: Set<string>): void {
		this.edges.collectChildren(parentKeyFromOwnerPrefix(keyPrefix), ids)
	}

	/**
	 * Adds the composite parent keys of every LIVE has-many edge containing
	 * {@link childId} — an O(degree) read of the edge index, the exact reverse of
	 * {@link collectLiveChildIds}.
	 */
	collectParentKeysForChild(childId: string, parents: Set<string>): void {
		this.edges.collectParents(childId, parents)
	}

	/**
	 * Removes all has-many state owned by an entity (keys under the given owner
	 * prefix), dropping each entry's edges through {@link deleteHasMany}.
	 */
	removeOwnedRelations(keyPrefix: string): void {
		for (const key of [...this.hasManyStates.keys()]) {
			if (key.startsWith(keyPrefix)) {
				this.deleteHasMany(key)
			}
		}
	}

	/**
	 * Commits all has-many relations for an entity.
	 */
	commitAllRelations(keyPrefix: string): void {
		for (const [key, state] of this.hasManyStates) {
			if (key.startsWith(keyPrefix)) {
				const newServerIds = new Set(state.serverIds)
				for (const removedId of state.plannedRemovals.keys()) {
					newServerIds.delete(removedId)
				}
				for (const connectedId of state.plannedAdditions.keys()) {
					newServerIds.add(connectedId)
				}
				this.commitHasMany(key, Array.from(newServerIds))
			}
		}
	}

	/**
	 * Resets all has-many relations for an entity to server state.
	 */
	resetAllRelations(keyPrefix: string): void {
		for (const key of this.hasManyStates.keys()) {
			if (key.startsWith(keyPrefix)) {
				this.resetHasMany(key)
			}
		}
	}

	/**
	 * Collects the field names of dirty has-many relations for an entity.
	 */
	collectDirtyRelations(keyPrefix: string, dirtyRelations: string[]): void {
		for (const [key, state] of this.hasManyStates) {
			if (!key.startsWith(keyPrefix)) continue
			const fieldName = key.slice(keyPrefix.length)

			if (state.plannedRemovals.size > 0 || state.plannedAdditions.size > 0) {
				dirtyRelations.push(fieldName)
			}
		}
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
					plannedAdditions: new Map(state.plannedAdditions),
					version: state.version,
				})
			}
		}
		return result
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
				plannedAdditions: new Map(state.plannedAdditions),
				version: state.version + 1,
			})
			keys.push(key)
		}
		return keys
	}

	/**
	 * Replaces all occurrences of oldId with newId across has-many states
	 * (serverIds, orderedIds, plannedAdditions, plannedRemovals).
	 */
	replaceEntityId(oldId: string, newId: string): void {
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

			let plannedAdditions = state.plannedAdditions
			const additionKind = plannedAdditions.get(oldId)
			if (additionKind !== undefined) {
				plannedAdditions = new Map(plannedAdditions)
				plannedAdditions.delete(oldId)
				plannedAdditions.set(newId, additionKind)
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
					plannedAdditions,
					version: state.version + 1,
				})
			}
		}
	}

	/**
	 * Rekeys has-many entries owned by an entity (changes the parent ID in the key).
	 * Routing through {@link deleteHasMany} + {@link writeHasMany} migrates the edge
	 * index from the old parent key to the new one for free.
	 */
	rekeyOwner(oldKeyPrefix: string, newKeyPrefix: string): void {
		const toMove: [string, StoredHasManyState][] = []
		for (const [key, value] of this.hasManyStates) {
			if (key.startsWith(oldKeyPrefix)) {
				toMove.push([key, value])
			}
		}
		for (const [oldKey, value] of toMove) {
			this.deleteHasMany(oldKey)
			this.writeHasMany(newKeyPrefix + oldKey.slice(oldKeyPrefix.length), value)
		}
	}

	/**
	 * Clears all has-many relation data.
	 */
	clear(): void {
		this.hasManyStates.clear()
		this.edges.clear()
		this.mutationVersion++
	}
}

/**
 * The single liveness predicate for has-many membership: effective members are
 * (serverIds ∪ plannedAdditions) minus plannedRemovals. Defined once and consumed
 * by the write chokepoint so the forward/reverse index can never drift from it.
 */
function liveHasManyChildIds(state: StoredHasManyState | undefined): Set<string> {
	const live = new Set<string>()
	if (!state) return live
	for (const id of state.serverIds) {
		if (!state.plannedRemovals.has(id)) live.add(id)
	}
	for (const id of state.plannedAdditions.keys()) {
		if (!state.plannedRemovals.has(id)) live.add(id)
	}
	return live
}
