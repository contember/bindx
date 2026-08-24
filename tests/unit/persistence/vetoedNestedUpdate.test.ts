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
				cover: { type: 'one', entity: 'Block' },
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

function createAdapter(calls: PersistCall[]): BackendAdapter {
	return {
		query: () => Promise.resolve([]),
		persist: (entityType, entityId, changes) => {
			calls.push({ entityType, entityId, changes })
			return Promise.resolve({ ok: true, data: { id: entityId } })
		},
		create: (_entityType, data) => Promise.resolve({ ok: true, data: { id: 'created-1', ...data } }),
		delete: () => Promise.resolve({ ok: true }),
	}
}

/**
 * An entity vetoed by an `entity:persisting` interceptor must not be written at all —
 * not even as a nested update inside an accepted parent's mutation.
 */
describe('vetoed entity nested update', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let calls: PersistCall[]
	let persister: BatchPersister

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
		calls = []
		persister = new BatchPersister(createAdapter(calls), store, dispatcher, {
			mutationCollector: new MutationCollector(store, new ContemberSchemaMutationAdapter(schema)),
		})
		store.setEntityData('Page', 'page-1', { id: 'page-1', title: 'Page' }, true)
		store.setEntityData('Block', 'block-1', { id: 'block-1', title: 'Block' }, true)
		store.setFieldValue('Page', 'page-1', ['title'], 'Edited page')
		store.setFieldValue('Block', 'block-1', ['title'], 'Edited block')
		dispatcher.getEventEmitter().interceptEntity('entity:persisting', 'Block', 'block-1', () => ({
			action: 'cancel',
		}))
	})

	test('has-many: a vetoed server item is not updated through its parent', async () => {
		store.getOrCreateHasMany('Page', 'page-1', 'blocks', ['block-1'])

		const result = await persister.persistAll()

		expect(result.skippedCount).toBe(1)
		expect(calls).toHaveLength(1)
		expect(calls[0]?.changes).toEqual({ title: 'Edited page' })
	})

	test('has-one: a vetoed connected target is not updated through its parent', async () => {
		store.getOrCreateRelation('Page', 'page-1', 'cover', {
			currentId: 'block-1',
			serverId: 'block-1',
			state: 'connected',
			serverState: 'connected',
			placeholderData: {},
		})

		const result = await persister.persistAll()

		expect(result.skippedCount).toBe(1)
		expect(calls).toHaveLength(1)
		expect(calls[0]?.changes).toEqual({ title: 'Edited page' })
	})
})
