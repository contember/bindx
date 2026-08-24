import { beforeEach, describe, expect, test } from 'bun:test'
import {
	ActionDispatcher,
	BatchPersister,
	ContemberSchemaMutationAdapter,
	MutationCollector,
	SnapshotStore,
	type BackendAdapter,
	type EntityPersistedEvent,
	type EntityPersistFailedEvent,
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

interface PersistCall {
	readonly entityType: string
	readonly entityId: string
	readonly changes: Record<string, unknown>
}

function createAdapter(calls: PersistCall[], failWith?: string): BackendAdapter {
	return {
		query: () => Promise.resolve([]),
		persist: (entityType, entityId, changes) => {
			calls.push({ entityType, entityId, changes })
			if (failWith) return Promise.resolve({ ok: false, errorMessage: failWith })
			return Promise.resolve({
				ok: true,
				data: {
					id: entityId,
					title: changes['title'],
					blocks: [{ id: 'block-1', title: 'Draft block' }],
				},
			})
		},
		create: (_entityType, data) => Promise.resolve({ ok: true, data: { id: 'created-1', ...data } }),
		delete: () => Promise.resolve({ ok: true }),
	}
}

describe('nested persist lifecycle', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let blockId: string

	function createPersister(calls: PersistCall[], failWith?: string): BatchPersister {
		const schemaAdapter = new ContemberSchemaMutationAdapter(schema)
		return new BatchPersister(createAdapter(calls, failWith), store, dispatcher, {
			mutationCollector: new MutationCollector(store, schemaAdapter),
		})
	}

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)

		store.setEntityData('Page', 'page-1', { id: 'page-1', title: 'Original title' }, true)
		store.getOrCreateHasMany('Page', 'page-1', 'blocks', [])
		store.setFieldValue('Page', 'page-1', ['title'], 'Updated title')

		blockId = store.createEntity('Block', { title: 'Draft block' })
		store.addToHasMany('Page', 'page-1', 'blocks', blockId)
	})

	test('does not include a vetoed nested create in its parent mutation', async () => {
		const calls: PersistCall[] = []
		const persister = createPersister(calls)
		dispatcher.getEventEmitter().interceptEntity('entity:persisting', 'Block', blockId, () => ({
			action: 'cancel',
		}))

		const result = await persister.persistAll()

		expect(calls).toHaveLength(1)
		expect(calls[0]?.changes).toEqual({ title: 'Updated title' })
		expect(result.success).toBe(false)
		expect(result.successCount).toBe(1)
		expect(result.skippedCount).toBe(1)
		expect(store.existsOnServer('Block', blockId)).toBe(false)
		expect(store.getAllDirtyEntities()).toContainEqual({
			entityType: 'Block',
			entityId: blockId,
			changeType: 'create',
		})
	})

	test('emits entity:persisted for a successful nested create', async () => {
		const events: EntityPersistedEvent[] = []
		dispatcher.getEventEmitter().on('entity:persisted', event => events.push(event))
		const persister = createPersister([])

		expect((await persister.persistAll()).success).toBe(true)

		expect(store.getPersistedId('Block', blockId)).toBe('block-1')
		expect(events.find(event => event.entityId === blockId)).toMatchObject({
			entityType: 'Block',
			isNew: true,
			persistedId: 'block-1',
		})
	})

	test('emits entity:persistFailed for a failed nested create', async () => {
		const events: EntityPersistFailedEvent[] = []
		dispatcher.getEventEmitter().on('entity:persistFailed', event => events.push(event))
		const persister = createPersister([], 'Server rejected the page')

		expect((await persister.persistAll()).success).toBe(false)

		const nestedFailure = events.find(event => event.entityId === blockId)
		expect(nestedFailure).toMatchObject({ entityType: 'Block', isNew: true })
		expect(nestedFailure?.error.message).toBe('Server rejected the page')
	})
})
