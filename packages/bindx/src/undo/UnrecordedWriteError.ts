import type { JournalCellKind } from './UndoJournal.js'

/**
 * Thrown when a journal transaction closes after an editable-layer store write
 * that was NOT preceded by a matching `journal.record*` call — i.e. a mutating
 * SnapshotStore method wrote primary state a gesture can no longer undo.
 *
 * This turns the "every mutating method must record before writing" convention
 * into a checked invariant: the sub-store editable-write counters advanced for a
 * kind the transaction never recorded. The named kinds pinpoint which record call
 * is missing (recordEntity / recordRelation / recordHasMany).
 */
export class UnrecordedWriteError extends Error {
	constructor(public readonly kinds: ReadonlyArray<JournalCellKind>) {
		super(
			`Undo journal invariant violated: editable-layer ${kinds.join(', ')} write(s) happened ` +
			`inside a journal transaction without a preceding record call. Every mutating SnapshotStore ` +
			`method must call journal.recordEntity/recordRelation/recordHasMany before writing so the ` +
			`gesture can be undone. Unrecorded kind(s): ${kinds.join(', ')}.`,
		)
		this.name = 'UnrecordedWriteError'
	}
}
