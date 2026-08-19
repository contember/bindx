// Guard for the dirty-scan cache key (issue #65).
//
// ChangeRegistry memoizes the full-store dirty scan on SnapshotStore.getDirtyVersion(),
// a sum of monotonic sub-store counters. A write that changes dirtiness without
// moving that sum fails SILENTLY: the store keeps serving the pre-write dirty set
// for the rest of the session, so the Save button goes dead with nothing thrown and
// no test failing anywhere near the offending line.
//
// EntitySnapshotStore contributes the term that must cover both layers (`data` and
// `serverData`). Its writes funnel through the writeSnapshot/deleteSnapshot
// chokepoints, which own the bump — this test is what makes that structural
// property enforced rather than merely intended:
//   - every method on the prototype is classified here, so a NEW method fails the
//     test until someone decides which bucket it belongs in;
//   - every method classified as mutating must move the counter.
import { describe, test, expect } from 'bun:test'
import { SnapshotStore } from '@contember/bindx'
import { EntitySnapshotStore } from '../../../packages/bindx/src/store/EntitySnapshotStore.js'
import { createEntitySnapshot } from '../../../packages/bindx/src/store/snapshots.js'

interface StoreCase {
	readonly method: string
	readonly run: (store: EntitySnapshotStore) => void
}

/** Seeds Article:a1 so the methods that need an existing snapshot actually write. */
function seeded(): EntitySnapshotStore {
	const store = new EntitySnapshotStore()
	store.setData('Article:a1', 'a1', 'Article', { id: 'a1', title: 'server' }, true)
	return store
}

/** Every method that can change a snapshot's `data` or `serverData`. */
const mutatingCases: readonly StoreCase[] = [
	{ method: 'setData', run: s => { s.setData('Article:a2', 'a2', 'Article', { id: 'a2' }, true) } },
	{ method: 'refreshServerData', run: s => { s.refreshServerData('Article:a1', 'a1', 'Article', { id: 'a1', title: 'fresh' }) } },
	{ method: 'updateFields', run: s => { s.updateFields('Article:a1', { title: 'edited' }) } },
	{ method: 'setFieldValue', run: s => { s.setFieldValue('Article:a1', ['title'], 'edited') } },
	{ method: 'commit', run: s => { s.commit('Article:a1') } },
	{ method: 'reset', run: s => { s.reset('Article:a1') } },
	{ method: 'remove', run: s => { s.remove('Article:a1') } },
	{ method: 'commitFields', run: s => { s.commitFields('Article:a1', ['title']) } },
	{
		method: 'importSnapshots',
		run: s => {
			s.importSnapshots(new Map([
				['Article:a3', createEntitySnapshot('a3', 'Article', { id: 'a3' }, { id: 'a3' }, 1)],
			]))
		},
	},
	{
		method: 'rekey',
		run: s => {
			s.rekey({
				oldKey: 'Article:a1',
				newKey: 'Article:a9',
				oldKeyPrefix: 'Article:a1:',
				newKeyPrefix: 'Article:a9:',
				oldId: 'a1',
				newId: 'a9',
			})
		},
	},
	{ method: 'clear', run: s => { s.clear() } },
]

/** Reads and pure bookkeeping: must NOT move the counter. */
const nonMutatingCases: readonly StoreCase[] = [
	{ method: 'get', run: s => { s.get('Article:a1') } },
	{ method: 'has', run: s => { s.has('Article:a1') } },
	{ method: 'keys', run: s => { [...s.keys()] } },
	{ method: 'keyForId', run: s => { s.keyForId('a1') } },
	{ method: 'exportSnapshots', run: s => { s.exportSnapshots(['Article:a1']) } },
	{ method: 'getMutationVersion', run: s => { s.getMutationVersion() } },
	{ method: 'getEditableWriteVersion', run: s => { s.getEditableWriteVersion() } },
	{ method: 'getDataWriteVersion', run: s => { s.getDataWriteVersion() } },
	// The one documented bypass: reinstalls the same data/serverData references
	// under a new version, so it cannot change dirtiness and must keep the memo warm
	// (it runs once per ancestor on every notification).
	{ method: 'bumpVersion', run: s => { s.bumpVersion('Article:a1') } },
]

/** The private chokepoints — exercised through every case above, not directly. */
const internalMethods: readonly string[] = ['constructor', 'writeSnapshot', 'deleteSnapshot']

describe('EntitySnapshotStore dirty-version coverage', () => {
	test('every method on the prototype is classified', () => {
		const classified = new Set([
			...mutatingCases.map(c => c.method),
			...nonMutatingCases.map(c => c.method),
			...internalMethods,
		])
		const unclassified = Object.getOwnPropertyNames(EntitySnapshotStore.prototype)
			.filter(name => !classified.has(name))

		// A new method landed. Decide whether it can change `data`/`serverData`: if it
		// can, route it through writeSnapshot/deleteSnapshot and add it to
		// mutatingCases; if it cannot, add it to nonMutatingCases.
		expect(unclassified).toEqual([])
	})

	for (const { method, run } of mutatingCases) {
		test(`${method} moves the dirty version`, () => {
			const store = seeded()
			const before = store.getDataWriteVersion()
			run(store)
			expect(store.getDataWriteVersion()).toBeGreaterThan(before)
		})
	}

	for (const { method, run } of nonMutatingCases) {
		test(`${method} leaves the dirty version alone`, () => {
			const store = seeded()
			const before = store.getDataWriteVersion()
			run(store)
			expect(store.getDataWriteVersion()).toBe(before)
		})
	}
})

// The four store writes that change dirtiness while notifying nothing (or notifying
// before the change lands). They are why the key cannot be getVersion(); each must
// still move getDirtyVersion().
describe('SnapshotStore.getDirtyVersion covers the silent writes', () => {
	test('createEntity — registers its root after the last notification', () => {
		const store = new SnapshotStore()
		const before = store.getDirtyVersion()
		store.createEntity('Article', { title: 'draft' })
		expect(store.getDirtyVersion()).toBeGreaterThan(before)
	})

	test('registerParentChild — un-registers a root, notifies nothing', () => {
		const store = new SnapshotStore()
		store.setEntityData('Article', 'a1', { id: 'a1' }, true)
		const childId = store.createEntity('Comment', { text: 'draft' })

		const notifyVersion = store.getVersion()
		const before = store.getDirtyVersion()
		store.registerParentChild('Article', 'a1', 'Comment', childId)

		expect(store.getVersion()).toBe(notifyVersion)
		expect(store.getDirtyVersion()).toBeGreaterThan(before)
	})

	test('commitAllRelations / resetAllRelations — notify nothing', () => {
		const store = new SnapshotStore()
		store.setEntityData('Article', 'a1', { id: 'a1' }, true)
		store.setEntityData('Author', 'u1', { id: 'u1' }, true)
		store.setRelation('Article', 'a1', 'author', { currentId: 'u1', state: 'connected' })

		const notifyVersion = store.getVersion()
		const beforeCommit = store.getDirtyVersion()
		store.commitAllRelations('Article', 'a1')
		expect(store.getDirtyVersion()).toBeGreaterThan(beforeCommit)

		const beforeReset = store.getDirtyVersion()
		store.resetAllRelations('Article', 'a1')
		expect(store.getDirtyVersion()).toBeGreaterThan(beforeReset)

		expect(store.getVersion()).toBe(notifyVersion)
	})

	test('refreshServerData with skipNotify', () => {
		const store = new SnapshotStore()
		store.setEntityData('Article', 'a1', { id: 'a1', title: 'server' }, true)
		store.setFieldValue('Article', 'a1', ['title'], 'edited')

		const notifyVersion = store.getVersion()
		const before = store.getDirtyVersion()
		store.refreshServerData('Article', 'a1', { id: 'a1', title: 'edited' }, true)

		expect(store.getVersion()).toBe(notifyVersion)
		expect(store.getDirtyVersion()).toBeGreaterThan(before)
	})
})
