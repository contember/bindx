import { describe, expect, test } from 'bun:test'
import { SnapshotStore } from '@contember/bindx'
import { SubscriptionManager } from '../../../packages/bindx/src/store/SubscriptionManager.js'

describe('notification batches', () => {
	test('nested refreshes expose final data and preserve local edits', () => {
		const store = new SnapshotStore()
		store.setEntityData('Article', 'a', { title: 'Original', count: 0 }, true)
		store.setFieldValue('Article', 'a', ['title'], 'Local')
		let calls = 0
		store.subscribe(() => {
			calls++
			expect(store.getEntitySnapshot('Article', 'b')).toBeDefined()
			expect(store.getEntitySnapshot('Article', 'a')?.data).toMatchObject({ title: 'Local', count: 2 })
		})
		store.batchNotifications(() => {
			store.refreshServerData('Article', 'a', { title: 'Server', count: 1 })
			store.batchNotifications(() => {
				store.refreshServerData('Article', 'a', { title: 'Server', count: 2 })
			})
			expect(calls).toBe(0)
			store.refreshServerData('Article', 'b', { title: 'Other' })
			store.notify()
		})
		expect(calls).toBe(1)
	})

	test('deduplicates entity, relation, ancestor and global callbacks with current versions', () => {
		const manager = new SubscriptionManager()
		const bumped: string[] = []
		const bumper = { bumpEntitySnapshotVersion: (key: string): void => { bumped.push(key) } }
		manager.setParentKeyLookup({ getParentKeysForChild: id => new Set(id === 'child' ? ['Article:parent'] : []) })
		let calls = 0
		const subscriber = (): void => {
			calls++
			expect(manager.getVersion()).toBe(3)
			expect(bumped).toContain('Article:parent')
		}
		manager.subscribeToEntity('Article:child', subscriber)
		manager.subscribeToEntity('Article:parent', subscriber)
		manager.subscribeToRelation('Article:child:tags', subscriber)
		manager.subscribe(subscriber)
		manager.batchNotifications(() => {
			manager.notifyEntitySubscribers('Article:child', bumper)
			manager.notifyRelationSubscribers('Article:child:tags', 'Article:child', bumper)
			manager.notify()
			expect(calls).toBe(0)
		})
		expect(calls).toBe(1)
	})

	test('honors unsubscribe before and during delivery', () => {
		const manager = new SubscriptionManager()
		let calls = 0
		let unsubscribe = (): void => {}
		manager.subscribe(() => unsubscribe())
		unsubscribe = manager.subscribe(() => { calls++ })
		const unsubscribeEntity = manager.subscribeToEntity('Article:a', () => { calls++ })
		manager.batchNotifications(() => {
			manager.notifyEntityDirect('Article:a')
			manager.notify()
			unsubscribeEntity()
		})
		expect(calls).toBe(0)
	})

	test('flushes completed writes on failure and restores immediate notifications', () => {
		const manager = new SubscriptionManager()
		let calls = 0
		manager.subscribe(() => { calls++ })
		expect(() => manager.batchNotifications(() => {
			manager.notify()
			throw new Error('Failed write')
		})).toThrow('Failed write')
		expect(calls).toBe(1)
		manager.notify()
		expect(calls).toBe(2)
	})

	test('queued notifications follow persisted identities and unsubscribe redirects', () => {
		const store = new SnapshotStore()
		const tempId = store.createEntity('Article', { title: 'Draft' })
		let calls = 0
		let removedCalls = 0
		store.subscribeToEntity('Article', tempId, () => { calls++ })
		const unsubscribe = store.subscribeToEntity('Article', tempId, () => { removedCalls++ })
		store.batchNotifications(() => {
			store.setFieldValue('Article', tempId, ['title'], 'Edited')
			store.mapTempIdToPersistedId('Article', tempId, 'persisted')
			unsubscribe()
		})
		expect(calls).toBe(1)
		expect(removedCalls).toBe(0)
	})

	test('clear notifies all subscription scopes after the batch', () => {
		const store = new SnapshotStore()
		store.setEntityData('Article', 'a', { title: 'Original' }, true)
		let calls = 0
		const subscriber = (): void => {
			calls++
			expect(store.hasEntity('Article', 'a')).toBe(false)
		}
		store.subscribeToEntity('Article', 'a', subscriber)
		store.subscribe(subscriber)
		store.batchNotifications(() => {
			store.setFieldValue('Article', 'a', ['title'], 'Edited')
			store.clear()
			expect(calls).toBe(0)
		})
		expect(calls).toBe(1)
	})

	test('delivers reentrant writes rather than losing them in the completed batch', () => {
		const manager = new SubscriptionManager()
		let calls = 0
		manager.subscribe(() => {
			if (++calls === 1) manager.batchNotifications(() => manager.notify())
		})
		manager.batchNotifications(() => manager.notify())
		expect(calls).toBe(2)
	})
})
