// KNOWN-BROKEN PIN — the `test.failing` case below asserts the behaviour the
// store SHOULD have. Bun reports it as passing while the bug is present, and
// turns it into a failure the moment the root registration starts notifying,
// which forces whoever fixes it to drop the `.failing` marker. The assertions are
// the real symptom; nothing was relaxed to fit the marker.
//
// `SnapshotStore.createEntity` writes in three steps: setEntityData (notifies),
// setExistsOnServer (notifies), then `roots.register()` — which is silent. The
// entity only becomes a `create` in getAllDirtyEntities() at that third step, so
// both notifications carry the pre-registration value and the value that matters
// is never announced. A subscriber keeps reading "nothing to save".
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

	test.failing('the dirty count a subscriber last saw includes the new create (known broken)', () => {
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
