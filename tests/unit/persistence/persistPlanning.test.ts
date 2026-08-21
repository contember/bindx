import { describe, expect, test } from 'bun:test'
import {
	ActionDispatcher,
	BatchPersister,
	ContemberSchemaMutationAdapter,
	MutationCollector,
	SnapshotStore,
	UndoManager,
	type BackendAdapter,
	type SchemaNames,
} from '@contember/bindx'

const schema: SchemaNames = {
	entities: {
		Page: {
			name: 'Page',
			scalars: ['id', 'title'],
			fields: {
				id: { type: 'column' },
				title: { type: 'column' },
				blocks: { type: 'many', entity: 'Block' },
			},
		},
		Block: {
			name: 'Block',
			scalars: ['id', 'title'],
			fields: {
				id: { type: 'column' },
				title: { type: 'column' },
				link: { type: 'one', entity: 'Link' },
			},
		},
		Link: {
			name: 'Link',
			scalars: ['id', 'url'],
			fields: { id: { type: 'column' }, url: { type: 'column' } },
		},
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

function createPersister(store: SnapshotStore, dispatcher: ActionDispatcher, adapter: BackendAdapter, undoManager?: UndoManager): BatchPersister {
	return new BatchPersister(adapter, store, dispatcher, {
		mutationCollector: new MutationCollector(store, new ContemberSchemaMutationAdapter(schema)),
		undoManager,
	})
}

function seedTree(store: SnapshotStore, pageId: string): { blockId: string; linkId: string } {
	store.setEntityData('Page', pageId, { id: pageId, title: 'Original' }, true)
	store.getOrCreateHasMany('Page', pageId, 'blocks', [])
	const blockId = store.createEntity('Block', { title: `Block ${pageId}` })
	const linkId = store.createEntity('Link', { url: `https://${pageId}.example` })
	store.getOrCreateRelation('Block', blockId, 'link', {
		currentId: linkId,
		serverId: null,
		state: 'connected',
		serverState: 'disconnected',
		placeholderData: {},
	})
	store.addToHasMany('Page', pageId, 'blocks', blockId)
	return { blockId, linkId }
}

describe('persist planning and collector sessions', () => {
	test('discovers nested hooks monotonically and includes accepted late writes', async () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		const tree = seedTree(store, 'page-1')
		const response = deferred<{ ok: true; data: Record<string, unknown> }>()
		const called = deferred<Record<string, unknown>>()
		const adapter: BackendAdapter = {
			query: () => Promise.resolve([]),
			persist: (_type, _id, changes) => {
				called.resolve(changes)
				return response.promise
			},
			create: () => Promise.resolve({ ok: true, data: { id: 'unused' } }),
			delete: () => Promise.resolve({ ok: true }),
		}
		const persister = createPersister(store, dispatcher, adapter)
		let blockHooks = 0
		let linkHooks = 0
		dispatcher.getEventEmitter().interceptEntity('entity:persisting', 'Block', tree.blockId, () => {
			blockHooks++
			expect(store.isPersisting('Block', tree.blockId)).toBe(true)
			store.setFieldValue('Block', tree.blockId, ['title'], 'Normalized')
			return { action: 'continue' }
		})
		dispatcher.getEventEmitter().interceptEntity('entity:persisting', 'Link', tree.linkId, () => {
			linkHooks++
			expect(store.isPersisting('Link', tree.linkId)).toBe(true)
			return { action: 'continue' }
		})

		const promise = persister.persist('Page', 'page-1')
		const changes = await called.promise
		expect(JSON.stringify(changes)).toContain('Normalized')
		store.setFieldValue('Block', tree.blockId, ['title'], 'Newer')
		response.resolve({
			ok: true,
			data: {
				id: 'page-1',
				blocks: [{
					id: 'block-server',
					title: 'Normalized',
					link: { id: 'link-server', url: 'https://page-1.example' },
				}],
			},
		})

		expect((await promise).success).toBe(true)
		expect(blockHooks).toBe(1)
		expect(linkHooks).toBe(1)
		expect(store.getEntitySnapshot<Record<string, unknown>>('Block', 'block-server')?.data['title']).toBe('Newer')
		expect(store.getEntitySnapshot<Record<string, unknown>>('Block', 'block-server')?.serverData['title']).toBe('Normalized')
		expect(store.getDirtyFields('Block', 'block-server')).toContain('title')
	})

	test('reports a late nested veto as skipped and never emits persisted success', async () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		const tree = seedTree(store, 'page-1')
		let changes: Record<string, unknown> | undefined
		const adapter: BackendAdapter = {
			query: () => Promise.resolve([]),
			persist: (_type, _id, data) => {
				changes = data
				return Promise.resolve({
					ok: true,
					data: { id: 'page-1', blocks: [{ id: 'block-server', title: 'Block page-1' }] },
				})
			},
			create: () => Promise.resolve({ ok: true, data: { id: 'unused' } }),
			delete: () => Promise.resolve({ ok: true }),
		}
		const persisted: string[] = []
		dispatcher.getEventEmitter().on('entity:persisted', event => persisted.push(event.entityId))
		dispatcher.getEventEmitter().interceptEntity('entity:persisting', 'Link', tree.linkId, () => ({ action: 'cancel' }))

		const result = await createPersister(store, dispatcher, adapter).persistAll()
		const skipped = result.results.find(entry => entry.entityId === tree.linkId)
		expect(skipped?.skipped).toBe(true)
		expect(persisted).not.toContain(tree.linkId)
		expect(JSON.stringify(changes)).not.toContain('https://page-1.example')
	})

	test('keeps concurrent collector sessions isolated and undo blocked until both settle', async () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		const undo = new UndoManager(store, { debounceMs: 0 })
		const firstTree = seedTree(store, 'page-1')
		const secondTree = seedTree(store, 'page-2')
		const pending = new Map<string, Deferred<{ ok: true; data: Record<string, unknown> }>>()
		const adapter: BackendAdapter = {
			query: () => Promise.resolve([]),
			persist: (_type, id) => {
				const request = deferred<{ ok: true; data: Record<string, unknown> }>()
				pending.set(id, request)
				return request.promise
			},
			create: () => Promise.resolve({ ok: true, data: { id: 'unused' } }),
			delete: () => Promise.resolve({ ok: true }),
		}
		const persister = createPersister(store, dispatcher, adapter, undo)

		const first = persister.persist('Page', 'page-1')
		const second = persister.persist('Page', 'page-2')
		expect(undo.getState().isBlocked).toBe(true)
		pending.get('page-1')?.resolve({
			ok: true,
			data: {
				id: 'page-1',
				blocks: [{
					id: 'block-server-1', title: 'Block page-1',
					link: { id: 'link-server-1', url: 'https://page-1.example' },
				}],
			},
		})
		expect((await first).success).toBe(true)
		expect(undo.getState().isBlocked).toBe(true)
		pending.get('page-2')?.resolve({
			ok: true,
			data: {
				id: 'page-2',
				blocks: [{
					id: 'block-server-2', title: 'Block page-2',
					link: { id: 'link-server-2', url: 'https://page-2.example' },
				}],
			},
		})
		expect((await second).success).toBe(true)
		expect(undo.getState().isBlocked).toBe(false)
		expect(store.getPersistedId('Block', firstTree.blockId)).toBe('block-server-1')
		expect(store.getPersistedId('Link', firstTree.linkId)).toBe('link-server-1')
		expect(store.getPersistedId('Block', secondTree.blockId)).toBe('block-server-2')
		expect(store.getPersistedId('Link', secondTree.linkId)).toBe('link-server-2')
	})

	test('fails safely when a temp nested create has no returned ID', async () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		const tree = seedTree(store, 'page-1')
		const adapter: BackendAdapter = {
			query: () => Promise.resolve([]),
			persist: () => Promise.resolve({
				ok: true,
				data: {
					id: 'page-1',
					blocks: [{ title: 'Block page-1', link: { url: 'https://page-1.example' } }],
				},
			}),
			create: () => Promise.resolve({ ok: true, data: { id: 'unused' } }),
			delete: () => Promise.resolve({ ok: true }),
		}

		const result = await createPersister(store, dispatcher, adapter).persist('Page', 'page-1')
		expect(result.success).toBe(false)
		expect(store.getPersistedId('Block', tree.blockId)).toBeNull()
		expect(store.existsOnServer('Block', tree.blockId)).toBe(false)
	})

	test('accepts a client-assigned nested ID without a returned ID', async () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		store.setEntityData('Page', 'page-1', { id: 'page-1', title: 'Original' }, true)
		store.getOrCreateHasMany('Page', 'page-1', 'blocks', [])
		const blockId = store.createEntity('Block', { id: 'client-block', title: 'Stable' })
		store.addToHasMany('Page', 'page-1', 'blocks', blockId)
		const adapter: BackendAdapter = {
			query: () => Promise.resolve([]),
			persist: () => Promise.resolve({ ok: true, data: { id: 'page-1', blocks: [{ title: 'Stable' }] } }),
			create: () => Promise.resolve({ ok: true, data: { id: 'unused' } }),
			delete: () => Promise.resolve({ ok: true }),
		}

		expect((await createPersister(store, dispatcher, adapter).persist('Page', 'page-1')).success).toBe(true)
		expect(store.existsOnServer('Block', blockId)).toBe(true)
		expect(store.getEntitySnapshot<Record<string, unknown>>('Block', blockId)?.id).toBe('client-block')
	})

	test('maps the sent has-one child when the live relation switches while pending', async () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		store.setEntityData('Block', 'block-1', { id: 'block-1', title: 'Block' }, true)
		const sentLink = store.createEntity('Link', { url: 'https://sent.example' })
		store.getOrCreateRelation('Block', 'block-1', 'link', {
			currentId: sentLink, serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
		})
		const pending = deferred<{ ok: true; data: Record<string, unknown> }>()
		const adapter: BackendAdapter = {
			query: () => Promise.resolve([]),
			persist: () => pending.promise,
			create: () => Promise.resolve({ ok: true, data: { id: 'unused' } }),
			delete: () => Promise.resolve({ ok: true }),
		}
		const persister = createPersister(store, dispatcher, adapter)
		const promise = persister.persist('Block', 'block-1')
		const newerLink = store.createEntity('Link', { url: 'https://newer.example' })
		store.setRelation('Block', 'block-1', 'link', { currentId: newerLink, state: 'connected' })
		pending.resolve({ ok: true, data: { id: 'block-1', link: { id: 'link-server', url: 'https://sent.example' } } })

		expect((await promise).success).toBe(true)
		expect(store.getPersistedId('Link', sentLink)).toBe('link-server')
		expect(store.getPersistedId('Link', newerLink)).toBeNull()
		const relation = store.getRelation('Block', 'block-1', 'link')
		expect(relation?.serverId).toBe('link-server')
		expect(relation?.currentId).toBe(newerLink)
	})

	test('reconciles resolved siblings and retries only the unresolved create', async () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		store.setEntityData('Page', 'page-1', { id: 'page-1', title: 'Page' }, true)
		store.getOrCreateHasMany('Page', 'page-1', 'blocks', [])
		const resolved = store.createEntity('Block', { title: 'Resolved' })
		const unresolved = store.createEntity('Block', { title: 'Unresolved' })
		store.addToHasMany('Page', 'page-1', 'blocks', resolved)
		store.addToHasMany('Page', 'page-1', 'blocks', unresolved)
		const calls: Record<string, unknown>[] = []
		let attempt = 0
		const adapter: BackendAdapter = {
			query: () => Promise.resolve([]),
			persist: (_type, _id, data) => {
				calls.push(data)
				attempt++
				return Promise.resolve({
					ok: true,
					data: attempt === 1
						? { id: 'page-1', blocks: [{ id: 'block-resolved', title: 'Resolved' }, { title: 'Unresolved' }] }
						: { id: 'page-1', blocks: [{ id: 'block-unresolved', title: 'Unresolved' }] },
				})
			},
			create: () => Promise.resolve({ ok: true, data: { id: 'unused' } }),
			delete: () => Promise.resolve({ ok: true }),
		}
		const persister = createPersister(store, dispatcher, adapter)

		expect((await persister.persist('Page', 'page-1')).success).toBe(false)
		expect(store.getPersistedId('Block', resolved)).toBe('block-resolved')
		expect(store.getPersistedId('Block', unresolved)).toBeNull()
		expect((await persister.persist('Page', 'page-1')).success).toBe(true)
		expect(JSON.stringify(calls[1])).not.toContain('Resolved')
		expect(store.getPersistedId('Block', unresolved)).toBe('block-unresolved')
	})

	test('fails deterministically when two nested types share one wire alias', async () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		store.setEntityData('Page', 'page-1', { id: 'page-1', title: 'Page' }, true)
		store.getOrCreateHasMany('Page', 'page-1', 'blocks', [])
		const sharedId = '__temp_shared'
		store.createEntity('Block', { id: sharedId, title: 'Block' })
		store.createEntity('Link', { id: sharedId, url: 'https://link.example' })
		store.getOrCreateRelation('Block', sharedId, 'link', {
			currentId: sharedId, serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
		})
		store.addToHasMany('Page', 'page-1', 'blocks', sharedId)
		const adapter: BackendAdapter = {
			query: () => Promise.resolve([]),
			persist: () => Promise.resolve({
				ok: true,
				data: {
					id: 'page-1',
					blocks: [{ id: 'block-server', title: 'Block', link: { id: 'link-server', url: 'https://link.example' } }],
				},
			}),
			create: () => Promise.resolve({ ok: true, data: { id: 'unused' } }),
			delete: () => Promise.resolve({ ok: true }),
		}

		const result = await createPersister(store, dispatcher, adapter).persist('Page', 'page-1')
		expect(result.success).toBe(false)
		expect(store.getPersistedId('Block', sharedId)).toBeNull()
		expect(store.getPersistedId('Link', sharedId)).toBeNull()
		expect(result.error?.message).toContain('Block:__temp_shared')
		expect(result.error?.message).toContain('Link:__temp_shared')
	})

	test('accepts an Unknown adapter type when the nested alias has one expected type', async () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		store.setEntityData('Page', 'page-1', { id: 'page-1', title: 'Page' }, true)
		store.getOrCreateHasMany('Page', 'page-1', 'blocks', [])
		const blockId = store.createEntity('Block', { title: 'Block' })
		store.addToHasMany('Page', 'page-1', 'blocks', blockId)
		const adapter: BackendAdapter = {
			query: () => Promise.resolve([]),
			persist: () => Promise.resolve({ ok: true }),
			persistTransaction: mutations => Promise.resolve({
				ok: true,
				results: mutations.map(mutation => ({
					entityType: mutation.entityType,
					entityId: mutation.entityId,
					ok: true,
					nestedResults: [{
						entityType: 'Unknown',
						entityId: blockId,
						ok: true,
						persistedId: 'block-server',
					}],
				})),
			}),
			create: () => Promise.resolve({ ok: true, data: { id: 'unused' } }),
			delete: () => Promise.resolve({ ok: true }),
		}

		expect((await createPersister(store, dispatcher, adapter).persist('Page', 'page-1')).success).toBe(true)
		expect(store.getPersistedId('Block', blockId)).toBe('block-server')
	})
})
