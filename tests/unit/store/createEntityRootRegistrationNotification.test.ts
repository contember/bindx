// Regression: `SnapshotStore.createEntity` used to register the create-root AFTER
// both of its notifying writes (setEntityData, setExistsOnServer). The root
// registration is what makes the entity a `create` in getAllDirtyEntities(), so
// every notification carried the pre-registration value and a subscriber kept
// reading "nothing to save". The root is now registered before the final
// setExistsOnServer, so the last notification already carries it.
//
// The user-visible half of this is in
// tests/react/storeNotifications/createDraftRootRegistration.test.tsx.
import { describe, test, expect, beforeEach } from 'bun:test'
import { SnapshotStore } from '@contember/bindx'

describe('createEntity root registration notification', () => {
	let store: SnapshotStore

	beforeEach(() => {
		store = new SnapshotStore()
	})

	test('the dirty count a subscriber last saw includes the new create', () => {
		// What a save indicator renders on every notification.
		const seen: number[] = []
		const unsubscribe = store.subscribe(() => { seen.push(store.getAllDirtyEntities().length) })

		const draftId = store.createEntity('Author', { name: 'draft' })

		// Truth in the store after the call.
		expect(store.getAllDirtyEntities()).toEqual([
			{ entityType: 'Author', entityId: draftId, changeType: 'create' },
		])

		// The subscriber was notified …
		expect(seen.length).toBeGreaterThan(0)
		// … but the last value it observed must match the store, or it renders a
		// stale "no unsaved changes".
		expect(seen.at(-1)).toBe(1)

		unsubscribe()
	})

	// Control (passes today): an ordinary edit announces the value it produced.
	test('control: an update announces the dirty count it produced', () => {
		store.setEntityData('Author', 'author-1', { id: 'author-1', name: 'Ada' }, true)

		const seen: number[] = []
		const unsubscribe = store.subscribe(() => { seen.push(store.getAllDirtyEntities().length) })

		store.setFieldValue('Author', 'author-1', ['name'], 'Ada Lovelace')

		expect(store.getAllDirtyEntities()).toHaveLength(1)
		expect(seen.at(-1)).toBe(1)

		unsubscribe()
	})
})
