// Regression test for the shipped MockAdapter's node-echo contract.
//
// Since "reconcile immutable persistence executions", a persist whose response
// does not carry the server IDs of its nested creates fails instead of quietly
// succeeding with leaked temp IDs. MockAdapter echoed the raw create payload
// back as the node — relation operations included, unmaterialised — so every
// consumer testing a nested create against it started failing with
// "Missing or ambiguous server ID for nested create …".
import { describe, test, expect, beforeEach } from 'bun:test'
import {
	SnapshotStore,
	MutationCollector,
	ContemberSchemaMutationAdapter,
	ActionDispatcher,
	BatchPersister,
	MockAdapter,
	type MockDataStore,
	type SchemaNames,
} from '@contember/bindx'

// File → variants (hasMany) → asset (hasOne). Mirrors an upload dialog that
// creates a file, its format rows, and the stored asset behind each of them in
// one scoped persist.
const schema: SchemaNames = {
	entities: {
		File: {
			name: 'File',
			scalars: ['id', 'title'],
			fields: {
				id: { type: 'column' },
				title: { type: 'column' },
				variants: { type: 'many', entity: 'Variant' },
			},
		},
		Variant: {
			name: 'Variant',
			scalars: ['id', 'format'],
			fields: {
				id: { type: 'column' },
				format: { type: 'column' },
				asset: { type: 'one', entity: 'Asset', nullable: true },
			},
		},
		Asset: {
			name: 'Asset',
			scalars: ['id', 'url'],
			fields: { id: { type: 'column' }, url: { type: 'column' } },
		},
	},
	enums: {},
}

describe('MockAdapter — nested creates', () => {
	let store: SnapshotStore
	let persister: BatchPersister
	let fileId: string
	let variantId: string
	let assetId: string

	beforeEach(() => {
		store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		const schemaAdapter = new ContemberSchemaMutationAdapter(schema)
		const mutationCollector = new MutationCollector(store, schemaAdapter)
		const data: MockDataStore = { File: {}, Variant: {}, Asset: {} }
		persister = new BatchPersister(new MockAdapter(data, { delay: 0 }), store, dispatcher, {
			mutationCollector,
			schema: schemaAdapter as never,
		})

		fileId = store.createEntity('File', { title: 'zprava.pdf' })
		variantId = store.createEntity('Variant', { format: 'pdf' })
		assetId = store.createEntity('Asset', { url: 'https://cdn.example/zprava.pdf' })
		store.getOrCreateRelation('Variant', variantId, 'asset', {
			currentId: assetId, serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
		})
		store.getOrCreateHasMany('File', fileId, 'variants', [])
		store.addToHasMany('File', fileId, 'variants', variantId)
	})

	test('a scoped persist of a create with nested creates succeeds', async () => {
		const result = await persister.persist('File', fileId)
		expect(result.error?.message).toBeUndefined()
		expect(result.success).toBe(true)
	})

	test('the persist reports the server ID the root was created under', async () => {
		const result = await persister.persist('File', fileId)
		expect(result.persistedId).toBeDefined()
		expect(result.persistedId).not.toStartWith('__temp_')
	})

	test('every nested create is rekeyed to its server ID', async () => {
		await persister.persist('File', fileId)
		expect(store.getPersistedId('Variant', variantId)).not.toBeNull()
		expect(store.getPersistedId('Asset', assetId)).not.toBeNull()
	})
})
