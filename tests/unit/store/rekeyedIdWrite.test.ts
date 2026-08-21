/**
 * Writes that still carry a rekeyed temp id land on the persisted key and must stamp
 * the live id into the snapshot — never resurrect the dead temp id in the id index.
 */
import { describe, test, expect } from 'bun:test'
import { SnapshotStore } from '@contember/bindx'
import { EntitySnapshotStore } from '../../../packages/bindx/src/store/EntitySnapshotStore.js'

/** Article a1 with a created Comment child that has just been persisted and rekeyed. */
function seedRekeyed(): { store: SnapshotStore; temp: string } {
	const store = new SnapshotStore()
	store.setEntityData('Article', 'a1', { id: 'a1' }, true)
	const temp = store.createEntity('Comment', { text: 'x' })
	store.addToHasMany('Article', 'a1', 'list', temp)
	store.registerParentChild('Article', 'a1', 'Comment', temp)
	store.setExistsOnServer('Comment', temp, true)
	store.mapTempIdToPersistedId('Comment', temp, 'p1')
	return { store, temp }
}

describe('post-rekey writes that still carry the stale temp id', () => {
	test('setEntityData keeps snapshot.id equal to the entity key it wrote', () => {
		const { store, temp } = seedRekeyed()
		store.setEntityData('Comment', temp, { text: 'srv' }, true)
		expect(store.getEntitySnapshot('Comment', 'p1')?.id).toBe('p1')
	})

	test('refreshServerData keeps snapshot.id equal to the entity key it wrote', () => {
		const { store, temp } = seedRekeyed()
		store.refreshServerData('Comment', temp, { id: 'p1', text: 'srv' })
		expect(store.getEntitySnapshot('Comment', 'p1')?.id).toBe('p1')
	})
})

describe('EntitySnapshotStore id index', () => {
	test('moving an id to another key bumps the mutation version', () => {
		const snapshots = new EntitySnapshotStore()
		snapshots.setData('Comment:a', 'a', 'Comment', { id: 'a' }, true)
		snapshots.setData('Comment:b', 'b', 'Comment', { id: 'b' }, true)
		const before = snapshots.getMutationVersion()

		// Re-pointing an existing id at an existing key changes what relation edges
		// resolve to, so the reachability memo keyed on this counter must miss.
		snapshots.setData('Comment:b', 'a', 'Comment', { id: 'a' }, true)

		expect(snapshots.keyForId('a')).toBe('Comment:b')
		expect(snapshots.getMutationVersion()).toBeGreaterThan(before)
	})
})
