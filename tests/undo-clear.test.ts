import './setup'
import { describe, test, expect, beforeEach } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	UndoManager,
	setField,
} from '@contember/bindx'

// A full store.clear() (logout / provider teardown / schema switch) wipes every
// entity; the undo/redo history must be dropped with it, otherwise undo would
// resurrect a stale, wiped world into an empty store.
describe('store.clear() wipes undo history', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let undoManager: UndoManager

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
		undoManager = new UndoManager(store, { debounceMs: 0 }) // No debounce for tests
		dispatcher.addMiddleware(undoManager.createMiddleware())
	})

	test('drops the undo stack and makes undo a no-op', () => {
		store.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)
		dispatcher.dispatch(setField('Article', '1', ['title'], 'Changed'))
		expect(undoManager.getState().canUndo).toBe(true)

		store.clear()

		expect(undoManager.getState().canUndo).toBe(false)
		expect(undoManager.getState().canRedo).toBe(false)

		// Undo must not resurrect the wiped entity.
		undoManager.undo()
		expect(store.hasEntity('Article', '1')).toBe(false)
		expect(store.getEntitySnapshot('Article', '1')).toBeUndefined()
	})

	test('drops the redo stack too', () => {
		store.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)
		dispatcher.dispatch(setField('Article', '1', ['title'], 'Changed'))
		undoManager.undo()
		expect(undoManager.getState().canRedo).toBe(true)

		store.clear()

		expect(undoManager.getState().canRedo).toBe(false)
		undoManager.redo()
		expect(store.hasEntity('Article', '1')).toBe(false)
	})

	test('drops a pending debounced group', () => {
		const localStore = new SnapshotStore()
		const localDispatcher = new ActionDispatcher(localStore)
		const localUndo = new UndoManager(localStore, { debounceMs: 50 })
		localDispatcher.addMiddleware(localUndo.createMiddleware())

		localStore.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)
		// Change lands in the pending group; do NOT flush (no timer wait).
		localDispatcher.dispatch(setField('Article', '1', ['title'], 'Changed'))
		expect(localUndo.getState().canUndo).toBe(true)

		localStore.clear()

		expect(localUndo.getState().canUndo).toBe(false)
		localUndo.undo()
		expect(localStore.hasEntity('Article', '1')).toBe(false)
	})

	test('clear mid-gesture drops recorded cells and keeps begin/commit pairing intact', () => {
		store.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)

		// Fire clear() while a journal transaction is open: the recorded pre-images
		// describe the wiped world and must be dropped, without corrupting depth.
		store.transaction(() => {
			store.setFieldValue('Article', '1', ['title'], 'MidGesture')
			store.clear()
		})

		expect(undoManager.getState().canUndo).toBe(false)

		// A fresh gesture after the mid-gesture clear must still record normally.
		store.setEntityData('Article', '2', { id: '2', title: 'Fresh' }, true)
		dispatcher.dispatch(setField('Article', '2', ['title'], 'FreshChanged'))
		expect(undoManager.getState().canUndo).toBe(true)
		undoManager.undo()
		expect(store.getEntitySnapshot<{ title: string }>('Article', '2')?.data.title).toBe('Fresh')
	})
})
