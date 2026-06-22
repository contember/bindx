// Reachability-based create detection (Phase 1+2a of the dirty-detection rework).
//
// A created (never-persisted) entity is reported as a `create` ONLY when it is
// reachable from a root through live relations. Roots are server entities plus
// freshly-created entities that have not been anchored as a child of any relation
// (createEntity auto-roots; registerParentChild un-roots).
//
// These tests exercise the analyzer directly through the store's public API. They
// deliberately construct lingering orphan snapshots (created, then unrooted /
// disconnected without an eager purge) to prove the reachability gate excludes
// them — the behavior that lets us delete the eager-purge machinery in Phase 2b.
import { describe, test, expect, beforeEach } from 'bun:test'
import { SnapshotStore } from '@contember/bindx'

describe('reachability create detection', () => {
	let store: SnapshotStore

	beforeEach(() => {
		store = new SnapshotStore()
	})

	const creates = () => store.getAllDirtyEntities().filter(e => e.changeType === 'create')
	const createIds = () => creates().map(e => e.entityId).sort()

	test('a freshly created top-level entity is a create (auto-rooted)', () => {
		const id = store.createEntity('Article', { title: 'New' })
		expect(creates()).toEqual([{ entityType: 'Article', entityId: id, changeType: 'create' }])
	})

	test('an unrooted lingering orphan is NOT a create, even though its snapshot exists', () => {
		const id = store.createEntity('Comment', { text: 'x' })
		// Simulate a created entity that has been detached from everything but whose
		// snapshot has not been purged. Under the old snapshot-existence rule this was
		// a phantom create; under reachability it is correctly ignored.
		store.unregisterRootEntity('Comment', id)

		expect(store.getAllDirtyEntities()).toEqual([])
		expect(store.hasEntity('Comment', id)).toBe(true)
	})

	test('a created child of a server parent is reachable via the relation', () => {
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T' }, true)
		const cId = store.createEntity('Comment', { text: 'new' })
		store.addToHasMany('Article', 'a-1', 'comments', cId)
		store.registerParentChild('Article', 'a-1', 'Comment', cId)

		expect(creates()).toEqual([{ entityType: 'Comment', entityId: cId, changeType: 'create' }])
	})

	test('a created chain under a server root is fully reported', () => {
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T' }, true)
		const cId = store.createEntity('Comment', { text: 'c' })
		store.addToHasMany('Article', 'a-1', 'comments', cId)
		store.registerParentChild('Article', 'a-1', 'Comment', cId)
		const rId = store.createEntity('Reaction', { kind: 'like' })
		store.addToHasMany('Comment', cId, 'reactions', rId)
		store.registerParentChild('Comment', cId, 'Reaction', rId)

		expect(createIds()).toEqual([cId, rId].sort())
	})

	test('detaching the root drops the whole created subtree without any cascade purge', () => {
		const cId = store.createEntity('Comment', { text: 'c' })
		const rId = store.createEntity('Reaction', { kind: 'like' })
		store.addToHasMany('Comment', cId, 'reactions', rId)
		store.registerParentChild('Comment', cId, 'Reaction', rId)

		// Both snapshots still exist; only the root link is gone.
		store.unregisterRootEntity('Comment', cId)

		expect(store.getAllDirtyEntities()).toEqual([])
		expect(store.hasEntity('Comment', cId)).toBe(true)
		expect(store.hasEntity('Reaction', rId)).toBe(true)
	})

	test('disconnecting a has-one drops the created target from creates', () => {
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T' }, true)
		const auId = store.createEntity('Author', { name: 'draft' })
		store.setRelation('Article', 'a-1', 'author', { currentId: auId, state: 'connected' })
		store.registerParentChild('Article', 'a-1', 'Author', auId)

		expect(creates()).toEqual([{ entityType: 'Author', entityId: auId, changeType: 'create' }])

		// Disconnect at the relation level; the Author snapshot lingers but is no
		// longer reachable.
		store.setRelation('Article', 'a-1', 'author', { currentId: null, state: 'disconnected' })

		expect(creates()).toEqual([])
		expect(store.hasEntity('Author', auId)).toBe(true)
	})

	test('a created entity shared by two server parents stays a create until both drop it', () => {
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'A' }, true)
		store.setEntityData('Article', 'a-2', { id: 'a-2', title: 'B' }, true)
		const tagId = store.createEntity('Tag', { name: 'shared' })
		store.addToHasMany('Article', 'a-1', 'tags', tagId)
		store.registerParentChild('Article', 'a-1', 'Tag', tagId)
		store.planHasManyConnection('Article', 'a-2', 'tags', tagId)
		store.registerParentChild('Article', 'a-2', 'Tag', tagId)

		expect(createIds()).toEqual([tagId])

		// Drop from the first list; still reachable via the second.
		store.removeFromHasMany('Article', 'a-1', 'tags', tagId, 'disconnect')
		expect(createIds()).toEqual([tagId])
	})

	test('sweepUnreachableCreated removes detached orphans but keeps live creates', () => {
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T' }, true)
		// Live create: child of a server parent.
		const cId = store.createEntity('Comment', { text: 'live' })
		store.addToHasMany('Article', 'a-1', 'comments', cId)
		store.registerParentChild('Article', 'a-1', 'Comment', cId)
		// Live create: top-level root.
		const topId = store.createEntity('Article', { title: 'draft' })
		// Orphan: created then detached, referenced by nothing.
		const orphanId = store.createEntity('Comment', { text: 'orphan' })
		store.unregisterRootEntity('Comment', orphanId)

		store.sweepUnreachableCreated()

		expect(store.hasEntity('Comment', orphanId)).toBe(false)
		expect(store.hasEntity('Comment', cId)).toBe(true)
		expect(store.hasEntity('Article', topId)).toBe(true)
		expect(createIds()).toEqual([cId, topId].sort())
	})

	test('server entity edits and deletions are unaffected by the create gate', () => {
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T' }, true)
		store.setFieldValue('Article', 'a-1', ['title'], 'Edited')
		expect(store.getAllDirtyEntities()).toEqual([
			{ entityType: 'Article', entityId: 'a-1', changeType: 'update' },
		])

		store.setEntityData('Article', 'a-2', { id: 'a-2', title: 'D' }, true)
		store.scheduleForDeletion('Article', 'a-2')
		expect(store.getAllDirtyEntities()).toContainEqual({
			entityType: 'Article',
			entityId: 'a-2',
			changeType: 'delete',
		})
	})
})
