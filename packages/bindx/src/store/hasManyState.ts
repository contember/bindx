/**
 * The has-many state algebra: the stored shape plus every pure function over it.
 *
 * Separated from {@link HasManyStore}, which owns the keyed map, the write
 * chokepoint and the three indexes. Nothing here touches the store's state.
 */

export type ReconciliationResult = 'applied' | 'conflict'

export function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
	if (a.size !== b.size) return false
	for (const item of a) {
		if (!b.has(item)) return false
	}
	return true
}

export function arraysEqual(a: string[], b: string[]): boolean {
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

export interface SentHasManyAddition {
	itemId: string
	kind: HasManyAdditionKind
}

export interface SentHasManyRemoval {
	itemId: string
	type: HasManyRemovalType
}

export interface SentHasManyDelta {
	additions: readonly SentHasManyAddition[]
	removals: readonly SentHasManyRemoval[]
}

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

export function cloneHasManyState(state: StoredHasManyState): StoredHasManyState {
	return {
		serverIds: new Set(state.serverIds),
		orderedIds: state.orderedIds ? [...state.orderedIds] : null,
		plannedRemovals: new Map(state.plannedRemovals),
		plannedAdditions: new Map(state.plannedAdditions),
		version: state.version,
	}
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
 * The single liveness predicate for has-many membership: effective members are
 * (serverIds ∪ plannedAdditions) minus plannedRemovals. Defined once and consumed
 * by the write chokepoint so the forward/reverse index can never drift from it.
 */
export function liveHasManyChildIds(state: StoredHasManyState | undefined): Set<string> {
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

export function plannedDeleteChildIds(state: StoredHasManyState | undefined): Set<string> {
	const ids = new Set<string>()
	if (!state) return ids
	for (const [id, type] of state.plannedRemovals) {
		if (type === 'delete') ids.add(id)
	}
	return ids
}

export interface HasManyReconciliation {
	state: StoredHasManyState
	result: ReconciliationResult
}

export function reconcileHasManyState(
	existing: StoredHasManyState,
	delta: SentHasManyDelta,
): HasManyReconciliation {
	const currentLive = liveHasManyChildIds(existing)
	const serverIds = new Set(existing.serverIds)
	const plannedAdditions = new Map(existing.plannedAdditions)
	const plannedRemovals = new Map(existing.plannedRemovals)
	let result: ReconciliationResult = 'applied'

	for (const addition of delta.additions) {
		serverIds.add(addition.itemId)
		plannedAdditions.delete(addition.itemId)
		plannedRemovals.delete(addition.itemId)
		if (!currentLive.has(addition.itemId)) {
			plannedRemovals.set(
				addition.itemId,
				addition.kind === 'created' ? 'delete' : 'disconnect',
			)
		}
	}

	for (const removal of delta.removals) {
		serverIds.delete(removal.itemId)
		const currentRemoval = plannedRemovals.get(removal.itemId)
		if (currentRemoval === removal.type) plannedRemovals.delete(removal.itemId)

		if (!currentLive.has(removal.itemId)) {
			if (removal.type === 'delete') plannedRemovals.delete(removal.itemId)
			continue
		}
		if (removal.type === 'delete') {
			result = 'conflict'
		} else if (!plannedAdditions.has(removal.itemId)) {
			plannedAdditions.set(removal.itemId, 'connected')
		}
	}

	return {
		state: {
			serverIds,
			orderedIds: existing.orderedIds ? [...existing.orderedIds] : null,
			plannedRemovals,
			plannedAdditions,
			version: existing.version + 1,
		},
		result,
	}
}
