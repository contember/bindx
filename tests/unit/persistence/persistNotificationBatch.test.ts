import { expect, test } from 'bun:test'
import {
	ActionDispatcher,
	BatchPersister,
	MockAdapter,
	SnapshotStore,
	buildQuery,
	createEntityLoader,
	type BackendAdapter,
} from '@contember/bindx'

interface Article {
	id: string
	title: string
}

async function countPersistNotifications(entityCount: number): Promise<number> {
	let createdCount = 0
	const adapter: BackendAdapter = {
		query: () => Promise.resolve([]),
		persist: () => Promise.resolve({ ok: true }),
		create: (_entityType, data) => Promise.resolve({ ok: true, data: { ...data, id: `persisted-${++createdCount}` } }),
		delete: () => Promise.resolve({ ok: true }),
	}
	const store = new SnapshotStore()
	const persister = new BatchPersister(adapter, store, new ActionDispatcher(store))
	for (let i = 0; i < entityCount; i++) {
		store.setEntityData('Article', `a${i}`, { id: `a${i}`, title: 'Original' }, true)
		store.setFieldValue('Article', `a${i}`, ['title'], 'Updated')
		store.createEntity('Article', { title: `Draft ${i}` })
	}
	let notifications = 0
	store.subscribe(() => { notifications++ })
	const result = await persister.persistAll()
	expect(result.success).toBe(true)
	return notifications
}

test('a persist notifies independently of how many entities it saves', async () => {
	const single = await countPersistNotifications(1)
	expect(await countPersistNotifications(20)).toBe(single)
})

test('loadMany notifies once for the whole list', async () => {
	const rows = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`a${i}`, { id: `a${i}`, title: `Row ${i}` }]))
	const store = new SnapshotStore()
	const loader = createEntityLoader(new MockAdapter({ Article: rows }, { delay: 0 }), store)
	let notifications = 0
	store.subscribe(() => { notifications++ })
	const result = await loader.loadMany({ entityType: 'Article', query: buildQuery<Article, Article>(e => e.id().title()) })
	expect(result.status).toBe('success')
	expect(notifications).toBe(1)
})
