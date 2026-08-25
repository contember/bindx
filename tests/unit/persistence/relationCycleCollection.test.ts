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

/**
 * `Page.publishedRevision` and `Revision.page` point back at each other, which is an
 * ordinary shape for a schema that keeps a pointer to the currently live version.
 */
const schema: SchemaNames = {
	entities: {
		Page: {
			name: 'Page',
			scalars: ['id', 'title'],
			fields: {
				id: { type: 'column' },
				title: { type: 'column' },
				publishedRevision: { type: 'one', entity: 'Revision' },
			},
		},
		Revision: {
			name: 'Revision',
			scalars: ['id', 'name'],
			fields: {
				id: { type: 'column' },
				name: { type: 'column' },
				page: { type: 'one', entity: 'Page' },
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

function connect(store: SnapshotStore, entityType: string, entityId: string, fieldName: string, targetId: string): void {
	store.getOrCreateRelation(entityType, entityId, fieldName, {
		currentId: targetId,
		serverId: targetId,
		state: 'connected',
		serverState: 'connected',
		placeholderData: {},
	})
}

/**
 * Collecting an update walks unchanged hasOne targets looking for nested changes. With a
 * relation cycle in the schema that walk revisits an entity already on the stack, and
 * without a guard it recurses until `RangeError: Maximum call stack size exceeded` — the
 * persist then rejects, so nothing reaches the server and the store stays dirty.
 */
describe('relation cycles during collection', () => {
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
		store.setEntityData('Revision', 'rev-draft', { id: 'rev-draft', name: 'Draft' }, true)
		store.setEntityData('Revision', 'rev-published', { id: 'rev-published', name: 'Published' }, true)

		connect(store, 'Revision', 'rev-draft', 'page', 'page-1')
		connect(store, 'Page', 'page-1', 'publishedRevision', 'rev-published')
		connect(store, 'Revision', 'rev-published', 'page', 'page-1')
	})

	test('an update through a hasOne cycle persists instead of overflowing the stack', async () => {
		store.setFieldValue('Revision', 'rev-draft', ['name'], 'Renamed draft')

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		expect(calls).toHaveLength(1)
		expect(calls[0]?.entityType).toBe('Revision')
		expect(calls[0]?.entityId).toBe('rev-draft')
		expect(calls[0]?.changes).toEqual({ name: 'Renamed draft' })
	})

	test('a real change on the far side of the cycle still travels with its parent', async () => {
		store.setFieldValue('Revision', 'rev-draft', ['name'], 'Renamed draft')
		store.setFieldValue('Page', 'page-1', ['title'], 'Renamed page')

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
		const revisionCall = calls.find(call => call.entityId === 'rev-draft')
		const pageCall = calls.find(call => call.entityId === 'page-1')
		expect(revisionCall?.changes).toEqual({ name: 'Renamed draft' })
		expect(pageCall?.changes).toEqual({ title: 'Renamed page' })
	})

	test('a create whose nested target points back at it does not recurse forever', async () => {
		const pageId = store.createEntity('Page', { title: 'New page' })
		const revisionId = store.createEntity('Revision', { name: 'New revision' })
		store.getOrCreateRelation('Page', pageId, 'publishedRevision', {
			currentId: revisionId,
			serverId: null,
			state: 'connected',
			serverState: 'disconnected',
			placeholderData: {},
		})
		store.getOrCreateRelation('Revision', revisionId, 'page', {
			currentId: pageId,
			serverId: null,
			state: 'connected',
			serverState: 'disconnected',
			placeholderData: {},
		})

		const result = await persister.persistAll()

		expect(result.success).toBe(true)
	})
})
