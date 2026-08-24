/**
 * connectExistingToHasMany after a planned removal cancels the removal, so the item
 * is back on the live-edge index and notifies its parent.
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import { SnapshotStore } from '@contember/bindx'
import { createTestStore, createMockSubscriber } from '../shared/unitTestHelpers.js'

describe('has-many: connectExistingToHasMany after a planned removal', () => {
	let store: SnapshotStore

	beforeEach(() => {
		store = createTestStore()
		store.setEntityData('Author', 'a1', { id: 'a1', name: 'Alice' }, true)
		store.setEntityData('Article', 'x', { id: 'x', title: 'X' }, true)
		store.getOrCreateHasMany('Author', 'a1', 'articles', ['x'])
		store.removeFromHasMany('Author', 'a1', 'articles', 'x', 'disconnect')
		store.connectExistingToHasMany('Author', 'a1', 'articles', 'x')
	})

	test('the re-connected item is back in the list', () => {
		expect(store.getHasManyOrderedIds('Author', 'a1', 'articles')).toEqual(['x'])
	})

	test('the planned removal is cancelled by the re-connect', () => {
		const state = store.getHasMany('Author', 'a1', 'articles')!
		expect([...state.plannedRemovals.keys()]).toEqual([])
	})

	test('a write to the re-connected item notifies the owning parent', () => {
		const parent = createMockSubscriber()
		store.subscribeToEntity('Author', 'a1', parent.fn)
		parent.reset()

		store.setFieldValue('Article', 'x', ['title'], 'X2')

		expect(parent.callCount()).toBe(1)
	})
})
