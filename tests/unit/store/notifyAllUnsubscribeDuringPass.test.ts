/**
 * notifyAll() (the store.clear() path) must honour an unsubscribe made by another
 * subscriber during the same pass, as the per-key paths do.
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import { SnapshotStore } from '@contember/bindx'
import { createTestStore } from '../shared/unitTestHelpers.js'

describe('notifyAll() and unsubscribe during notification', () => {
	let store: SnapshotStore

	beforeEach(() => {
		store = createTestStore()
	})

	test('an entity subscriber unsubscribed mid-pass is not invoked', () => {
		store.setEntityData('Article', 'a1', { id: 'a1', title: 'T' }, true)

		let siblingCalls = 0
		let unsubscribeSibling: (() => void) | null = null
		// Registered FIRST, so it runs before the sibling it removes.
		store.subscribeToEntity('Article', 'a1', () => { unsubscribeSibling?.() })
		unsubscribeSibling = store.subscribeToEntity('Article', 'a1', () => { siblingCalls++ })

		store.clear()

		expect(siblingCalls).toBe(0)
	})

	test('a global subscriber unsubscribed mid-pass is not invoked', () => {
		store.setEntityData('Article', 'a1', { id: 'a1', title: 'T' }, true)

		let siblingCalls = 0
		let unsubscribeSibling: (() => void) | null = null
		store.subscribeToEntity('Article', 'a1', () => { unsubscribeSibling?.() })
		unsubscribeSibling = store.subscribe(() => { siblingCalls++ })

		store.clear()

		expect(siblingCalls).toBe(0)
	})
})
