/**
 * A parent-side delete dropped for a vetoed item must stay planned after the parent's
 * successful persist, so a later persist still sends it.
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
 * A vetoed parent-side delete is dropped from the mutation, yet the parent is still
 * committed on success — the planned removal moves into serverIds, so the item is
 * gone from the client list although the server still has it and no delete was sent.
 */
describe('vetoed parent-side delete is committed anyway', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let calls: PersistCall[]
	let persister: BatchPersister
	let liftVeto: () => void

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
		calls = []
		persister = new BatchPersister(createAdapter(calls), store, dispatcher, {
			mutationCollector: new MutationCollector(store, new ContemberSchemaMutationAdapter(schema)),
		})

		store.setEntityData('Page', 'page-1', { id: 'page-1', title: 'Page' }, true)
		store.setEntityData('Block', 'block-1', { id: 'block-1', title: 'Block' }, true)
		store.getOrCreateHasMany('Page', 'page-1', 'blocks', ['block-1'])
		// The page has an unrelated change, so its mutation is sent and committed.
		store.setFieldValue('Page', 'page-1', ['title'], 'Edited page')
		store.setFieldValue('Block', 'block-1', ['title'], 'Edited block')
		store.planHasManyRemoval('Page', 'page-1', 'blocks', 'block-1', 'delete')

		liftVeto = dispatcher.getEventEmitter().interceptEntity('entity:persisting', 'Block', 'block-1', () => ({
			action: 'cancel',
		}))
	})

	test('the removal stays pending when its delete was not sent', async () => {
		await persister.persistAll()

		const pageCall = calls.find(call => call.entityType === 'Page')
		expect(pageCall?.changes).toEqual({ title: 'Edited page' })

		const hasMany = store.getHasMany('Page', 'page-1', 'blocks')
		expect(hasMany?.serverIds).toContain('block-1')
		expect([...(hasMany?.plannedRemovals.keys() ?? [])]).toContain('block-1')
	})

	test('a later persist still sends the delete once the veto is gone', async () => {
		await persister.persistAll()
		calls.length = 0
		liftVeto()

		await persister.persistAll()

		const pageCall = calls.find(call => call.entityType === 'Page')
		expect(pageCall?.changes['blocks']).toEqual([{ delete: { id: 'block-1' }, alias: 'block-1' }])
	})
})
