/**
 * An entity the collector materializes during mutation building (a placeholder has-one)
 * must be offered to `entity:persisting` like any other entity that ends up persisted.
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
		Lecturer: {
			name: 'Lecturer',
			scalars: ['id', 'status'],
			fields: {
				id: { type: 'column' },
				status: { type: 'column' },
				user: { type: 'one', entity: 'User' },
			},
		},
		User: {
			name: 'User',
			scalars: ['id', 'firstName'],
			fields: {
				id: { type: 'column' },
				firstName: { type: 'column' },
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
			return Promise.resolve({ ok: true, data: { id: entityId, user: { id: 'user-1', firstName: 'Jan' } } })
		},
		create: (_entityType, data) => Promise.resolve({ ok: true, data: { id: 'created-1', ...data } }),
		delete: () => Promise.resolve({ ok: true }),
	}
}

/**
 * A placeholder-backed hasOne is materialized into a real entity while the mutation
 * is being built — after the `entity:persisting` pipeline has already run. The entity
 * is therefore written (and gets an `entity:persisted` event) without ever having
 * been offered to an interceptor, so a global veto cannot stop it.
 */
describe('entity materialized during collection skips the persisting pipeline', () => {
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

		store.setEntityData('Lecturer', 'lect-1', { id: 'lect-1', status: 'draft' }, true)
		store.setFieldValue('Lecturer', 'lect-1', ['status'], 'active')
		store.getOrCreateRelation('Lecturer', 'lect-1', 'user', {
			currentId: null,
			serverId: null,
			state: 'creating',
			serverState: 'disconnected',
			placeholderData: { firstName: 'Jan' },
		})
	})

	test('every entity that reports persisted was offered to the interceptors', async () => {
		const offered: string[] = []
		const persisted: string[] = []
		dispatcher.getEventEmitter().intercept('entity:persisting', event => {
			offered.push(event.entityType)
			return { action: 'continue' }
		})
		dispatcher.getEventEmitter().on('entity:persisted', event => persisted.push(event.entityType))

		await persister.persistAll()

		for (const entityType of persisted) {
			expect(offered).toContain(entityType)
		}
	})

	test('a global veto of the child type stops it from being written', async () => {
		dispatcher.getEventEmitter().intercept('entity:persisting', event => (
			event.entityType === 'User' ? { action: 'cancel' } : { action: 'continue' }
		))

		await persister.persistAll()

		expect(calls[0]?.changes).toEqual({ status: 'active' })
	})
})
