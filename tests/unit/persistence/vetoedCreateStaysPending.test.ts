/**
 * A nested create dropped for a vetoed child must stay planned on the parent after the
 * parent's successful persist, so a later persist still links the child.
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
			return Promise.resolve({
				ok: true,
				data: { id: entityId, blocks: [{ id: 'block-server-1', title: 'Draft block' }] },
			})
		},
		create: (entityType, data) => {
			calls.push({ entityType, entityId: '<new>', changes: data })
			return Promise.resolve({ ok: true, data: { id: 'created-1', ...data } })
		},
		delete: () => Promise.resolve({ ok: true }),
	}
}

/**
 * A vetoed nested create is dropped from its parent's mutation, but the parent is
 * still committed on success — including the planned addition that was never sent.
 * The link must survive as pending so the next persist still creates the child.
 */
describe('vetoed nested create keeps its parent link pending', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let calls: PersistCall[]
	let persister: BatchPersister
	let blockId: string
	let removeVeto: () => void

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
		calls = []
		persister = new BatchPersister(createAdapter(calls), store, dispatcher, {
			mutationCollector: new MutationCollector(store, new ContemberSchemaMutationAdapter(schema)),
		})

		store.setEntityData('Page', 'page-1', { id: 'page-1', title: 'Original' }, true)
		store.getOrCreateHasMany('Page', 'page-1', 'blocks', [])
		store.setFieldValue('Page', 'page-1', ['title'], 'Updated title')
		blockId = store.createEntity('Block', { title: 'Draft block' })
		store.addToHasMany('Page', 'page-1', 'blocks', blockId)

		removeVeto = dispatcher.getEventEmitter().interceptEntity(
			'entity:persisting', 'Block', blockId, () => ({ action: 'cancel' }),
		)
	})

	test('the temp id is not committed into the parent server list', async () => {
		await persister.persistAll()

		const hasMany = store.getHasMany('Page', 'page-1', 'blocks')
		expect(hasMany?.serverIds).not.toContain(blockId)
		expect([...(hasMany?.plannedAdditions.keys() ?? [])]).toContain(blockId)
	})

	test('has-one: the vetoed create is not committed as the connected server target', async () => {
		store.getOrCreateRelation('Page', 'page-1', 'cover', {
			currentId: null,
			serverId: null,
			state: 'disconnected',
			serverState: 'disconnected',
			placeholderData: {},
		})
		const coverId = store.createEntity('Block', { title: 'New cover' })
		store.setRelation('Page', 'page-1', 'cover', { currentId: coverId, state: 'connected' })
		dispatcher.getEventEmitter().interceptEntity('entity:persisting', 'Block', coverId, () => ({
			action: 'cancel',
		}))

		await persister.persistAll()

		const relation = store.getRelation('Page', 'page-1', 'cover')
		expect(relation?.serverId).toBeNull()
	})

	test('a later persist still sends the create for the un-vetoed child', async () => {
		await persister.persistAll()
		removeVeto()
		calls.length = 0

		await persister.persistAll()

		// The child must reach the server *attached to its parent*: either nested in the
		// page mutation, or as a create plus a connect on the page.
		const pageCall = calls.find(call => call.entityType === 'Page')
		expect(pageCall?.changes['blocks']).toBeDefined()
	})
})
