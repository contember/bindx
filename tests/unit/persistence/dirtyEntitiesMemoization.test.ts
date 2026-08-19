// Memoization of the full-store dirty scan behind ChangeRegistry.getDirtyEntities().
//
// The scan (SnapshotStore.getAllDirtyEntities → DirtyTracker) walks every entity
// snapshot, deep-compares its scalars against the server baseline and runs a
// reachability walk. A global store subscriber (the save-button hook) reads it
// synchronously from inside EVERY store notification, and list helpers emit one
// notification per touched item — so a single removal in a large list used to cost
// one full scan per notification.
//
// The cache key must be notification-INDEPENDENT: several store writes change
// dirtiness without bumping the notification version (createEntity registers its
// root after the last notify; commitAllRelations and a skipNotify refreshServerData
// do not notify at all). The key therefore sums the sub-stores' monotonic mutation
// counters, the same pattern ReachabilityAnalyzer uses.
import { describe, test, expect } from 'bun:test'
import { ChangeRegistry, SnapshotStore } from '@contember/bindx'

interface Harness {
	store: SnapshotStore
	registry: ChangeRegistry
	scanCount: () => number
}

function createHarness(): Harness {
	const store = new SnapshotStore()

	// Spy: getAllDirtyEntities is the full-store scan ChangeRegistry delegates to,
	// so a stable count across calls proves the memo served them without re-scanning.
	let scans = 0
	const original = store.getAllDirtyEntities.bind(store)
	store.getAllDirtyEntities = () => {
		scans++
		return original()
	}

	return { store, registry: new ChangeRegistry(store), scanCount: () => scans }
}

/** Server-loaded Article a1 with a locally edited title. */
function seedEditedArticle(store: SnapshotStore): void {
	store.setEntityData('Article', 'a1', { id: 'a1', title: 'server' }, true)
	store.setFieldValue('Article', 'a1', ['title'], 'edited')
}

describe('ChangeRegistry dirty-scan memoization', () => {
	test('repeated calls without a store mutation run exactly one scan', () => {
		const { store, registry, scanCount } = createHarness()
		seedEditedArticle(store)

		const first = registry.getDirtyEntities()
		for (let i = 0; i < 20; i++) {
			expect(registry.getDirtyEntities()).toBe(first)
		}

		expect(scanCount()).toBe(1)
		expect(first).toEqual([{
			entityType: 'Article',
			entityId: 'a1',
			changeType: 'update',
			dirtyFields: ['title'],
			dirtyRelations: [],
		}])
	})

	test('a scalar field edit invalidates the memo', () => {
		const { store, registry, scanCount } = createHarness()
		store.setEntityData('Article', 'a1', { id: 'a1', title: 'server' }, true)

		expect(registry.getDirtyEntities()).toEqual([])
		expect(scanCount()).toBe(1)

		store.setFieldValue('Article', 'a1', ['title'], 'edited')

		expect(registry.getDirtyEntities()).toEqual([{
			entityType: 'Article',
			entityId: 'a1',
			changeType: 'update',
			dirtyFields: ['title'],
			dirtyRelations: [],
		}])
		expect(scanCount()).toBe(2)
	})

	test('a relation mutation invalidates the memo, and so does committing it', () => {
		const { store, registry } = createHarness()
		store.setEntityData('Article', 'a1', { id: 'a1', title: 'server' }, true)
		store.setEntityData('Author', 'u1', { id: 'u1' }, true)

		expect(registry.getDirtyEntities()).toEqual([])

		store.setRelation('Article', 'a1', 'author', { currentId: 'u1', state: 'connected' })

		expect(registry.getDirtyEntities()).toEqual([{
			entityType: 'Article',
			entityId: 'a1',
			changeType: 'update',
			dirtyFields: [],
			dirtyRelations: ['author'],
		}])

		// commitAllRelations notifies nothing at all (it runs on persist success),
		// so only a counter-based key sees it.
		store.commitAllRelations('Article', 'a1')

		expect(registry.getDirtyEntities()).toEqual([])
	})

	test('createEntity invalidates the memo even though it registers its root after the last notification', () => {
		const { store, registry } = createHarness()

		// The save-button hook subscribes globally and reads the dirty set
		// synchronously from inside the notification — i.e. mid-createEntity, before
		// roots.register() has run and with no further notification to follow it.
		const readsDuringNotify: number[] = []
		store.subscribe(() => {
			readsDuringNotify.push(registry.getDirtyEntities().length)
		})

		const id = store.createEntity('Article', { title: 'draft' })

		expect(readsDuringNotify.length).toBeGreaterThan(0)
		expect(readsDuringNotify.every(count => count === 0)).toBe(true)

		expect(registry.getDirtyEntities()).toEqual([{
			entityType: 'Article',
			entityId: id,
			changeType: 'create',
			dirtyFields: [],
			dirtyRelations: [],
		}])
	})

	test('a silent server-baseline refresh invalidates the memo', () => {
		const { store, registry } = createHarness()
		seedEditedArticle(store)

		expect(registry.getDirtyEntities()).toHaveLength(1)

		// Revalidation that adopts the local value as the new baseline, with
		// notification suppressed — the entity is clean afterwards.
		store.refreshServerData('Article', 'a1', { id: 'a1', title: 'edited' }, true)

		expect(registry.getDirtyEntities()).toEqual([])
	})

	test('scheduling a deletion invalidates the memo', () => {
		const { store, registry } = createHarness()
		store.setEntityData('Article', 'a1', { id: 'a1', title: 'server' }, true)

		expect(registry.getDirtyEntities()).toEqual([])

		store.scheduleForDeletion('Article', 'a1')

		expect(registry.getDirtyEntities()).toEqual([{
			entityType: 'Article',
			entityId: 'a1',
			changeType: 'delete',
			dirtyFields: [],
			dirtyRelations: [],
		}])
	})

	test('getDirtyEntitiesNotInFlight re-filters on every call, without re-scanning', () => {
		const { store, registry, scanCount } = createHarness()
		seedEditedArticle(store)

		expect(registry.getDirtyEntitiesNotInFlight()).toHaveLength(1)
		const scansAfterFirstRead = scanCount()

		// In-flight state lives on the registry, not the store: it changes with no
		// store write, so the filter must run even while the memo stays warm.
		registry.markInFlight([{ entityType: 'Article', entityId: 'a1' }])
		expect(registry.getDirtyEntitiesNotInFlight()).toHaveLength(0)

		registry.clearInFlight([{ entityType: 'Article', entityId: 'a1' }])
		expect(registry.getDirtyEntitiesNotInFlight()).toHaveLength(1)

		expect(scanCount()).toBe(scansAfterFirstRead)
	})
})
