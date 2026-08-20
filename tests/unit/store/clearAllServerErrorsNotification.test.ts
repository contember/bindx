// Regression: `SnapshotStore.clearAllServerErrors` mutated observable state
// (getFieldErrors / getEntityErrors / hasAnyErrors) without calling
// notifyEntitySubscribers, while its sibling `clearAllErrors` did. A subscriber
// therefore kept reading the pre-clear error list until some unrelated write
// happened to notify. The clear now notifies like its sibling; these tests guard
// that symmetry.
//
// The React-level consequence is in tests/react/storeNotifications/.
import { describe, test, expect, beforeEach } from 'bun:test'
import { SnapshotStore, createServerError } from '@contember/bindx'

describe('clearAllServerErrors / clearAllErrors notification symmetry', () => {
	let store: SnapshotStore

	beforeEach(() => {
		store = new SnapshotStore()
		store.setEntityData('Author', 'author-1', { id: 'author-1', name: 'Ada' }, true)
		store.addFieldError('Author', 'author-1', 'name', createServerError('Name is already taken'))
	})

	/** The value a subscriber would render: the field's error messages. */
	const renderedErrors = (): string =>
		store.getFieldErrors('Author', 'author-1', 'name').map(e => e.message).join('|')

	test('clearAllServerErrors notifies the entity subscriber', () => {
		let notifications = 0
		const unsubscribe = store.subscribeToEntity('Author', 'author-1', () => { notifications++ })

		// Value BEFORE the write — this is what a subscriber is currently showing.
		expect(renderedErrors()).toBe('Name is already taken')

		store.clearAllServerErrors('Author', 'author-1')

		// The value changed …
		expect(renderedErrors()).toBe('')
		expect(store.hasAnyErrors('Author', 'author-1')).toBe(false)
		// … so the subscriber must be told, otherwise it keeps rendering the old one.
		expect(notifications).toBe(1)

		unsubscribe()
	})

	test('clearAllServerErrors notifies global subscribers', () => {
		let notifications = 0
		const unsubscribe = store.subscribe(() => { notifications++ })
		const versionBefore = store.getVersion()

		store.clearAllServerErrors('Author', 'author-1')

		expect(renderedErrors()).toBe('')
		expect(notifications).toBe(1)
		expect(store.getVersion()).toBeGreaterThan(versionBefore)

		unsubscribe()
	})

	// Control (passes today): the sibling method notifies for exactly the same
	// class of write. This is the asymmetry that makes the above a bug and not a
	// deliberate design.
	test('control: clearAllErrors notifies the entity subscriber', () => {
		let notifications = 0
		const unsubscribe = store.subscribeToEntity('Author', 'author-1', () => { notifications++ })

		expect(renderedErrors()).toBe('Name is already taken')

		store.clearAllErrors('Author', 'author-1')

		expect(renderedErrors()).toBe('')
		expect(notifications).toBe(1)

		unsubscribe()
	})
})
