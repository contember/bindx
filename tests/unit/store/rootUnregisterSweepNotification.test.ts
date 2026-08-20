// NEGATIVE RESULT, CHARACTERIZATION (these tests PASS) — `sweepUnreachableCreated`
// and `unregisterRootEntity` were both investigated as suspected missing-notification
// bugs and neither is one. No `test.failing` pin belongs here; these tests record
// why the two reachability writes that carry no `notify` call of their own are NOT
// a staleness bug.
//
//   - `sweepUnreachableCreated` has no notify statement, but every snapshot it
//     drops goes through `removeEntity`, which notifies the entity, its live
//     parents and the global subscribers. Removing nothing changes nothing.
//   - `unregisterRootEntity` is silent, but both of its callers (the `<Entity
//     create>` unmount cleanup in Entity.tsx and the draft cleanup in
//     useEntityList.ts) run `sweepUnreachableCreated()` immediately after, so the
//     entities whose dirty state the un-root changed are exactly the ones the
//     sweep removes — and notifies for.
//
// If either of these ever stops holding, these tests fail and the silent write
// becomes a real staleness bug.
import { describe, test, expect, beforeEach } from 'bun:test'
import { SnapshotStore } from '@contember/bindx'

describe('reachability writes notify through removeEntity', () => {
	let store: SnapshotStore

	beforeEach(() => {
		store = new SnapshotStore()
	})

	const dirtyIds = (): string[] => store.getAllDirtyEntities().map(e => e.entityId).sort()

	test('sweepUnreachableCreated notifies the subscribers of every snapshot it removes', () => {
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T' }, true)
		const commentId = store.createEntity('Comment', { text: 'draft' })
		store.addToHasMany('Article', 'a-1', 'comments', commentId)
		store.registerParentChild('Article', 'a-1', 'Comment', commentId)
		// The user drops the draft comment from the list again: still in the store,
		// no longer reachable from any root.
		store.removeFromHasMany('Article', 'a-1', 'comments', commentId, 'disconnect')

		let entityNotifications = 0
		let globalNotifications = 0
		const unsubscribeEntity = store.subscribeToEntity('Comment', commentId, () => { entityNotifications++ })
		const unsubscribeGlobal = store.subscribe(() => { globalNotifications++ })

		expect(store.hasEntity('Comment', commentId)).toBe(true)

		store.sweepUnreachableCreated()

		expect(store.hasEntity('Comment', commentId)).toBe(false)
		expect(entityNotifications).toBeGreaterThanOrEqual(1)
		expect(globalNotifications).toBeGreaterThanOrEqual(1)

		unsubscribeEntity()
		unsubscribeGlobal()
	})

	test('sweepUnreachableCreated with nothing to reclaim changes no observable value', () => {
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T' }, true)
		const commentId = store.createEntity('Comment', { text: 'live' })
		store.addToHasMany('Article', 'a-1', 'comments', commentId)
		store.registerParentChild('Article', 'a-1', 'Comment', commentId)

		let notifications = 0
		const unsubscribe = store.subscribe(() => { notifications++ })
		const dirtyBefore = dirtyIds()

		store.sweepUnreachableCreated()

		expect(dirtyIds()).toEqual(dirtyBefore)
		expect(store.hasEntity('Comment', commentId)).toBe(true)
		expect(notifications).toBe(0)

		unsubscribe()
	})

	test('the unmount sequence (unregisterRootEntity + sweep) notifies while the draft leaves the dirty list', () => {
		const draftId = store.createEntity('Author', { name: 'draft' })
		expect(dirtyIds()).toEqual([draftId])

		let entityNotifications = 0
		let globalNotifications = 0
		const unsubscribeEntity = store.subscribeToEntity('Author', draftId, () => { entityNotifications++ })
		const unsubscribeGlobal = store.subscribe(() => { globalNotifications++ })

		// Exactly what Entity.tsx / useEntityList.ts do on unmount.
		store.unregisterRootEntity('Author', draftId)
		store.sweepUnreachableCreated()

		expect(dirtyIds()).toEqual([])
		expect(store.hasEntity('Author', draftId)).toBe(false)
		expect(entityNotifications).toBeGreaterThanOrEqual(1)
		expect(globalNotifications).toBeGreaterThanOrEqual(1)

		unsubscribeEntity()
		unsubscribeGlobal()
	})

	test('a created child orphaned with its un-rooted parent is reclaimed and notified too', () => {
		const authorId = store.createEntity('Author', { name: 'draft' })
		const articleId = store.createEntity('Article', { title: 'child draft' })
		store.addToHasMany('Author', authorId, 'articles', articleId)
		store.registerParentChild('Author', authorId, 'Article', articleId)

		expect(dirtyIds()).toEqual([articleId, authorId].sort())

		let childNotifications = 0
		const unsubscribe = store.subscribeToEntity('Article', articleId, () => { childNotifications++ })

		store.unregisterRootEntity('Author', authorId)
		store.sweepUnreachableCreated()

		expect(dirtyIds()).toEqual([])
		expect(store.hasEntity('Article', articleId)).toBe(false)
		expect(childNotifications).toBeGreaterThanOrEqual(1)

		unsubscribe()
	})

	test('unregistering the root of an already-persisted entity changes no observable value', () => {
		const draftId = store.createEntity('Author', { name: 'draft' })
		store.mapTempIdToPersistedId('Author', draftId, 'author-1')
		store.setExistsOnServer('Author', 'author-1', true)

		const dirtyBefore = dirtyIds()

		store.unregisterRootEntity('Author', 'author-1')
		store.sweepUnreachableCreated()

		// A server entity is a reachability root on its own, so dropping the
		// registry entry is inert — there is nothing for a subscriber to miss.
		expect(dirtyIds()).toEqual(dirtyBefore)
		expect(store.hasEntity('Author', 'author-1')).toBe(true)
	})
})
