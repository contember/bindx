import { describe, test, expect, beforeEach } from 'bun:test'
import { SnapshotStore } from '@contember/bindx'
import { createTestStore, createMockSubscriber } from '../shared/unitTestHelpers.js'

/**
 * Pins the CURRENT parent re-render / subscription-notification behavior with
 * subscriber call-count assertions, BEFORE the notification machinery is rewired.
 *
 * A later PR replaces the append-only `childToParents` registry in
 * `SubscriptionManager` with a reverse index derived from relation edges. This
 * harness is the regression oracle: every assertion encodes today's behavior so
 * the rework can prove it introduced no re-render regression.
 *
 * Mechanics worth keeping in mind while reading these tests:
 * - `setRelation` / `addToHasMany` notify the relation's own subscribers and the
 *   relation OWNER's entity subscribers — they do NOT walk `childToParents`.
 * - `setFieldValue` on the child entity calls `notifyEntitySubscribers`, which
 *   walks `childToParents` UP the tree and bumps each ancestor's snapshot version.
 *   So the child-field mutation is what exercises parent propagation here.
 */
describe('Notification propagation', () => {
	let store: SnapshotStore

	beforeEach(() => {
		store = createTestStore()
	})

	test('has-one parent re-renders when child field changes', () => {
		// Server parent A with a child B connected via has-one.
		store.setEntityData('Author', 'author-1', { id: 'author-1', name: 'Alice' }, true)
		store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Draft' }, true)

		store.getOrCreateRelation('Author', 'author-1', 'featuredArticle', {
			currentId: null,
			serverId: null,
			state: 'disconnected',
			serverState: 'disconnected',
			placeholderData: {},
		})
		store.setRelation('Author', 'author-1', 'featuredArticle', {
			currentId: 'article-1',
			state: 'connected',
		})
		store.registerParentChild('Author', 'author-1', 'Article', 'article-1')

		const parent = createMockSubscriber()
		store.subscribeToEntity('Author', 'author-1', parent.fn)
		parent.reset()

		// Mutate the child.
		store.setFieldValue('Article', 'article-1', ['title'], 'Updated')

		// The parent's subscriber must fire via child→parent propagation.
		expect(parent.callCount()).toBe(1)
	})

	test('has-many parent re-renders when an item changes', () => {
		// Server parent A with a child item B in a has-many.
		store.setEntityData('Author', 'author-1', { id: 'author-1', name: 'Alice' }, true)
		store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Draft' }, true)

		store.getOrCreateHasMany('Author', 'author-1', 'articles', [])
		store.addToHasMany('Author', 'author-1', 'articles', 'article-1')
		store.registerParentChild('Author', 'author-1', 'Article', 'article-1')

		const parent = createMockSubscriber()
		store.subscribeToEntity('Author', 'author-1', parent.fn)
		parent.reset()

		// Mutate the child item.
		store.setFieldValue('Article', 'article-1', ['title'], 'Updated')

		expect(parent.callCount()).toBe(1)
	})

	test('disconnect still notifies the former parent (current append-only behavior)', () => {
		// Server parent A with a child B connected via has-one.
		store.setEntityData('Author', 'author-1', { id: 'author-1', name: 'Alice' }, true)
		store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Draft' }, true)

		store.getOrCreateRelation('Author', 'author-1', 'featuredArticle', {
			currentId: null,
			serverId: null,
			state: 'disconnected',
			serverState: 'disconnected',
			placeholderData: {},
		})
		store.setRelation('Author', 'author-1', 'featuredArticle', {
			currentId: 'article-1',
			state: 'connected',
		})
		store.registerParentChild('Author', 'author-1', 'Article', 'article-1')

		// "Disconnect" the child: clear the relation. Note that a relation disconnect
		// does NOT call unregisterParentChild, so the parent link survives.
		store.setRelation('Author', 'author-1', 'featuredArticle', {
			currentId: null,
			state: 'disconnected',
		})

		const parent = createMockSubscriber()
		store.subscribeToEntity('Author', 'author-1', parent.fn)
		parent.reset()

		// Mutate the now-disconnected child.
		store.setFieldValue('Article', 'article-1', ['title'], 'Updated')

		// LEAK: PR 7 will make a disconnected child stop notifying its former parent;
		// this assertion will flip then.
		expect(parent.callCount()).toBe(1)
	})

	test('diamond: a shared child notifies both parents', () => {
		// Child B connected to TWO parents A1 and A2.
		store.setEntityData('Author', 'author-1', { id: 'author-1', name: 'Alice' }, true)
		store.setEntityData('Author', 'author-2', { id: 'author-2', name: 'Bob' }, true)
		store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Draft' }, true)

		store.registerParentChild('Author', 'author-1', 'Article', 'article-1')
		store.registerParentChild('Author', 'author-2', 'Article', 'article-1')

		const parentOne = createMockSubscriber()
		const parentTwo = createMockSubscriber()
		store.subscribeToEntity('Author', 'author-1', parentOne.fn)
		store.subscribeToEntity('Author', 'author-2', parentTwo.fn)
		parentOne.reset()
		parentTwo.reset()

		// Mutate the shared child.
		store.setFieldValue('Article', 'article-1', ['title'], 'Updated')

		expect(parentOne.callCount()).toBe(1)
		expect(parentTwo.callCount()).toBe(1)
	})

	test('rekey preserves subscriptions', () => {
		// Subscribe to a created (temp-id) entity, rekey it, then mutate via the
		// persisted id and confirm the original subscription still fires.
		const tempId = store.createEntity('Article', { title: 'Draft' })

		const subscriber = createMockSubscriber()
		store.subscribeToEntity('Article', tempId, subscriber.fn)

		store.mapTempIdToPersistedId('Article', tempId, 'article-persisted')
		subscriber.reset()

		store.setFieldValue('Article', 'article-persisted', ['title'], 'Updated')

		expect(subscriber.callCount()).toBe(1)
	})
})
