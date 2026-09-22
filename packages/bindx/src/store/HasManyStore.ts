import { fieldFromRelationKey, parentKeyFromOwnerPrefix, parentKeyFromRelationKey } from './relationKey.js'
import { PlannedDeleteIndex } from './PlannedDeleteIndex.js'
import { RelationEdgeIndex } from './RelationEdgeIndex.js'
import { RelationOwnerIndex } from './RelationOwnerIndex.js'
import {
	additionFoldTargets,
	arraysEqual,
	cloneHasManyState,
	computeViewOrderedIds,
	createHasManyView,
	emptyHasManyState,
	liveHasManyChildIds,
	plannedDeleteChildIds,
	reconcileHasManyState,
	setsEqual,
	toRelationProjection,
	toViewProjection,
	viewOrderedIds,
	type HasManyRelationProjection,
	type HasManyRemovalType,
	type HasManyViewMembership,
	type HasManyViewProjection,
	type ReconciliationResult,
	type SentHasManyDelta,
	type StoredHasManyState,
} from './hasManyState.js'

/**
 * Owns has-many relation state ("parentType:parentId:fieldName" → {@link StoredHasManyState}).
 *
 * The key's last segment is always the SCHEMA FIELD NAME; an args-view's alias
 * addresses a view INSIDE the state, never a key of its own. See the module doc of
 * `hasManyState.ts` for why reads are per view and writes are not.
 *
 * Has its own monotonic {@link mutationVersion} bumped on every actual write
 * (funnelled through {@link writeHasMany} plus the delete/clear paths); the
 * facade sums this with the has-one counter for {@link ReachabilityAnalyzer}.
 */
export class HasManyStore {
	/** Has-many relation states keyed by "parentType:parentId:fieldName" */
	private readonly hasManyStates = new Map<string, StoredHasManyState>()
	private readonly owners = new RelationOwnerIndex()

	/**
	 * Bidirectional live-edge index, maintained by {@link writeHasMany} /
	 * {@link deleteHasMany} so the parent↔child queries are O(degree) and the two
	 * directions stay consistent by construction.
	 */
	private readonly edges = new RelationEdgeIndex()

	/**
	 * Children some relation plans to remove with `delete`, maintained by
	 * {@link writeHasMany} / {@link deleteHasMany}, like {@link edges}.
	 */
	private readonly plannedDeletes = new PlannedDeleteIndex()

	private mutationVersion = 0

	/**
	 * Monotonic counter bumped on EDITABLE-layer has-many writes (plan add/remove,
	 * add, connectExisting, remove, move, reset) — the writes an undo gesture must
	 * first record. Server- id ingestion (setHasManyServerIds), materialization
	 * (getOrCreateHasMany), post-persist commit, import, replaceEntityId, rekey and
	 * delete deliberately do NOT bump it. Read by the undo write-guard (see UndoJournal).
	 */
	private editableWriteVersion = 0

	getMutationVersion(): number {
		return this.mutationVersion
	}

	getEditableWriteVersion(): number {
		return this.editableWriteVersion
	}

	/**
	 * The single write chokepoint. Reconciles the edge index by diffing the live
	 * members of the previous state against the next, so every state-changing path
	 * (server ids / planned add/remove / move / import / replaceEntityId / ...)
	 * keeps the index correct without tracking the reverse direction itself.
	 */
	private writeHasMany(key: string, state: StoredHasManyState): void {
		const previous = this.hasManyStates.get(key)
		const oldLive = liveHasManyChildIds(previous)
		const newLive = liveHasManyChildIds(state)
		this.hasManyStates.set(key, state)
		if (!previous) this.owners.add(key)
		const parentKey = parentKeyFromRelationKey(key)
		for (const id of newLive) if (!oldLive.has(id)) this.edges.addEdge(parentKey, id)
		for (const id of oldLive) if (!newLive.has(id)) this.edges.removeEdge(parentKey, id)
		this.reconcilePlannedDeletes(plannedDeleteChildIds(previous), plannedDeleteChildIds(state))
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
		this.owners.delete(key)
		this.reconcilePlannedDeletes(plannedDeleteChildIds(existing), new Set())
		this.mutationVersion++
	}

	/** Applies one relation's planned-delete diff to the refcounted index. */
	private reconcilePlannedDeletes(previous: ReadonlySet<string>, next: ReadonlySet<string>): void {
		for (const id of next) if (!previous.has(id)) this.plannedDeletes.retain(id)
		for (const id of previous) if (!next.has(id)) this.plannedDeletes.release(id)
	}

	/** Whether any has-many relation plans to remove {@link childId} with `delete`. */
	isPlannedForDelete(childId: string): boolean {
		return this.plannedDeletes.has(childId)
	}

	/**
	 * Membership declared for an args-view, keyed by "fieldName:alias" — one entry per
	 * distinct selection in the application, so it does not grow with the data. The
	 * alias alone would not do: two fields may carry the same explicit `as`.
	 *
	 * Only the caller that selected the relation knows its params, and the alias is a
	 * hash it cannot reconstruct them from. {@link EntityHandle} declares them before
	 * it hands out a handle, which is strictly before any path can materialize the view.
	 */
	private readonly declaredMembership = new Map<string, HasManyViewMembership>()

	declareViewMembership(fieldName: string, alias: string, membership: HasManyViewMembership): void {
		this.declaredMembership.set(`${fieldName}:${alias}`, membership)
	}

	/**
	 * A view addressed by the field name itself is the unparameterized selection, so
	 * its args cannot exclude any member of the relation. Anything else needs a
	 * declaration; without one the view is assumed filtered, which is the safe
	 * direction — the client then never claims membership it cannot prove.
	 */
	private viewMembership(key: string, alias: string): HasManyViewMembership {
		const fieldName = fieldFromRelationKey(key)
		if (alias === fieldName) return 'total'
		return this.declaredMembership.get(`${fieldName}:${alias}`) ?? 'partial'
	}

	/**
	 * Starts an edit: a deep copy of the current state (or a fresh one), with the
	 * addressed view materialized. Every mutator builds on this, so no path can hand
	 * {@link writeHasMany} a state sharing mutable structure with the live one — which
	 * SnapshotStore's dirty-version memo and the undo journal's images both rely on.
	 */
	private editableState(key: string, alias?: string): StoredHasManyState {
		const existing = this.hasManyStates.get(key)
		const state = existing ? cloneHasManyState(existing) : emptyHasManyState()
		if (alias !== undefined && !state.views.has(alias)) {
			state.views.set(alias, createHasManyView(this.viewMembership(key, alias)))
		}
		return state
	}

	private commitEdit(key: string, state: StoredHasManyState): void {
		const existing = this.hasManyStates.get(key)
		state.version = existing ? existing.version + 1 : 0
		this.writeHasMany(key, state)
	}

	/**
	 * Gets or creates the relation state and the addressed view, refreshing that
	 * view's server baseline when one is supplied.
	 */
	getOrCreateHasMany(key: string, alias: string, serverIds?: string[]): void {
		const view = this.hasManyStates.get(key)?.views.get(alias)
		if (view && (serverIds === undefined || setsEqual(view.serverIds, new Set(serverIds)))) {
			return
		}

		const state = this.editableState(key, alias)
		if (serverIds !== undefined) {
			const next = state.views.get(alias)!
			next.serverIds = new Set(serverIds)
			// A refreshed baseline invalidates only THIS view's manual ordering.
			next.orderedIds = null
		}
		this.commitEdit(key, state)
	}

	/** Relation state, deep-copied. For the export / undo paths that move whole states. */
	getHasMany(key: string): StoredHasManyState | undefined {
		const state = this.hasManyStates.get(key)
		return state ? cloneHasManyState(state) : undefined
	}

	/** What persistence, dirty tracking and error paths see: one relation, no views. */
	getRelationProjection(key: string): HasManyRelationProjection | undefined {
		const state = this.hasManyStates.get(key)
		return state ? toRelationProjection(state) : undefined
	}

	/** What one mounted has-many handle sees. */
	getViewProjection(key: string, alias: string): HasManyViewProjection {
		return toViewProjection(this.hasManyStates.get(key), alias)
	}

	/** Whether the relation carries writes the next persist would send. */
	hasPendingWrites(key: string): boolean {
		const state = this.hasManyStates.get(key)
		if (!state) return false
		return state.plannedRemovals.size > 0 || state.plannedAdditions.size > 0
	}

	/** Whether one view carries an order its user arranged rather than the default one. */
	hasExplicitOrder(key: string, alias: string): boolean {
		const orderedIds = this.hasManyStates.get(key)?.views.get(alias)?.orderedIds
		return orderedIds !== null && orderedIds !== undefined
	}

	/**
	 * Per-view server baselines by reference, for callers that only read them.
	 *
	 * Not cloned, deliberately: every mutator builds on {@link editableState}, so a
	 * stored Set is never mutated in place — only replaced. A handed-out reference can
	 * therefore go stale but can never be written through.
	 */
	collectViewServerIds(key: string): ReadonlyMap<string, ReadonlySet<string>> {
		const byView = new Map<string, ReadonlySet<string>>()
		const state = this.hasManyStates.get(key)
		if (state) {
			for (const [alias, view] of state.views) byView.set(alias, view.serverIds)
		}
		return byView
	}

	/** Replaces one view's server baseline. */
	setHasManyServerIds(key: string, alias: string, serverIds: string[]): void {
		const state = this.editableState(key, alias)
		const view = state.views.get(alias)!
		view.serverIds = new Set(serverIds)
		view.orderedIds = null
		this.commitEdit(key, state)
	}

	/**
	 * Plans a removal. Relation-level: the item stops being a member of the relation,
	 * so it leaves every view's ordering too.
	 */
	planHasManyRemoval(key: string, itemId: string, type: HasManyRemovalType): void {
		const state = this.editableState(key)
		state.plannedRemovals.set(itemId, type)
		state.plannedAdditions.delete(itemId)
		this.dropFromEveryExplicitOrder(state, itemId)
		this.commitEdit(key, state)
		this.editableWriteVersion++
	}

	/**
	 * Plans a connection of an existing entity, rendered in the view it was made in.
	 */
	planHasManyConnection(key: string, alias: string, itemId: string): void {
		const state = this.editableState(key, alias)
		this.recordAddition(state, alias, itemId, 'connected')
		this.appendToExplicitOrder(state, alias, itemId)
		this.commitEdit(key, state)
		this.editableWriteVersion++
	}

	/**
	 * Adds a newly created entity to a has-many relation.
	 * Used by HasManyListHandle.add() for inline entity creation.
	 */
	addToHasMany(key: string, alias: string, itemId: string): void {
		const state = this.editableState(key, alias)
		// The order is materialized BEFORE the addition is recorded, so the append
		// cannot duplicate an id the default order would by then already contain.
		const order = viewOrderedIds(state, alias)
		this.recordAddition(state, alias, itemId, 'created')
		state.views.get(alias)!.orderedIds = [...order, itemId]
		this.commitEdit(key, state)
		this.editableWriteVersion++
	}

	/**
	 * Connects an existing (persisted) entity to a has-many relation.
	 * Unlike addToHasMany, records the addition as 'connected' (not 'created') —
	 * used for materializing embedded connect references to existing entities.
	 */
	connectExistingToHasMany(key: string, alias: string, itemId: string): void {
		const fresh = !this.hasManyStates.has(key)
		const state = this.editableState(key, alias)
		this.recordAddition(state, alias, itemId, 'connected')
		if (fresh) {
			state.views.get(alias)!.orderedIds = [itemId]
		} else {
			this.appendToExplicitOrder(state, alias, itemId)
		}
		this.commitEdit(key, state)
		this.editableWriteVersion++
	}

	/**
	 * Records an addition and the view it renders in. Never downgrades an existing
	 * 'created' addition to 'connected', and cancels a pending removal of the same
	 * item — leaving both recorded would hide a listed item from the live-edge index.
	 */
	private recordAddition(
		state: StoredHasManyState,
		alias: string,
		itemId: string,
		kind: 'created' | 'connected',
	): void {
		const existing = state.plannedAdditions.get(itemId)
		if (existing) {
			existing.origins.add(alias)
			if (kind === 'created') existing.kind = 'created'
		} else {
			state.plannedAdditions.set(itemId, { kind, origins: new Set([alias]) })
		}
		state.plannedRemovals.delete(itemId)
	}

	/**
	 * Only touches an EXPLICIT order — the default order already derives from
	 * plannedAdditions. Guards against re-appending an id that is already listed:
	 * the connect paths re-run whenever an embedded reference is re-materialized.
	 */
	private appendToExplicitOrder(state: StoredHasManyState, alias: string, itemId: string): void {
		const view = state.views.get(alias)!
		if (view.orderedIds !== null && !view.orderedIds.includes(itemId)) {
			view.orderedIds = [...view.orderedIds, itemId]
		}
	}

	private dropFromEveryExplicitOrder(state: StoredHasManyState, itemId: string): void {
		for (const view of state.views.values()) {
			if (view.orderedIds !== null) {
				view.orderedIds = view.orderedIds.filter(id => id !== itemId)
			}
		}
	}

	/**
	 * Advances the server baseline by the confirmed sent delta and rebases local
	 * edits made after the request started onto that new baseline.
	 */
	reconcileSentDelta(key: string, delta: SentHasManyDelta): ReconciliationResult {
		const existing = this.hasManyStates.get(key)
		if (!existing) return 'conflict'

		const next = reconcileHasManyState(existing, delta, fieldFromRelationKey(key))
		this.writeHasMany(key, next.state)
		return next.result
	}

	/**
	 * Resets has-many state to server state (clears planned operations).
	 * Relation-level: planned removals carry no view, so a per-view reset could not
	 * know which of them to drop.
	 */
	resetHasMany(key: string): void {
		if (!this.hasManyStates.has(key)) return

		const state = this.editableState(key)
		state.plannedRemovals.clear()
		state.plannedAdditions.clear()
		for (const view of state.views.values()) view.orderedIds = null
		this.commitEdit(key, state)
		this.editableWriteVersion++
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

		if (existing.plannedAdditions.get(itemId)?.kind !== 'created') {
			// planHasManyRemoval bumps editableWriteVersion itself.
			this.planHasManyRemoval(key, itemId, removalType)
			return true
		}

		// Cancelling a pending create cancels it in every view at once: the entity is
		// going away, so leaving it listed elsewhere would show a row nothing persists.
		const state = this.editableState(key)
		state.plannedAdditions.delete(itemId)
		this.dropFromEveryExplicitOrder(state, itemId)

		if (state.plannedAdditions.size === 0 && state.plannedRemovals.size === 0) {
			for (const [alias, view] of state.views) {
				if (view.orderedIds !== null && arraysEqual(view.orderedIds, computeViewOrderedIds(state, alias))) {
					view.orderedIds = null
				}
			}
		}

		this.commitEdit(key, state)
		this.editableWriteVersion++
		return true
	}

	/**
	 * Moves an item within one view of a has-many relation. Ordering is presentation
	 * only — nothing persists it — so it stays per view.
	 */
	moveInHasMany(key: string, alias: string, fromIndex: number, toIndex: number): void {
		const existing = this.hasManyStates.get(key)
		if (!existing) return

		const currentOrderedIds = viewOrderedIds(existing, alias)

		if (fromIndex < 0 || fromIndex >= currentOrderedIds.length) return
		if (toIndex < 0 || toIndex >= currentOrderedIds.length) return
		if (fromIndex === toIndex) return

		const newOrderedIds = [...currentOrderedIds]
		const movedItem = newOrderedIds.splice(fromIndex, 1)[0]
		if (movedItem === undefined) return
		newOrderedIds.splice(toIndex, 0, movedItem)

		const state = this.editableState(key, alias)
		state.views.get(alias)!.orderedIds = newOrderedIds
		this.commitEdit(key, state)
		this.editableWriteVersion++
	}

	/**
	 * Gets the ordered list of item IDs shown by one view.
	 */
	getHasManyOrderedIds(key: string, alias: string): string[] {
		const existing = this.hasManyStates.get(key)
		if (!existing) return []
		return viewOrderedIds(existing, alias)
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
	 * Collects the keys of every has-many list owned by an entity (keys under the
	 * given owner prefix). Mirrors {@link removeOwnedRelations} but only enumerates.
	 */
	collectOwnedKeys(keyPrefix: string, keys: string[]): void {
		for (const key of this.hasManyStates.keys()) {
			if (key.startsWith(keyPrefix)) keys.push(key)
		}
	}

	/**
	 * Removes a single has-many list state (and its live edges). Used by undo
	 * restore to drop a list that did not exist before the gesture.
	 */
	removeHasMany(key: string): void {
		this.deleteHasMany(key)
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
	 *
	 * `pendingItems` (by relation key) names planned additions/removals that were NOT
	 * sent — they stay planned instead of being folded into the server baseline.
	 *
	 * A confirmed removal leaves every view; a confirmed addition joins the views it
	 * renders in. Only the views that actually changed lose their manual ordering —
	 * an untouched sibling view keeps the order its user arranged.
	 */
	commitAllRelations(keyPrefix: string, pendingItems?: ReadonlyMap<string, ReadonlySet<string>>): void {
		for (const [key, existing] of this.hasManyStates) {
			if (!key.startsWith(keyPrefix)) continue

			const pending = pendingItems?.get(key)
			const state = cloneHasManyState(existing)
			const touched = new Set<string>()

			for (const removedId of existing.plannedRemovals.keys()) {
				if (pending?.has(removedId)) continue
				state.plannedRemovals.delete(removedId)
				for (const [alias, view] of state.views) {
					if (view.serverIds.delete(removedId)) touched.add(alias)
				}
			}
			for (const [addedId, addition] of existing.plannedAdditions) {
				if (pending?.has(addedId)) continue
				state.plannedAdditions.delete(addedId)
				for (const alias of additionFoldTargets(existing, addition)) {
					state.views.get(alias)!.serverIds.add(addedId)
					touched.add(alias)
				}
			}

			for (const alias of touched) state.views.get(alias)!.orderedIds = null

			state.version = existing.version + 1
			this.writeHasMany(key, state)
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
		for (const key of this.owners.get(parentKeyFromOwnerPrefix(keyPrefix))) {
			const state = this.hasManyStates.get(key)!
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
				result.set(key, cloneHasManyState(state))
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
			const imported = cloneHasManyState(state)
			imported.version = state.version + 1
			this.writeHasMany(key, imported)
			keys.push(key)
		}
		return keys
	}

	/**
	 * Replaces all occurrences of oldId with newId across has-many states
	 * (every view's serverIds/orderedIds, plannedAdditions, plannedRemovals).
	 */
	replaceEntityId(oldId: string, newId: string): void {
		for (const [key, existing] of this.hasManyStates) {
			let changed = false
			const state = cloneHasManyState(existing)

			for (const view of state.views.values()) {
				if (view.serverIds.delete(oldId)) {
					view.serverIds.add(newId)
					changed = true
				}
				if (view.orderedIds) {
					const idx = view.orderedIds.indexOf(oldId)
					if (idx !== -1) {
						view.orderedIds[idx] = newId
						changed = true
					}
				}
			}

			const addition = state.plannedAdditions.get(oldId)
			if (addition) {
				state.plannedAdditions.delete(oldId)
				// The id only changes when the item was persisted, so a still-planned
				// 'created' addition (the item went out on its own, not nested in this
				// parent) must now connect the server row rather than create a second one.
				state.plannedAdditions.set(newId, { kind: 'connected', origins: addition.origins })
				changed = true
			}

			const removalType = state.plannedRemovals.get(oldId)
			if (removalType !== undefined) {
				state.plannedRemovals.delete(oldId)
				state.plannedRemovals.set(newId, removalType)
				changed = true
			}

			if (changed) {
				state.version = existing.version + 1
				this.writeHasMany(key, state)
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
		this.owners.clear()
		this.edges.clear()
		this.plannedDeletes.clear()
		this.mutationVersion++
	}
}
