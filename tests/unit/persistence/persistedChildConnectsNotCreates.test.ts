/**
 * A child created on its own (its parent create was vetoed) must be connected, not
 * created again, when the parent finally goes out.
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import {
	ActionDispatcher,
	BatchPersister,
	ContemberSchemaMutationAdapter,
	MutationCollector,
	SnapshotStore,
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
			},
		},
	},
	enums: {},
}

interface CreateCall {
	readonly entityType: string
	readonly data: Record<string, unknown>
}

function createAdapter(creates: CreateCall[]): BackendAdapter {
	let counter = 0
	return {
		query: () => Promise.resolve([]),
		persist: (entityType, entityId) => Promise.resolve({ ok: true, data: { id: entityId } }),
		create: (entityType, data) => {
			creates.push({ entityType, data })
			counter++
			return Promise.resolve({ ok: true, data: { id: `${entityType.toLowerCase()}-server-${counter}`, ...data } })
		},
		delete: () => Promise.resolve({ ok: true }),
	}
}

/**
 * Vetoing the parent create leaves its child create in the batch. The child is then
 * sent standalone (it is no longer a nested create), so the next persist of the
 * now-accepted parent must CONNECT that child, not create a second copy of it.
 */
describe('vetoed parent create with an accepted child', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let creates: CreateCall[]
	let persister: BatchPersister
	let pageId: string
	let blockId: string
	let removeVeto: () => void

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
		creates = []
		persister = new BatchPersister(createAdapter(creates), store, dispatcher, {
			mutationCollector: new MutationCollector(store, new ContemberSchemaMutationAdapter(schema)),
		})

		pageId = store.createEntity('Page', { title: 'New page' })
		blockId = store.createEntity('Block', { title: 'New block' })
		store.getOrCreateHasMany('Page', pageId, 'blocks', [])
		store.addToHasMany('Page', pageId, 'blocks', blockId)

		removeVeto = dispatcher.getEventEmitter().interceptEntity(
			'entity:persisting', 'Page', pageId, () => ({ action: 'cancel' }),
		)
	})

	test('the child is created exactly once across both persists', async () => {
		await persister.persistAll()
		removeVeto()
		await persister.persistAll()

		const blockCreates = creates.filter(call => call.entityType === 'Block')
		const nestedBlockCreates = creates
			.filter(call => call.entityType === 'Page')
			.flatMap(call => (Array.isArray(call.data['blocks']) ? call.data['blocks'] : []))
			.filter(op => typeof op === 'object' && op !== null && 'create' in op)

		expect(blockCreates.length + nestedBlockCreates.length).toBe(1)
	})
})
