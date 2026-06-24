import './setup'
import { describe, test, expect, beforeEach } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	UndoManager,
	setField,
} from '@contember/bindx'

/**
 * CHARACTERIZATION TESTS — these pin the three known root-cause defects of the
 * current snapshot-restore undo. They are EXPECTED TO FAIL against today's code and
 * become the acceptance gates for the write-journal re-architecture
 * (plan: write-journal nad dekomponovaným storem).
 *
 * Each test documents: the defect, its root cause, and the phase that fixes it.
 */
describe('undo stabilization (characterization — currently failing)', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let undo: UndoManager

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
		undo = new UndoManager(store, { debounceMs: 0 }) // one entry per dispatch
		dispatcher.addMiddleware(undo.createMiddleware())
	})

	/**
	 * BUG #1 — incomplete capture of created entities in a list.
	 *
	 * Root cause: a list-add creates the child via store.createEntity() as part of the
	 * gesture, but getAffectedKeys(ADD_TO_LIST) only returns the parent has-many key, so
	 * the child entity snapshot is never captured. The add→undo→redo round-trip only
	 * survives by accident (the orphan lingers). Once the memory sweep reclaims the
	 * unreachable orphan, redo restores the list membership but the child data is gone.
	 *
	 * Fixed by: Phase 1–3 (journal captures the child's creation; redo re-creates it).
	 */
	test('bug #1: create-in-list survives undo → sweep → redo', () => {
		store.setEntityData('Article', '1', { id: '1', comments: [] }, true)
		store.setHasManyServerIds('Article', '1', 'comments', [])

		// ADD_TO_LIST with itemData (deterministic id) — the dispatcher creates the child
		// INSIDE the gesture, exactly the path a real add() drives.
		dispatcher.dispatch({
			type: 'ADD_TO_LIST',
			entityType: 'Article',
			entityId: '1',
			fieldName: 'comments',
			targetType: 'Comment',
			itemData: { id: 'c1', text: 'Hello' },
		})

		expect(store.getHasManyOrderedIds('Article', '1', 'comments')).toContain('c1')
		expect(store.getEntitySnapshot<{ text: string }>('Comment', 'c1')?.data.text).toBe('Hello')

		undo.undo()
		expect(store.getHasManyOrderedIds('Article', '1', 'comments')).not.toContain('c1')

		// Memory sweep (runs e.g. once a persist settles) reclaims the now-unreachable orphan.
		store.sweepUnreachableCreated()
		expect(store.getEntitySnapshot('Comment', 'c1')).toBeUndefined()

		undo.redo()
		// The list points at c1 again — but its data must come back too.
		expect(store.getHasManyOrderedIds('Article', '1', 'comments')).toContain('c1')
		expect(store.getEntitySnapshot<{ text: string }>('Comment', 'c1')?.data.text).toBe('Hello')
	})

	/**
	 * BUG #3 — undo does not survive a persist's temp→persisted rekey.
	 *
	 * Root cause: stored pre-images hold the temp key. After mapTempIdToPersistedId
	 * rekeys the live entity to its persisted key, undo's importPartialSnapshot writes
	 * the pre-image back under the STALE temp key (resurrecting a zombie) and leaves the
	 * live persisted entity untouched.
	 *
	 * Fixed by: Phase 4 (journal participates in RekeyOrchestrator; entries remap keys;
	 * undo restores only the editable layer onto the live server baseline → re-dirty).
	 */
	test('bug #3: undo after persist+rekey reverts the live persisted entity', () => {
		const tempId = store.createEntity('Article', { title: 'A' })

		dispatcher.dispatch(setField('Article', tempId, ['title'], 'B'))
		expect(store.getEntitySnapshot<{ title: string }>('Article', tempId)?.data.title).toBe('B')

		// Simulate a successful persist: commit, mark existing on server, rekey to 'p1'.
		store.commitEntity('Article', tempId)
		store.setExistsOnServer('Article', tempId, true)
		store.mapTempIdToPersistedId('Article', tempId, 'p1')

		undo.undo()

		const live = store.getEntitySnapshot<{ title: string }>('Article', 'p1')
		// Editable value reverts on the LIVE entity; server baseline stays at 'B' → dirty again.
		expect(live?.data.title).toBe('A')
		expect(live?.serverData.title).toBe('B')
		expect(store.getAllDirtyEntities()).toContainEqual({
			entityType: 'Article',
			entityId: 'p1',
			changeType: 'update',
		})
	})

	/**
	 * BUG #2 — root registration must travel with the undo unit.
	 *
	 * A top-level created entity's "is a pending create" status is anchored solely by
	 * its root membership. The journal captures root membership in the entity cell, so
	 * undo of a top-level create removes the entity AND its root (no phantom create),
	 * and redo restores it AND its root (create status comes back).
	 *
	 * Fixed by: Phase 3 (root membership captured/restored in the entity cell).
	 */
	test('bug #2: undo/redo of a top-level create round-trips its pending-create status', () => {
		// A top-level create (e.g. <Entity create>) is one undoable gesture.
		let id!: string
		store.transaction(() => {
			id = store.createEntity('Article', { title: 'Draft' })
		})
		expect(store.getAllDirtyEntities()).toContainEqual({
			entityType: 'Article',
			entityId: id,
			changeType: 'create',
		})
		expect(undo.getState().canUndo).toBe(true)

		undo.undo()
		// The create is fully reverted: gone from the store, no phantom create.
		expect(store.getEntitySnapshot('Article', id)).toBeUndefined()
		expect(store.getAllDirtyEntities()).toEqual([])

		undo.redo()
		// Re-created WITH its root, so it is reported as a pending create again.
		expect(store.getEntitySnapshot('Article', id)).toBeDefined()
		expect(store.getAllDirtyEntities()).toContainEqual({
			entityType: 'Article',
			entityId: id,
			changeType: 'create',
		})
	})

	/**
	 * The write-journal scales with EDIT size, not dataset size: editing one of many
	 * loaded entities captures and restores only that cell. Untouched snapshots keep
	 * their exact frozen reference across the edit+undo — proof the store was not
	 * wholesale-restored (the failure mode of a whole-store snapshot approach).
	 */
	test('scale: undo touches only the edited entity, not the loaded set', () => {
		for (let i = 0; i < 200; i++) {
			store.setEntityData('Row', `r${i}`, { id: `r${i}`, name: `n${i}` }, true)
		}
		const untouchedBefore = store.getEntitySnapshot('Row', 'r100')

		dispatcher.dispatch(setField('Row', 'r5', ['name'], 'edited'))
		expect(undo.getState().undoCount).toBe(1)

		undo.undo()
		expect(store.getEntitySnapshot<{ name: string }>('Row', 'r5')?.data.name).toBe('n5')
		// Untouched rows keep their exact snapshot reference.
		expect(store.getEntitySnapshot('Row', 'r100')).toBe(untouchedBefore)
	})

	/**
	 * The path a real HasManyListHandle.add() drives: pre-create OUTSIDE the
	 * dispatcher, wrapped in one store transaction. The whole gesture is one undo
	 * unit, so it survives undo → sweep → redo (the bug #1 shape via the handle path).
	 */
	test('handle gesture: pre-create in a transaction round-trips create-in-list', () => {
		store.setEntityData('Article', '1', { id: '1' }, true)
		store.setHasManyServerIds('Article', '1', 'comments', [])

		let childId!: string
		store.transaction(() => {
			childId = store.createEntity('Comment', { text: 'Hi' })
			store.addToHasMany('Article', '1', 'comments', childId)
			store.registerParentChild('Article', '1', 'Comment', childId)
		})
		expect(store.getHasManyOrderedIds('Article', '1', 'comments')).toContain(childId)

		undo.undo()
		expect(store.getHasManyOrderedIds('Article', '1', 'comments')).not.toContain(childId)

		store.sweepUnreachableCreated()
		expect(store.getEntitySnapshot('Comment', childId)).toBeUndefined()

		undo.redo()
		expect(store.getHasManyOrderedIds('Article', '1', 'comments')).toContain(childId)
		expect(store.getEntitySnapshot<{ text: string }>('Comment', childId)?.data.text).toBe('Hi')
	})
})
