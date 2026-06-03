import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
	SnapshotStore,
	MutationCollector,
	ContemberSchemaMutationAdapter,
	ActionDispatcher,
	BatchPersister,
	type BackendAdapter,
	type SchemaNames,
} from '@contember/bindx'

/**
 * Bug #2 regression: a block editor reference is created with a STABLE client-generated
 * id (crypto.randomUUID() in useBlockEditorReferences.insertBlock). That id is written into
 * the Slate document as node.referenceId, so it MUST survive persistence — otherwise the
 * document points at a dangling id after save.
 *
 * This exercises the three pieces that make it work:
 *   1. SnapshotStore.createEntity honours a caller-provided id (uses it as the store key).
 *   2. MutationCollector.collectCreateData SENDS that id in the create mutation when it is a
 *      persisted-shaped id (so the server uses it as the primary key instead of assigning one).
 *   3. After persist the entity is still resolvable by that exact id (no temp→server remap).
 *
 * Mirrors the setup style of tests/nestedHasManyCreate.test.ts.
 */
const schema: SchemaNames = {
	entities: {
		Article: {
			name: 'Article',
			scalars: ['id', 'title'],
			fields: {
				id: { type: 'column' },
				title: { type: 'column' },
				contentReferences: { type: 'many', entity: 'ContentReference' },
			},
		},
		ContentReference: {
			name: 'ContentReference',
			scalars: ['id', 'type', 'caption'],
			fields: {
				id: { type: 'column' },
				type: { type: 'column' },
				caption: { type: 'column' },
			},
		},
	},
	enums: {},
}

const REF_UUID = '11111111-1111-1111-1111-111111111111'

describe('Block editor reference creation persistence (Bug #2: stable client UUID)', () => {
	let store: SnapshotStore
	let collector: MutationCollector

	beforeEach(() => {
		store = new SnapshotStore()
		collector = new MutationCollector(store, new ContemberSchemaMutationAdapter(schema))
	})

	test('createEntity honours a caller-provided id and uses it as the store key', () => {
		const id = store.createEntity('ContentReference', { id: REF_UUID, type: 'image' })

		expect(id).toBe(REF_UUID)
		const snap = store.getEntitySnapshot('ContentReference', REF_UUID)
		expect(snap).not.toBeUndefined()
		const data = snap!.data as Record<string, unknown>
		expect(data['id']).toBe(REF_UUID)
		expect(data['type']).toBe('image')
	})

	test('a reference created with a client UUID emits a create that SENDS the id', () => {
		store.setEntityData('Article', 'art-1', { id: 'art-1', title: 'T' }, true)
		store.setExistsOnServer('Article', 'art-1', true)

		// insertBlock equivalent: create the reference with a stable client UUID + discrimination field.
		const refId = store.createEntity('ContentReference', { id: REF_UUID, type: 'image' })
		store.getOrCreateHasMany('Article', 'art-1', 'contentReferences', [])
		store.addToHasMany('Article', 'art-1', 'contentReferences', refId)

		const mutation = collector.collectUpdateData('Article', 'art-1')
		expect(mutation).not.toBeNull()

		const refsOps = mutation!['contentReferences'] as Array<{ create: Record<string, unknown>; alias: string }>
		expect(refsOps).toHaveLength(1)
		// The crux of Bug #2: the create MUST carry the client id so the server uses it as the PK.
		expect(refsOps[0]!.create['id']).toBe(REF_UUID)
		expect(refsOps[0]!.create['type']).toBe('image')
	})

	test('a temp-id reference still omits the id from its create (server assigns it)', () => {
		store.setEntityData('Article', 'art-1', { id: 'art-1', title: 'T' }, true)
		store.setExistsOnServer('Article', 'art-1', true)

		// No client id supplied → createEntity mints a temp id, which must NOT be sent.
		const refId = store.createEntity('ContentReference', { type: 'image' })
		store.getOrCreateHasMany('Article', 'art-1', 'contentReferences', [])
		store.addToHasMany('Article', 'art-1', 'contentReferences', refId)

		const mutation = collector.collectUpdateData('Article', 'art-1')
		const refsOps = mutation!['contentReferences'] as Array<{ create: Record<string, unknown>; alias: string }>
		expect(refsOps).toHaveLength(1)
		expect(refsOps[0]!.create['id']).toBeUndefined()
		expect(refsOps[0]!.create['type']).toBe('image')
	})

	test('after persist the reference is still resolvable by its client UUID (referenceId stays valid)', async () => {
		// Server echoes back the client-provided id as the primary key (Contember accepts client PKs).
		function buildNode(data: Record<string, unknown>): Record<string, unknown> {
			const node: Record<string, unknown> = { id: (data['id'] as string) ?? 'server-assigned' }
			for (const [key, value] of Object.entries(data)) {
				if (value === null || value === undefined) continue
				if (Array.isArray(value)) {
					const items: Record<string, unknown>[] = []
					for (const item of value) {
						const op = item as Record<string, unknown>
						if (op && typeof op === 'object' && 'create' in op) {
							items.push(buildNode(op['create'] as Record<string, unknown>))
						}
					}
					if (items.length > 0) node[key] = items
				} else if (typeof value !== 'object') {
					node[key] = value
				}
			}
			return node
		}

		const adapter: BackendAdapter = {
			query: mock(() => Promise.resolve([])),
			delete: mock(() => Promise.resolve({ ok: true })),
			persist: mock((_t: string, _id: string, changes: Record<string, unknown>) =>
				Promise.resolve({ ok: true, data: buildNode(changes) })),
			create: mock((_t: string, data: Record<string, unknown>) =>
				Promise.resolve({ ok: true, data: buildNode(data) })),
		}

		const dispatcher = new ActionDispatcher(store)
		const schemaAdapter = new ContemberSchemaMutationAdapter(schema)
		const mutationCollector = new MutationCollector(store, schemaAdapter)
		const persister = new BatchPersister(adapter, store, dispatcher, {
			mutationCollector,
			schema: schemaAdapter as never,
		})

		store.setEntityData('Article', 'art-1', { id: 'art-1', title: 'T' }, true)
		store.setExistsOnServer('Article', 'art-1', true)

		const refId = store.createEntity('ContentReference', { id: REF_UUID, type: 'image' })
		store.getOrCreateHasMany('Article', 'art-1', 'contentReferences', [])
		store.addToHasMany('Article', 'art-1', 'contentReferences', refId)

		const result = await persister.persistAll()
		expect(result.success).toBe(true)

		// The document's node.referenceId === REF_UUID must still resolve after persist.
		const snap = store.getEntitySnapshot('ContentReference', REF_UUID)
		expect(snap).not.toBeUndefined()
		expect(store.existsOnServer('ContentReference', REF_UUID)).toBe(true)

		// Any id remap must be the identity (server reused the client PK) — never a dangling id.
		const persistedId = store.getPersistedId('ContentReference', REF_UUID)
		expect(persistedId === null || persistedId === REF_UUID).toBe(true)
	})
})
