import type { HasOneRelationState } from '../handles/types.js'
import type { EntitySnapshot } from './snapshots.js'
import { parentKeyFromRelationKey } from './relationKey.js'

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
 * Owns has-one relation state ("parentType:parentId:fieldName" → {@link StoredRelationState}).
 *
 * Has its own monotonic {@link mutationVersion} bumped on every actual write
 * (funnelled through {@link writeRelation} plus the delete/clear paths); the
 * facade sums this with the has-many counter for {@link ReachabilityAnalyzer}.
 */
export class HasOneStore {
	/** Relation states keyed by "parentType:parentId:fieldName" */
	private readonly relationStates = new Map<string, StoredRelationState>()

	private mutationVersion = 0

	getMutationVersion(): number {
		return this.mutationVersion
	}

	private writeRelation(key: string, state: StoredRelationState): void {
		this.relationStates.set(key, state)
		this.mutationVersion++
	}

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

	/**
	 * Collects the ids of child entities reachable through LIVE has-one edges
	 * (key prefix "parentType:parentId:"): currentId, when the relation is not
	 * disconnected/deleted.
	 */
	collectLiveChildIds(keyPrefix: string, ids: Set<string>): void {
		for (const [key, state] of this.relationStates) {
			if (!key.startsWith(keyPrefix)) continue
			if (state.currentId !== null && state.state !== 'deleted') {
				ids.add(state.currentId)
			}
		}
	}

	/**
	 * Adds the composite parent keys of every LIVE has-one edge pointing at
	 * {@link childId} (currentId === childId, when the relation is not 'deleted').
	 */
	collectParentKeysForChild(childId: string, parents: Set<string>): void {
		for (const [key, state] of this.relationStates) {
			if (state.currentId === childId && state.state !== 'deleted') {
				parents.add(parentKeyFromRelationKey(key))
			}
		}
	}

	/**
	 * Removes all has-one state owned by an entity (keys under the given owner
	 * prefix). Bumps the mutation version once if anything was removed.
	 */
	removeOwnedRelations(keyPrefix: string): void {
		let changed = false
		for (const key of [...this.relationStates.keys()]) {
			if (key.startsWith(keyPrefix)) {
				this.relationStates.delete(key)
				changed = true
			}
		}
		if (changed) this.mutationVersion++
	}

	/**
	 * Commits all has-one relations for an entity.
	 */
	commitAllRelations(keyPrefix: string): void {
		for (const key of this.relationStates.keys()) {
			if (key.startsWith(keyPrefix)) {
				this.commitRelation(key)
			}
		}
	}

	/**
	 * Resets all has-one relations for an entity to server state.
	 */
	resetAllRelations(keyPrefix: string): void {
		for (const key of this.relationStates.keys()) {
			if (key.startsWith(keyPrefix)) {
				this.resetRelation(key)
			}
		}
	}

	/**
	 * Collects the field names of dirty has-one relations for an entity.
	 */
	collectDirtyRelations(keyPrefix: string, dirtyRelations: string[]): void {
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
	}

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
	 * Replaces all occurrences of oldId with newId across has-one relation states
	 * (currentId, serverId).
	 */
	replaceEntityId(oldId: string, newId: string): void {
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
	}

	/**
	 * Rekeys has-one entries owned by an entity (changes the parent ID in the key).
	 */
	rekeyOwner(oldKeyPrefix: string, newKeyPrefix: string): void {
		const toMove: [string, StoredRelationState][] = []
		for (const [key, value] of this.relationStates) {
			if (key.startsWith(oldKeyPrefix)) {
				toMove.push([key, value])
			}
		}
		for (const [oldKey, value] of toMove) {
			this.relationStates.delete(oldKey)
			this.writeRelation(newKeyPrefix + oldKey.slice(oldKeyPrefix.length), value)
		}
	}

	/**
	 * Clears all has-one relation data.
	 */
	clear(): void {
		this.relationStates.clear()
		this.mutationVersion++
	}
}
