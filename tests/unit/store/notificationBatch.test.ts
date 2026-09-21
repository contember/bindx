import { describe, expect, spyOn, test, type Mock } from 'bun:test'
import { ActionDispatcher, SnapshotStore, UndoManager } from '@contember/bindx'
import {
	SubscriptionManager,
	type ParentKeyLookup,
	type SynchronousResult,
} from '../../../packages/bindx/src/store/SubscriptionManager.js'

class FakeParentLookup implements ParentKeyLookup {
	calls = 0
	version = 0

	constructor(private readonly parents: Map<string, readonly string[]>) {}

	getParentKeysForChild(childId: string): Set<string> {
		this.calls++
		return new Set(this.parents.get(childId) ?? [])
	}

	getMutationVersion(): number {
		return this.version
	}
}

type AssertEqual<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false

function assertType<T extends true>(): void {
	// compile-time only
}

function loggedMessages(logged: Mock<typeof console.error>): string[] {
	return logged.mock.calls.map(([, error]) => error instanceof Error ? error.message : String(error))
}

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
		manager.setParentKeyLookup(new FakeParentLookup(new Map([['child', ['Article:parent']]])))
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

	test('a throwing subscriber does not drop the rest of the batch', () => {
		const store = new SnapshotStore()
		store.setEntityData('Article', 'a', { title: 'A' }, true)
		store.setEntityData('Article', 'b', { title: 'B' }, true)
		let otherCalls = 0
		let globalCalls = 0
		store.subscribeToEntity('Article', 'a', () => { throw new Error('Subscriber a failed') })
		store.subscribeToEntity('Article', 'b', () => { otherCalls++ })
		store.subscribe(() => { globalCalls++ })
		expect(() => store.batchNotifications(() => {
			store.refreshServerData('Article', 'a', { title: 'A2' })
			store.refreshServerData('Article', 'b', { title: 'B2' })
		})).toThrow('Subscriber a failed')
		expect(otherCalls).toBe(1)
		expect(globalCalls).toBe(1)
	})

	test('rethrows the first subscriber error and logs the rest', () => {
		const manager = new SubscriptionManager()
		const logged = spyOn(console, 'error').mockImplementation(() => {})
		try {
			manager.subscribeToEntity('Article:a', () => { throw new Error('First') })
			manager.subscribe(() => { throw new Error('Second') })
			expect(() => manager.batchNotifications(() => {
				manager.notifyEntityDirect('Article:a')
				manager.notify()
			})).toThrow('First')
			expect(loggedMessages(logged)).toEqual(['Second'])
		} finally {
			logged.mockRestore()
		}
	})

	test('a failing callback keeps its own error and logs subscriber errors', () => {
		const manager = new SubscriptionManager()
		const logged = spyOn(console, 'error').mockImplementation(() => {})
		try {
			manager.subscribe(() => { throw new Error('Subscriber failed') })
			expect(() => manager.batchNotifications(() => {
				manager.notify()
				throw new Error('Write failed')
			})).toThrow('Write failed')
			expect(loggedMessages(logged)).toEqual(['Subscriber failed'])
		} finally {
			logged.mockRestore()
		}
	})

	test('after clear(), a batched write reaches a reused id like an immediate write does', () => {
		const store = new SnapshotStore()
		const tempId = store.createEntity('Article', { title: 'Draft' })
		store.mapTempIdToPersistedId('Article', tempId, 'persisted')
		store.clear()
		store.createEntity('Article', { id: tempId, title: 'Again' })
		let calls = 0
		store.subscribeToEntity('Article', tempId, () => { calls++ })
		store.setFieldValue('Article', tempId, ['title'], 'Immediate')
		store.batchNotifications(() => store.setFieldValue('Article', tempId, ['title'], 'Batched'))
		expect(calls).toBe(2)
	})

	test('rows under a shared ancestor walk it once per batch', () => {
		const rows = Array.from({ length: 50 }, (_, i) => `r${i}`)
		const parents = new Map<string, readonly string[]>([['hub', rows.map(id => `Article:${id}`)]])
		for (const id of rows) parents.set(id, ['Category:hub'])
		const lookup = new FakeParentLookup(parents)
		const manager = new SubscriptionManager()
		manager.setParentKeyLookup(lookup)
		let bumps = 0
		let hubCalls = 0
		manager.subscribeToEntity('Category:hub', () => { hubCalls++ })
		manager.batchNotifications(() => {
			for (const id of rows) manager.notifyEntitySubscribers(`Article:${id}`, { bumpEntitySnapshotVersion: () => { bumps++ } })
		})
		expect(lookup.calls).toBe(rows.length + 1)
		expect(bumps).toBe(rows.length)
		expect(hubCalls).toBe(1)
	})

	test('a relation write inside a batch re-walks ancestors through the new edge', () => {
		const parents = new Map<string, readonly string[]>([['child', ['Article:a']]])
		const lookup = new FakeParentLookup(parents)
		const manager = new SubscriptionManager()
		manager.setParentKeyLookup(lookup)
		const bumped: string[] = []
		const bumper = { bumpEntitySnapshotVersion: (key: string): void => { bumped.push(key) } }
		let newParentCalls = 0
		manager.subscribeToEntity('Article:b', () => { newParentCalls++ })
		manager.batchNotifications(() => {
			manager.notifyEntitySubscribers('Item:child', bumper)
			parents.set('child', ['Article:a', 'Article:b'])
			lookup.version++
			manager.notifyEntitySubscribers('Item:child', bumper)
		})
		expect(bumped).toContain('Article:b')
		expect(newParentCalls).toBe(1)
	})

	test('undoing several creates notifies once, after the restore is complete', () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		const undo = new UndoManager(store, { debounceMs: 0 })
		dispatcher.addMiddleware(undo.createMiddleware())
		const ids = ['c0', 'c1', 'c2', 'c3']
		store.transaction(() => {
			for (const id of ids) store.createEntity('Article', { id, title: id })
		})
		const remaining: number[] = []
		store.subscribe(() => remaining.push(ids.filter(id => store.hasEntity('Article', id)).length))
		undo.undo()
		expect(remaining).toEqual([0])
	})

	test('async callbacks are rejected at compile time', () => {
		assertType<AssertEqual<SynchronousResult<Promise<void>>, never>>()
		assertType<AssertEqual<SynchronousResult<number>, number>>()
	})
})
