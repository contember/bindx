/**
 * Rekeying onto a key that already has subscribers must merge them, not replace them.
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import { SnapshotStore } from '@contember/bindx'
import { createTestStore, createMockSubscriber } from '../shared/unitTestHelpers.js'

describe('rekey onto an already-subscribed key', () => {
	let store: SnapshotStore

	beforeEach(() => {
		store = createTestStore()
	})

	test('a subscriber already registered under the persisted key survives the rekey', () => {
		store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Server' }, true)

		const existing = createMockSubscriber()
		store.subscribeToEntity('Article', 'article-1', existing.fn)

		const tempId = store.createEntity('Article', { title: 'Draft' })
		const draft = createMockSubscriber()
		store.subscribeToEntity('Article', tempId, draft.fn)

		store.mapTempIdToPersistedId('Article', tempId, 'article-1')
		existing.reset()
		draft.reset()

		store.setFieldValue('Article', 'article-1', ['title'], 'Updated')

		expect(draft.callCount()).toBe(1)
		expect(existing.callCount()).toBe(1)
	})

	test('a relation subscriber already registered under the persisted key survives the rekey', () => {
		store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Server' }, true)
		store.getOrCreateHasMany('Article', 'article-1', 'tags', [])

		const existing = createMockSubscriber()
		store.subscribeToRelation('Article', 'article-1', 'tags', existing.fn)

		const tempId = store.createEntity('Article', { title: 'Draft' })
		store.getOrCreateHasMany('Article', tempId, 'tags', [])
		const draft = createMockSubscriber()
		store.subscribeToRelation('Article', tempId, 'tags', draft.fn)

		store.mapTempIdToPersistedId('Article', tempId, 'article-1')
		existing.reset()
		draft.reset()

		store.addToHasMany('Article', 'article-1', 'tags', 'tag-1')

		expect(draft.callCount()).toBe(1)
		expect(existing.callCount()).toBe(1)
	})
})
