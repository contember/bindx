import type { EntitySnapshot } from '../store/snapshots.js'
import type { StoredRelationState, StoredHasManyState } from '../store/RelationStore.js'
import type { RekeyContext } from '../store/RekeyOrchestrator.js'

/**
 * Write-journal for undo/redo.
 *
 * A gesture (one dispatch, or one handle operation) opens a transaction; every
 * primary-store write made inside it records the EDITABLE-LAYER pre-image of the
 * cell it touches (first-writer-wins per cell). On commit, the accumulated cells
 * become one {@link JournalEntry} — exactly the keys the gesture actually wrote,
 * each with the state to restore. Undo restores those pre-images through the
 * store's write paths (so the edge index and reachability cache rebuild
 * themselves); derived state is never journaled.
 *
 * The journal captures only the editable layer (and, for re-creates, the full
 * snapshot). The server baseline (serverData / serverId / serverState / serverIds
 * / existsOnServer) is spliced back from the LIVE state on restore, so undoing an
 * already-persisted edit re-dirties it against the current server view instead of
 * resurrecting a stale baseline.
 *
 * Entry-closure invariant: on commit each entry is closed over the created,
 * currently-unreachable subgraph its relation/has-many pre-images detach, so undo
 * works no matter what memory sweep reclaims that subgraph in between (see
 * {@link JournalTarget.exportUnreachableCreatedSubgraph}).
 */

/** A captured cell, keyed by kind + composite store key. */
export interface EntityCellImage {
	readonly kind: 'entity'
	readonly key: string
	/** Whether the entity existed at capture time. false ⇒ undo removes it (un-create). */
	readonly present: boolean
	readonly snapshot?: EntitySnapshot
	readonly existsOnServer?: boolean
	readonly isScheduledForDeletion?: boolean
	readonly isRoot?: boolean
}

export interface RelationCellImage {
	readonly kind: 'relation'
	readonly key: string
	readonly present: boolean
	readonly state?: StoredRelationState
}

export interface HasManyCellImage {
	readonly kind: 'hasMany'
	readonly key: string
	readonly present: boolean
	readonly state?: StoredHasManyState
}

export type JournalCellImage = EntityCellImage | RelationCellImage | HasManyCellImage

/** One undoable unit: the editable-layer pre-images of every cell a gesture touched. */
export interface JournalEntry {
	readonly cells: JournalCellImage[]
}

/**
 * The store side of the journal: produces editable-layer pre-images for a cell and
 * applies a set of pre-images back (through the write paths). Implemented by
 * SnapshotStore, which alone knows the sub-stores.
 */
export interface JournalTarget {
	exportEntityCell(key: string): EntityCellImage
	exportRelationCell(key: string): RelationCellImage
	exportHasManyCell(key: string): HasManyCellImage
	/**
	 * Images of every created, currently-unreachable entity (and its owned relation
	 * cells) reachable from the seed ids — the subgraph a memory sweep may reclaim
	 * before an undo needs it. Backs the journal's entry-closure invariant.
	 */
	exportUnreachableCreatedSubgraph(seedIds: ReadonlySet<string>): JournalCellImage[]
	applyJournalImages(images: JournalCellImage[]): void
}

function cellRefKey(image: JournalCellImage): string {
	return `${image.kind}:${image.key}`
}

/**
 * Ids referenced by an entry's relation/has-many PRE-images — the roots of any
 * created subgraph the gesture may have detached (has-one currentId; has-many
 * members / planned add/remove). The unreachable-created gate filters the rest.
 */
function collectDetachedSeedIds(active: Map<string, JournalCellImage>): Set<string> {
	const ids = new Set<string>()
	for (const image of active.values()) {
		if (image.kind === 'relation') {
			if (image.state?.currentId) ids.add(image.state.currentId)
		} else if (image.kind === 'hasMany' && image.state) {
			if (image.state.orderedIds) for (const id of image.state.orderedIds) ids.add(id)
			for (const id of image.state.plannedAdditions.keys()) ids.add(id)
			for (const id of image.state.plannedRemovals.keys()) ids.add(id)
		}
	}
	return ids
}

export class UndoJournal {
	private depth = 0
	/** Cells recorded in the currently-open transaction, deduped first-writer-wins. */
	private active: Map<string, JournalCellImage> | null = null

	constructor(
		private readonly target: JournalTarget,
		private readonly onCommit: (entry: JournalEntry) => void,
		private readonly onRekey?: (ctx: RekeyContext) => void,
		private readonly onClear?: () => void,
	) {}

	get isRecording(): boolean {
		return this.active !== null
	}

	begin(): void {
		if (this.depth === 0) {
			this.active = new Map()
		}
		this.depth++
	}

	commit(): void {
		if (this.depth === 0) return
		this.depth--
		if (this.depth > 0) return
		const active = this.active
		this.active = null
		if (active && active.size > 0) {
			this.closeOverUnreachableCreated(active)
			this.onCommit({ cells: [...active.values()] })
		}
	}

	/**
	 * Folds the detached created subgraph into the entry (first-writer-wins) so undo
	 * survives a later sweep of that subgraph. Runs before onCommit so the manager's
	 * debounce/group merge already sees the enriched cells.
	 */
	private closeOverUnreachableCreated(active: Map<string, JournalCellImage>): void {
		const seedIds = collectDetachedSeedIds(active)
		if (seedIds.size === 0) return
		for (const image of this.target.exportUnreachableCreatedSubgraph(seedIds)) {
			const refKey = cellRefKey(image)
			if (!active.has(refKey)) active.set(refKey, image)
		}
	}

	/** Records the pre-image of an entity cell (snapshot + meta + root membership). */
	recordEntity(key: string): void {
		this.record(`entity:${key}`, () => this.target.exportEntityCell(key))
	}

	recordRelation(key: string): void {
		this.record(`relation:${key}`, () => this.target.exportRelationCell(key))
	}

	recordHasMany(key: string): void {
		this.record(`hasMany:${key}`, () => this.target.exportHasManyCell(key))
	}

	private record(refKey: string, make: () => JournalCellImage): void {
		if (!this.active) return // no transaction open ⇒ not part of any gesture
		if (this.active.has(refKey)) return // first-writer-wins: keep the pre-gesture state
		this.active.set(refKey, make())
	}

	/** Captures the CURRENT image of each given cell — used to build the inverse entry. */
	captureCurrent(cells: JournalCellImage[]): JournalCellImage[] {
		return cells.map(cell => {
			switch (cell.kind) {
				case 'entity':
					return this.target.exportEntityCell(cell.key)
				case 'relation':
					return this.target.exportRelationCell(cell.key)
				case 'hasMany':
					return this.target.exportHasManyCell(cell.key)
			}
		})
	}

	apply(cells: JournalCellImage[]): void {
		this.target.applyJournalImages(cells)
	}

	/** Forwarded from the store when a temp id is rekeyed; lets the owner rewrite stacks. */
	rekey(ctx: RekeyContext): void {
		this.onRekey?.(ctx)
	}

	/** Forwarded from the store on a full clear; drops all owner history and any open gesture. */
	clear(): void {
		// A full store clear wipes the world these pre-images describe. Drop the open
		// gesture's cells but keep `active` non-null so begin/commit depth stays paired.
		if (this.active !== null) this.active = new Map()
		this.onClear?.()
	}
}

export { cellRefKey }
