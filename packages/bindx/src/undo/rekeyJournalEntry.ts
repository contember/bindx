import type { RekeyContext } from '../store/RekeyOrchestrator.js'
import { createEntitySnapshot } from '../store/snapshots.js'
import type { EntitySnapshot } from '../store/snapshots.js'
import { cloneHasManyState, type StoredHasManyState } from '../store/hasManyState.js'
import type { JournalEntry, JournalCellImage } from './UndoJournal.js'

/**
 * Rewrites a journal entry for a temp→persisted rekey so stored cells stay valid
 * after persist:
 *   - owner keys move from the temp prefix to the persisted prefix;
 *   - embedded id references (snapshot ids, relation currentId/serverId, has-many
 *     members) are remapped oldId→newId;
 *   - the create is SEALED: an "absent" pre-image of the now-persisted entity (or
 *     its owned relations) is dropped, so undo can no longer delete the
 *     server-backed row — only later edits to it remain undoable.
 */
/**
 * Looks up the live server-member ids of a has-many relation by its key, per
 * args-view. Lets the rekey rebase a pre-image when the just-persisted create has
 * become a permanent member of that list.
 */
export type LiveServerIdsLookup = (relationKey: string) => ReadonlyMap<string, Set<string>>

export function rekeyJournalEntry(
	entry: JournalEntry,
	ctx: RekeyContext,
	liveServerIds: LiveServerIdsLookup,
): JournalEntry {
	const cells: JournalCellImage[] = []
	for (const cell of entry.cells) {
		const rewritten = rekeyCell(cell, ctx, liveServerIds)
		if (rewritten) cells.push(rewritten)
	}
	return { cells }
}

function rekeyKey(key: string, ctx: RekeyContext): string {
	if (key === ctx.oldKey) return ctx.newKey
	if (key.startsWith(ctx.oldKeyPrefix)) return ctx.newKeyPrefix + key.slice(ctx.oldKeyPrefix.length)
	return key
}

function isOwnedByRekeyed(key: string, ctx: RekeyContext): boolean {
	return key === ctx.oldKey || key.startsWith(ctx.oldKeyPrefix)
}

function rekeyCell(
	cell: JournalCellImage,
	ctx: RekeyContext,
	liveServerIds: LiveServerIdsLookup,
): JournalCellImage | null {
	// Seal: an absent pre-image of the rekeyed entity (or a relation it owns) would
	// un-create a now server-backed row on undo. Drop it.
	if (!cell.present && isOwnedByRekeyed(cell.key, ctx)) {
		return null
	}

	if (cell.kind === 'entity') {
		const key = rekeyKey(cell.key, ctx)
		if (!cell.snapshot) return { ...cell, key }
		return { ...cell, key, snapshot: rekeySnapshotId(cell.snapshot, ctx) }
	}

	if (cell.kind === 'relation') {
		const key = rekeyKey(cell.key, ctx)
		if (!cell.state) return { ...cell, key }
		return {
			...cell,
			key,
			state: {
				...cell.state,
				currentId: cell.state.currentId === ctx.oldId ? ctx.newId : cell.state.currentId,
				serverId: cell.state.serverId === ctx.oldId ? ctx.newId : cell.state.serverId,
			},
		}
	}

	const key = rekeyKey(cell.key, ctx)
	if (!cell.state) return { ...cell, key }
	const state = rekeyHasManyState(cell.state, ctx)
	// Membership rebase: when the just-persisted create became a permanent member of
	// a live view, fold it into the (older) pre-image of that view so undo keeps it
	// instead of dropping it. Default order picks it up automatically; an explicit
	// order needs the id appended. Views born after the gesture are left alone —
	// the pre-image says nothing about them.
	const live = liveServerIds(key)
	for (const [alias, view] of state.views) {
		if (!live.get(alias)?.has(ctx.newId) || view.serverIds.has(ctx.newId)) continue
		view.serverIds.add(ctx.newId)
		if (view.orderedIds && !view.orderedIds.includes(ctx.newId)) {
			view.orderedIds = [...view.orderedIds, ctx.newId]
		}
	}
	return { ...cell, key, state }
}

function rekeySnapshotId(snapshot: EntitySnapshot, ctx: RekeyContext): EntitySnapshot {
	if (snapshot.id !== ctx.oldId) return snapshot
	return createEntitySnapshot(
		ctx.newId,
		snapshot.entityType,
		{ ...(snapshot.data as Record<string, unknown>), id: ctx.newId },
		{ ...(snapshot.serverData as Record<string, unknown>), id: ctx.newId },
		snapshot.version,
	)
}

/** Returns a deep copy with oldId swapped for newId everywhere it appears. */
function rekeyHasManyState(state: StoredHasManyState, ctx: RekeyContext): StoredHasManyState {
	const next = cloneHasManyState(state)

	for (const view of next.views.values()) {
		if (view.serverIds.delete(ctx.oldId)) view.serverIds.add(ctx.newId)
		if (view.orderedIds) {
			const idx = view.orderedIds.indexOf(ctx.oldId)
			if (idx !== -1) view.orderedIds[idx] = ctx.newId
		}
	}

	const addition = next.plannedAdditions.get(ctx.oldId)
	if (addition) {
		next.plannedAdditions.delete(ctx.oldId)
		next.plannedAdditions.set(ctx.newId, addition)
	}

	const removalType = next.plannedRemovals.get(ctx.oldId)
	if (removalType !== undefined) {
		next.plannedRemovals.delete(ctx.oldId)
		next.plannedRemovals.set(ctx.newId, removalType)
	}

	return next
}
