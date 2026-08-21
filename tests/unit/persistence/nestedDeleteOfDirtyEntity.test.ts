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
			return Promise.resolve({ ok: true, data: { id: entityId, ...changes } })
		},
		create: (_entityType, data) => Promise.resolve({ ok: true, data: { id: 'created-1', ...data } }),
		delete: () => Promise.resolve({ ok: true }),
	}
}

/**
 * A relation-level delete lives on the parent mutation. The deleted entity may
 * also be dirty in its own right (edited before it was removed), which gives it
 * a top-level update and puts it on the collector's excluded list — that list
 * must only suppress its nested *update*, never the parent-side delete.
 */
describe('nested delete of a dirty entity', () => {
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
	})

	test('has-many: an edited item removed with delete is still deleted', async () => {
		store.getOrCreateHasMany('Page', 'page-1', 'blocks', ['block-1'])
		store.setFieldValue('Block', 'block-1', ['title'], 'Edited')
		store.planHasManyRemoval('Page', 'page-1', 'blocks', 'block-1', 'delete')

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		const pageCall = calls.find(call => call.entityType === 'Page')
		expect(pageCall?.changes).toEqual({
			blocks: [{ delete: { id: 'block-1' }, alias: 'block-1' }],
		})
	})

	test('has-one: an edited target marked deleted is still deleted', async () => {
		store.getOrCreateRelation('Page', 'page-1', 'cover', {
			currentId: 'block-1',
			serverId: 'block-1',
			state: 'connected',
			serverState: 'connected',
			placeholderData: {},
		})
		store.setFieldValue('Block', 'block-1', ['title'], 'Edited')
		store.setRelation('Page', 'page-1', 'cover', { state: 'deleted' })

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		const pageCall = calls.find(call => call.entityType === 'Page')
		expect(pageCall?.changes).toEqual({ cover: { delete: true } })
	})

	test('a vetoed entity is not deleted through its parent either', async () => {
		store.getOrCreateHasMany('Page', 'page-1', 'blocks', ['block-1'])
		store.setFieldValue('Block', 'block-1', ['title'], 'Edited')
		store.planHasManyRemoval('Page', 'page-1', 'blocks', 'block-1', 'delete')
		dispatcher.getEventEmitter().interceptEntity('entity:persisting', 'Block', 'block-1', () => ({
			action: 'cancel',
		}))

		const result = await persister.persistAll()

		expect(result.skippedCount).toBe(1)
		expect(calls).toEqual([])
	})
})
