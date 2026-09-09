// Regression test for https://github.com/contember/bindx/issues/91 — the has-one twin.
//
// A has-one target marked `deleted` is removed by the nested `{ delete: true }` in its
// parent's update, so a standalone `update` of that target would hit a row that no
// longer exists, exactly like the has-many case.
import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	BatchPersister,
	MutationCollector,
	ContemberSchemaMutationAdapter,
	type BackendAdapter,
	type SchemaNames,
} from '@contember/bindx'

const testSchema: SchemaNames = {
	entities: {
		Page: {
			name: 'Page',
			scalars: ['id', 'title'],
			fields: {
				id: { type: 'column' },
				title: { type: 'column' },
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
		query: mock(() => Promise.resolve([])),
		persist: mock((entityType: string, entityId: string, changes: Record<string, unknown>) => {
			calls.push({ entityType, entityId, changes })
			return Promise.resolve({ ok: true, data: { id: entityId } })
		}),
		create: mock((_entityType: string, data: Record<string, unknown>) => Promise.resolve({ ok: true, data: { id: 'created-1', ...data } })),
		delete: mock(() => Promise.resolve({ ok: true })),
	}
}

describe('BatchPersister — has-one target marked deleted', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let calls: PersistCall[]
	let persister: BatchPersister

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
		calls = []
		persister = new BatchPersister(createAdapter(calls), store, dispatcher, {
			mutationCollector: new MutationCollector(store, new ContemberSchemaMutationAdapter(testSchema)),
		})

		store.setEntityData('Page', 'page-1', { id: 'page-1', title: 'Page' }, true)
		store.setEntityData('Block', 'block-1', { id: 'block-1', title: 'Block' }, true)
		store.getOrCreateRelation('Page', 'page-1', 'cover', {
			currentId: 'block-1',
			serverId: 'block-1',
			state: 'connected',
			serverState: 'connected',
			placeholderData: {},
		})
	})

	test('should not emit a standalone update for a dirty target that is marked deleted', async () => {
		store.setFieldValue('Block', 'block-1', ['title'], 'Edited')
		store.setRelation('Page', 'page-1', 'cover', { state: 'deleted' })

		const result = await persister.persistAll()

		expect(calls.filter(call => call.entityType === 'Block')).toEqual([])
		const pageCall = calls.find(call => call.entityType === 'Page')
		expect(pageCall?.changes).toEqual({ cover: { delete: true } })
		expect(result.success).toBe(true)
	})

	test('should drop a target deleted through its parent from the store', async () => {
		store.setFieldValue('Block', 'block-1', ['title'], 'Edited')
		store.setRelation('Page', 'page-1', 'cover', { state: 'deleted' })

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(store.getEntitySnapshot('Block', 'block-1')).toBeUndefined()
		expect(store.getAllDirtyEntities()).toEqual([])
	})

	test('should keep the standalone update of a target that is only disconnected', async () => {
		store.setFieldValue('Block', 'block-1', ['title'], 'Edited')
		store.setRelation('Page', 'page-1', 'cover', { state: 'disconnected', currentId: null })

		const result = await persister.persistAll()

		// The row survives a disconnect, so its scalar edit still has to be written.
		const blockCall = calls.find(call => call.entityType === 'Block')
		expect(blockCall?.changes).toEqual({ title: 'Edited' })
		expect(store.getEntitySnapshot('Block', 'block-1')).toBeDefined()
		expect(result.success).toBe(true)
	})

	test('should keep the target vetoable and suppress the parent-side delete', async () => {
		store.setFieldValue('Block', 'block-1', ['title'], 'Edited')
		store.setRelation('Page', 'page-1', 'cover', { state: 'deleted' })
		dispatcher.getEventEmitter().interceptEntity('entity:persisting', 'Block', 'block-1', () => ({
			action: 'cancel',
		}))

		const result = await persister.persistAll()

		expect(result.skippedCount).toBe(1)
		expect(calls).toEqual([])
		expect(store.getEntitySnapshot('Block', 'block-1')).toBeDefined()
	})
})
