import type { RekeyContext } from '../store/RekeyOrchestrator.js'
import { createEntitySnapshot } from '../store/snapshots.js'
import type { EntitySnapshot } from '../store/snapshots.js'
import type { StoredHasManyState } from '../store/RelationStore.js'
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
 * Looks up the live server-member ids of a has-many list by its key. Lets the
 * rekey rebase a pre-image when the just-persisted create has become a permanent
 * member of that list.
 */
export type LiveServerIdsLookup = (relationKey: string) => Set<string>

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
	let state = rekeyHasManyState(cell.state, ctx)
	// Membership rebase: when the just-persisted create became a permanent member of
	// this live list, fold it into the (older) pre-image so undo keeps it instead of
	// dropping it. Default order picks it up automatically; an explicit order needs
	// the id appended.
	if (liveServerIds(key).has(ctx.newId) && !state.serverIds.has(ctx.newId)) {
		const serverIds = new Set(state.serverIds)
		serverIds.add(ctx.newId)
		let orderedIds = state.orderedIds
		if (orderedIds && !orderedIds.includes(ctx.newId)) {
			orderedIds = [...orderedIds, ctx.newId]
		}
		state = { ...state, serverIds, orderedIds }
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

function swapInSet(set: Set<string>, oldId: string, newId: string): Set<string> {
	if (!set.has(oldId)) return set
	const next = new Set(set)
	next.delete(oldId)
	next.add(newId)
	return next
}

function rekeyHasManyState(state: StoredHasManyState, ctx: RekeyContext): StoredHasManyState {
	const serverIds = swapInSet(state.serverIds, ctx.oldId, ctx.newId)

	let orderedIds = state.orderedIds
	if (orderedIds) {
		const idx = orderedIds.indexOf(ctx.oldId)
		if (idx !== -1) {
			orderedIds = [...orderedIds]
			orderedIds[idx] = ctx.newId
		}
	}

	let plannedAdditions = state.plannedAdditions
	const additionKind = plannedAdditions.get(ctx.oldId)
	if (additionKind !== undefined) {
		plannedAdditions = new Map(plannedAdditions)
		plannedAdditions.delete(ctx.oldId)
		plannedAdditions.set(ctx.newId, additionKind)
	}

	let plannedRemovals = state.plannedRemovals
	const removalType = plannedRemovals.get(ctx.oldId)
	if (removalType !== undefined) {
		plannedRemovals = new Map(plannedRemovals)
		plannedRemovals.delete(ctx.oldId)
		plannedRemovals.set(ctx.newId, removalType)
	}

	return { serverIds, orderedIds, plannedRemovals, plannedAdditions, version: state.version }
}
