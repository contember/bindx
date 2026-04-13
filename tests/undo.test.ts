import './setup'
import { describe, test, expect, beforeEach } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	UndoManager,
	setField,
	setEntityData,
} from '@contember/bindx'

describe('UndoManager', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let undoManager: UndoManager

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
		undoManager = new UndoManager(store, { debounceMs: 0 }) // No debounce for tests
		dispatcher.addMiddleware(undoManager.createMiddleware())
	})

	describe('Basic undo/redo', () => {
		test('should undo SET_FIELD action', () => {
			// Setup initial data
			store.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)

			// Make a change
			dispatcher.dispatch(setField('Article', '1', ['title'], 'Changed'))

			// Verify change
			expect(store.getEntitySnapshot('Article', '1')?.data).toEqual({
				id: '1',
				title: 'Changed',
			})
			expect(undoManager.getState().canUndo).toBe(true)

			// Undo
			undoManager.undo()

			// Verify undo
			expect(store.getEntitySnapshot('Article', '1')?.data).toEqual({
				id: '1',
				title: 'Original',
			})
			expect(undoManager.getState().canUndo).toBe(false)
			expect(undoManager.getState().canRedo).toBe(true)
		})

		test('should redo after undo', () => {
			store.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)

			dispatcher.dispatch(setField('Article', '1', ['title'], 'Changed'))
			undoManager.undo()

			expect(store.getEntitySnapshot<{title: string}>('Article', '1')?.data.title).toBe('Original')

			// Redo
			undoManager.redo()

			expect(store.getEntitySnapshot<{title: string}>('Article', '1')?.data.title).toBe('Changed')
			expect(undoManager.getState().canUndo).toBe(true)
			expect(undoManager.getState().canRedo).toBe(false)
		})

		test('should clear redo stack on new action', () => {
			store.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)

			dispatcher.dispatch(setField('Article', '1', ['title'], 'First Change'))
			undoManager.undo()

			expect(undoManager.getState().canRedo).toBe(true)

			// New action should clear redo stack
			dispatcher.dispatch(setField('Article', '1', ['title'], 'Second Change'))

			expect(undoManager.getState().canRedo).toBe(false)
			expect(store.getEntitySnapshot<{title: string}>('Article', '1')?.data.title).toBe('Second Change')
		})

		test('should handle multiple sequential changes', () => {
			store.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)

			dispatcher.dispatch(setField('Article', '1', ['title'], 'Change 1'))
			dispatcher.dispatch(setField('Article', '1', ['title'], 'Change 2'))
			dispatcher.dispatch(setField('Article', '1', ['title'], 'Change 3'))

			expect(undoManager.getState().undoCount).toBe(3)

			undoManager.undo()
			expect(store.getEntitySnapshot<{title: string}>('Article', '1')?.data.title).toBe('Change 2')

			undoManager.undo()
			expect(store.getEntitySnapshot<{title: string}>('Article', '1')?.data.title).toBe('Change 1')

			undoManager.undo()
			expect(store.getEntitySnapshot<{title: string}>('Article', '1')?.data.title).toBe('Original')

			expect(undoManager.getState().canUndo).toBe(false)
			expect(undoManager.getState().redoCount).toBe(3)
		})
	})

	describe('Skip non-trackable actions', () => {
		test('should skip SET_LOAD_STATE actions', () => {
			store.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)

			// SET_LOAD_STATE should not be tracked
			dispatcher.dispatch({
				type: 'SET_LOAD_STATE',
				entityType: 'Article',
				entityId: '1',
				status: 'loading',
			})

			expect(undoManager.getState().canUndo).toBe(false)
		})

		test('should skip SET_PERSISTING actions', () => {
			store.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)

			dispatcher.dispatch({
				type: 'SET_PERSISTING',
				entityType: 'Article',
				entityId: '1',
				isPersisting: true,
			})

			expect(undoManager.getState().canUndo).toBe(false)
		})

		test('should skip COMMIT_ENTITY actions', () => {
			store.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)

			dispatcher.dispatch({
				type: 'COMMIT_ENTITY',
				entityType: 'Article',
				entityId: '1',
			})

			expect(undoManager.getState().canUndo).toBe(false)
		})
	})

	describe('Manual grouping', () => {
		test('should group multiple actions as one undo entry', () => {
			store.setEntityData('Article', '1', { id: '1', title: 'Original', content: 'Content' }, true)

			const groupId = undoManager.beginGroup('Bulk update')
			dispatcher.dispatch(setField('Article', '1', ['title'], 'New Title'))
			dispatcher.dispatch(setField('Article', '1', ['content'], 'New Content'))
			undoManager.endGroup(groupId)

			expect(undoManager.getState().undoCount).toBe(1)

			// Undo should revert both changes
			undoManager.undo()

			expect(store.getEntitySnapshot('Article', '1')?.data).toEqual({
				id: '1',
				title: 'Original',
				content: 'Content',
			})
		})

		test('should handle nested groups correctly (only outer group matters)', () => {
			store.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)

			const groupId = undoManager.beginGroup()
			dispatcher.dispatch(setField('Article', '1', ['title'], 'Change 1'))
			// Inner beginGroup is ignored since we're already in a group
			dispatcher.dispatch(setField('Article', '1', ['title'], 'Change 2'))
			undoManager.endGroup(groupId)

			expect(undoManager.getState().undoCount).toBe(1)
		})
	})

	describe('Blocking', () => {
		test('should block undo when blocked', () => {
			store.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)
			dispatcher.dispatch(setField('Article', '1', ['title'], 'Changed'))

			undoManager.block()
			expect(undoManager.getState().isBlocked).toBe(true)

			// Undo should be ignored while blocked
			undoManager.undo()
			expect(store.getEntitySnapshot<{title: string}>('Article', '1')?.data.title).toBe('Changed')

			undoManager.unblock()
			expect(undoManager.getState().isBlocked).toBe(false)

			// Now undo should work
			undoManager.undo()
			expect(store.getEntitySnapshot<{title: string}>('Article', '1')?.data.title).toBe('Original')
		})

		test('should not track actions while blocked', () => {
			store.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)

			undoManager.block()
			dispatcher.dispatch(setField('Article', '1', ['title'], 'Changed'))
			undoManager.unblock()

			expect(undoManager.getState().canUndo).toBe(false)
		})
	})

	describe('History management', () => {
		test('should respect maxHistorySize', () => {
			const limitedUndoManager = new UndoManager(store, { maxHistorySize: 3, debounceMs: 0 })
			const limitedDispatcher = new ActionDispatcher(store)
			limitedDispatcher.addMiddleware(limitedUndoManager.createMiddleware())

			store.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)

			limitedDispatcher.dispatch(setField('Article', '1', ['title'], 'Change 1'))
			limitedDispatcher.dispatch(setField('Article', '1', ['title'], 'Change 2'))
			limitedDispatcher.dispatch(setField('Article', '1', ['title'], 'Change 3'))
			limitedDispatcher.dispatch(setField('Article', '1', ['title'], 'Change 4'))
			limitedDispatcher.dispatch(setField('Article', '1', ['title'], 'Change 5'))

			// Should only have 3 entries
			expect(limitedUndoManager.getState().undoCount).toBe(3)

			// Oldest entries should be trimmed
			limitedUndoManager.undo()
			limitedUndoManager.undo()
			limitedUndoManager.undo()

			// Should be at Change 2, not Original (Change 1 and Original were trimmed)
			expect(store.getEntitySnapshot<{title: string}>('Article', '1')?.data.title).toBe('Change 2')
		})

		test('should clear history', () => {
			store.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)

			dispatcher.dispatch(setField('Article', '1', ['title'], 'Change 1'))
			dispatcher.dispatch(setField('Article', '1', ['title'], 'Change 2'))

			expect(undoManager.getState().undoCount).toBe(2)

			undoManager.clear()

			expect(undoManager.getState().undoCount).toBe(0)
			expect(undoManager.getState().canUndo).toBe(false)
		})
	})

	describe('Relation actions', () => {
		test('should undo CONNECT_RELATION', () => {
			store.setEntityData('Article', '1', { id: '1', title: 'Article', author: null }, true)
			store.setEntityData('Author', 'a1', { id: 'a1', name: 'John' }, true)

			// Initialize relation state first (simulating initial load)
			store.setRelation('Article', '1', 'author', {
				currentId: null,
				state: 'disconnected',
			})

			// Connect relation
			dispatcher.dispatch({
				type: 'CONNECT_RELATION',
				entityType: 'Article',
				entityId: '1',
				fieldName: 'author',
				targetId: 'a1',
				targetType: 'Author',
			})

			const relationBefore = store.getRelation('Article', '1', 'author')
			expect(relationBefore?.currentId).toBe('a1')
			expect(relationBefore?.state).toBe('connected')

			// Undo
			undoManager.undo()

			const relationAfter = store.getRelation('Article', '1', 'author')
			// After undo, relation should be back to initial state (disconnected)
			expect(relationAfter?.currentId).toBeNull()
			expect(relationAfter?.state).toBe('disconnected')
		})

		test('should undo DISCONNECT_RELATION', () => {
			store.setEntityData('Article', '1', { id: '1', title: 'Article', author: { id: 'a1' } }, true)

			// Initialize relation state
			store.setRelation('Article', '1', 'author', {
				currentId: 'a1',
				state: 'connected',
			})

			// Disconnect
			dispatcher.dispatch({
				type: 'DISCONNECT_RELATION',
				entityType: 'Article',
				entityId: '1',
				fieldName: 'author',
			})

			expect(store.getRelation('Article', '1', 'author')?.state).toBe('disconnected')

			// Undo
			undoManager.undo()

			const relationAfter = store.getRelation('Article', '1', 'author')
			expect(relationAfter?.currentId).toBe('a1')
			expect(relationAfter?.state).toBe('connected')
		})
	})

	describe('Subscribers', () => {
		test('should notify subscribers on state change', () => {
			let notifyCount = 0
			const unsubscribe = undoManager.subscribe(() => {
				notifyCount++
			})

			store.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)
			dispatcher.dispatch(setField('Article', '1', ['title'], 'Changed'))

			expect(notifyCount).toBeGreaterThan(0)

			const countBefore = notifyCount
			undoManager.undo()
			expect(notifyCount).toBeGreaterThan(countBefore)

			unsubscribe()
		})
	})
})

describe('Debounced auto-grouping', () => {
	test('should group rapid changes within debounce window', async () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		const undoManager = new UndoManager(store, { debounceMs: 50 })
		dispatcher.addMiddleware(undoManager.createMiddleware())

		store.setEntityData('Article', '1', { id: '1', title: 'Original' }, true)

		// Rapid changes
		dispatcher.dispatch(setField('Article', '1', ['title'], 'A'))
		dispatcher.dispatch(setField('Article', '1', ['title'], 'AB'))
		dispatcher.dispatch(setField('Article', '1', ['title'], 'ABC'))

		// Wait for debounce
		await new Promise(resolve => setTimeout(resolve, 100))

		// All changes should be grouped as one
		expect(undoManager.getState().undoCount).toBe(1)

		// Undo should go back to original
		undoManager.undo()
		expect(store.getEntitySnapshot<{title: string}>('Article', '1')?.data.title).toBe('Original')
	})
})
