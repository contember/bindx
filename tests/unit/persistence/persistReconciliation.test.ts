import { describe, expect, test } from 'bun:test'
import {
	ActionDispatcher,
	BatchPersister,
	ContemberSchemaMutationAdapter,
	MutationCollector,
	SnapshotStore,
	type BackendAdapter,
	type MutationDataCollector,
	type SchemaNames,
} from '@contember/bindx'

const schema: SchemaNames = {
	entities: {
		Article: {
			name: 'Article',
			scalars: ['id', 'title'],
			fields: {
				id: { type: 'column' },
				title: { type: 'column' },
				author: { type: 'one', entity: 'Author' },
				tags: { type: 'many', entity: 'Tag' },
			},
		},
		Author: { name: 'Author', scalars: ['id', 'name'], fields: { id: { type: 'column' }, name: { type: 'column' } } },
		Tag: { name: 'Tag', scalars: ['id', 'name'], fields: { id: { type: 'column' }, name: { type: 'column' } } },
	},
	enums: {},
}

interface Deferred<T> {
	readonly promise: Promise<T>
	readonly resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
	let resolvePromise: ((value: T) => void) | undefined
	const promise = new Promise<T>(resolve => {
		resolvePromise = resolve
	})
	return {
		promise,
		resolve: value => {
			if (!resolvePromise) throw new Error('Deferred promise is not initialized')
			resolvePromise(value)
		},
	}
}

function field(store: SnapshotStore, type: string, id: string, name: string): unknown {
	const data = store.getEntitySnapshot<Record<string, unknown>>(type, id)?.data
	return data && name in data ? data[name] : undefined
}

function scalarAdapter(
	persist: BackendAdapter['persist'],
	overrides: Partial<Pick<BackendAdapter, 'create' | 'delete' | 'persistTransaction'>> = {},
): BackendAdapter {
	return {
		query: () => Promise.resolve([]),
		persist,
		...overrides,
	}
}

describe('exact persistence reconciliation', () => {
	test('commits only the scalar value that was sent', async () => {
		const store = new SnapshotStore()
		const pending = deferred<{ ok: true }>()
		const adapter = scalarAdapter(() => pending.promise)
		const persister = new BatchPersister(adapter, store, new ActionDispatcher(store))
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
		store.setFieldValue('Article', 'a-1', ['title'], 'Sent')

		const promise = persister.persist('Article', 'a-1')
		store.setFieldValue('Article', 'a-1', ['title'], 'Newer')
		pending.resolve({ ok: true })
		expect((await promise).success).toBe(true)

		expect(field(store, 'Article', 'a-1', 'title')).toBe('Newer')
		expect(store.getEntitySnapshot<Record<string, unknown>>('Article', 'a-1')?.serverData['title']).toBe('Sent')
		expect(store.getDirtyFields('Article', 'a-1')).toContain('title')
	})

	test('rebases sent has-one and has-many changes over newer local intent', async () => {
		const store = new SnapshotStore()
		const pending = deferred<{ ok: true; data: Record<string, unknown> }>()
		const adapter = scalarAdapter(() => pending.promise)
		const collector = new MutationCollector(store, new ContemberSchemaMutationAdapter(schema))
		const persister = new BatchPersister(adapter, store, new ActionDispatcher(store), { mutationCollector: collector })
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
		for (const id of ['author-a', 'author-b', 'author-c']) store.setEntityData('Author', id, { id, name: id }, true)
		for (const id of ['tag-a', 'tag-b', 'tag-c']) store.setEntityData('Tag', id, { id, name: id }, true)
		store.getOrCreateRelation('Article', 'a-1', 'author', {
			currentId: 'author-b', serverId: 'author-a', state: 'connected', serverState: 'connected', placeholderData: {},
		})
		store.getOrCreateHasMany('Article', 'a-1', 'tags', ['tag-a'])
		store.connectExistingToHasMany('Article', 'a-1', 'tags', 'tag-b')

		const promise = persister.persist('Article', 'a-1')
		store.setRelation('Article', 'a-1', 'author', { currentId: 'author-c', state: 'connected' })
		store.removeFromHasMany('Article', 'a-1', 'tags', 'tag-b', 'disconnect')
		store.connectExistingToHasMany('Article', 'a-1', 'tags', 'tag-c')
		pending.resolve({ ok: true, data: { id: 'a-1' } })
		expect((await promise).success).toBe(true)

		const author = store.getRelation('Article', 'a-1', 'author')
		expect(author?.serverId).toBe('author-b')
		expect(author?.currentId).toBe('author-c')
		const tags = store.getHasMany('Article', 'a-1', 'tags')
		expect(tags?.serverIds.has('tag-b')).toBe(true)
		expect(tags?.plannedRemovals.get('tag-b')).toBe('disconnect')
		expect(tags?.plannedAdditions.get('tag-c')).toBe('connected')
	})

	test('keeps an early sequential create confirmed across later failure and retry', async () => {
		const store = new SnapshotStore()
		let failSecond = true
		const calls: string[] = []
		const adapter = scalarAdapter(
			() => Promise.resolve({ ok: true }),
			{
				create: (_type, data) => {
					const title = String(data['title'])
					calls.push(title)
					return title === 'Second' && failSecond
						? Promise.resolve({ ok: false, errorMessage: 'second failed' })
						: Promise.resolve({ ok: true, data: { id: `server-${title.toLowerCase()}` } })
				},
			},
		)
		const persister = new BatchPersister(adapter, store, new ActionDispatcher(store))
		const first = store.createEntity('Article', { title: 'First' })
		store.createEntity('Article', { title: 'Second' })

		const failed = await persister.persistAll({ rollbackOnError: true })
		expect(failed.success).toBe(false)
		expect(store.getPersistedId('Article', first)).toBe('server-first')
		failSecond = false
		expect((await persister.persistAll()).success).toBe(true)
		expect(calls.filter(title => title === 'First')).toHaveLength(1)
	})

	test('preflights missing create and delete methods before any request', async () => {
		const store = new SnapshotStore()
		let persistCalls = 0
		const adapter = scalarAdapter(() => {
			persistCalls++
			return Promise.resolve({ ok: true })
		})
		const persister = new BatchPersister(adapter, store, new ActionDispatcher(store))
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
		store.setFieldValue('Article', 'a-1', ['title'], 'Updated')
		store.createEntity('Article', { title: 'Created' })
		store.setEntityData('Article', 'a-2', { id: 'a-2', title: 'Delete' }, true)
		store.scheduleForDeletion('Article', 'a-2')

		const result = await persister.persistAll()
		expect(result.success).toBe(false)
		expect(persistCalls).toBe(0)
	})

	test('does not reconcile an atomic failure even when one entry says ok', async () => {
		const store = new SnapshotStore()
		const adapter = scalarAdapter(
			() => Promise.resolve({ ok: true }),
			{
				persistTransaction: mutations => Promise.resolve({
					ok: false,
					results: mutations.map((mutation, index) => ({
						entityType: mutation.entityType,
						entityId: mutation.entityId,
						ok: index === 0,
						errorMessage: index === 0 ? undefined : 'failed',
					})),
				}),
			},
		)
		const persister = new BatchPersister(adapter, store, new ActionDispatcher(store))
		const callbacks: boolean[] = []
		for (const id of ['a-1', 'a-2']) {
			store.setEntityData('Article', id, { id, title: 'Original' }, true)
			store.setFieldValue('Article', id, ['title'], 'Updated')
		}

		const result = await persister.persistAll({ onEntityPersisted: entry => callbacks.push(entry.success) })
		expect(result.success).toBe(false)
		expect(result.successCount).toBe(0)
		expect(result.failedCount).toBe(2)
		expect(result.results.every(entry => !entry.success)).toBe(true)
		expect(callbacks).toEqual([false, false])
		expect(store.getDirtyFields('Article', 'a-1')).toContain('title')
		expect(store.getDirtyFields('Article', 'a-2')).toContain('title')
	})

	test('removes a confirmed delete but reports a reversal as a conflict', async () => {
		const store = new SnapshotStore()
		const pending = deferred<{ ok: true }>()
		const adapter = scalarAdapter(
			() => Promise.resolve({ ok: true }),
			{ delete: () => pending.promise },
		)
		const persister = new BatchPersister(adapter, store, new ActionDispatcher(store))
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
		store.scheduleForDeletion('Article', 'a-1')
		const promise = persister.persist('Article', 'a-1')
		store.unscheduleForDeletion('Article', 'a-1')
		pending.resolve({ ok: true })

		expect((await promise).success).toBe(false)
		expect(store.getEntitySnapshot('Article', 'a-1')).toBeDefined()
		expect(store.existsOnServer('Article', 'a-1')).toBe(false)

		const secondStore = new SnapshotStore()
		const second = new BatchPersister(
			scalarAdapter(() => Promise.resolve({ ok: true }), { delete: () => Promise.resolve({ ok: true }) }),
			secondStore,
			new ActionDispatcher(secondStore),
		)
		secondStore.setEntityData('Article', 'a-2', { id: 'a-2', title: 'Original' }, true)
		secondStore.scheduleForDeletion('Article', 'a-2')
		expect((await second.persist('Article', 'a-2')).success).toBe(true)
		expect(secondStore.getEntitySnapshot('Article', 'a-2')).toBeUndefined()
	})

	test('rejects relation output from a custom collector before the adapter call', async () => {
		const store = new SnapshotStore()
		let calls = 0
		const collector: MutationDataCollector = {
			collectUpdateData: () => ({ author: { connect: { id: 'author-b' } } }),
		}
		const persister = new BatchPersister(
			scalarAdapter(() => {
				calls++
				return Promise.resolve({ ok: true })
			}),
			store,
			new ActionDispatcher(store),
			{ mutationCollector: collector },
		)
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
		store.getOrCreateRelation('Article', 'a-1', 'author', {
			currentId: 'author-b', serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
		})

		await expect(persister.persist('Article', 'a-1')).rejects.toThrow(/scalar data only/)
		expect(calls).toBe(0)
	})

	test('rejects a custom collector that returns null while relations are dirty', async () => {
		const store = new SnapshotStore()
		let calls = 0
		const collector: MutationDataCollector = { collectUpdateData: () => null }
		const persister = new BatchPersister(
			scalarAdapter(() => {
				calls++
				return Promise.resolve({ ok: true })
			}),
			store,
			new ActionDispatcher(store),
			{ mutationCollector: collector },
		)
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
		store.getOrCreateRelation('Article', 'a-1', 'author', {
			currentId: 'author-b', serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
		})

		await expect(persister.persist('Article', 'a-1')).rejects.toThrow(/scalar data only/)
		expect(calls).toBe(0)
	})

	test('reconciles a nested update only to the sent child value', async () => {
		const store = new SnapshotStore()
		const pending = deferred<{ ok: true; data: Record<string, unknown> }>()
		const collector = new MutationCollector(store, new ContemberSchemaMutationAdapter(schema))
		const persister = new BatchPersister(
			scalarAdapter(() => pending.promise),
			store,
			new ActionDispatcher(store),
			{ mutationCollector: collector },
		)
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
		store.setFieldValue('Article', 'a-1', ['title'], 'Parent sent')
		store.setEntityData('Tag', 'tag-1', { id: 'tag-1', name: 'Original' }, true)
		store.getOrCreateHasMany('Article', 'a-1', 'tags', ['tag-1'])
		store.setFieldValue('Tag', 'tag-1', ['name'], 'Child sent')

		const promise = persister.persist('Article', 'a-1')
		store.setFieldValue('Tag', 'tag-1', ['name'], 'Child newer')
		pending.resolve({ ok: true, data: { id: 'a-1', title: 'Parent sent', tags: [{ id: 'tag-1', name: 'Child sent' }] } })
		expect((await promise).success).toBe(true)

		expect(field(store, 'Tag', 'tag-1', 'name')).toBe('Child newer')
		expect(store.getEntitySnapshot<Record<string, unknown>>('Tag', 'tag-1')?.serverData['name']).toBe('Child sent')
		expect(store.getDirtyFields('Tag', 'tag-1')).toContain('name')
		expect(store.getEntitySnapshot<Record<string, unknown>>('Article', 'a-1')?.serverData['tags']).toBeUndefined()
	})

	test('continues reconciliation and rekey after a relation conflict', async () => {
		const store = new SnapshotStore()
		const firstResponse = deferred<{ ok: true; data: Record<string, unknown> }>()
		const calls: Record<string, unknown>[] = []
		let attempt = 0
		const adapter = scalarAdapter((_type, _id, changes) => {
			calls.push(changes)
			attempt++
			return attempt === 1
				? firstResponse.promise
				: Promise.resolve({ ok: true, data: { id: 'a-1', author: { id: 'author-a' }, tags: [{ id: 'tag-server' }] } })
		})
		const collector = new MutationCollector(store, new ContemberSchemaMutationAdapter(schema))
		const persister = new BatchPersister(adapter, store, new ActionDispatcher(store), { mutationCollector: collector })
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
		store.setEntityData('Author', 'author-a', { id: 'author-a', name: 'Author' }, true)
		store.getOrCreateRelation('Article', 'a-1', 'author', {
			currentId: 'author-a', serverId: 'author-a', state: 'deleted', serverState: 'connected', placeholderData: {},
		})
		store.getOrCreateHasMany('Article', 'a-1', 'tags', [])
		const tag = store.createEntity('Tag', { name: 'New tag' })
		store.addToHasMany('Article', 'a-1', 'tags', tag)

		const first = persister.persist('Article', 'a-1')
		store.setRelation('Article', 'a-1', 'author', { currentId: 'author-a', state: 'connected' })
		firstResponse.resolve({ ok: true, data: { id: 'a-1', tags: [{ id: 'tag-server', name: 'New tag' }] } })
		expect((await first).success).toBe(false)
		expect(store.getPersistedId('Tag', tag)).toBe('tag-server')
		expect(store.getHasMany('Article', 'a-1', 'tags')?.serverIds.has('tag-server')).toBe(true)

		expect((await persister.persist('Article', 'a-1')).success).toBe(true)
		expect(JSON.stringify(calls[1])).not.toContain('New tag')
	})
})
