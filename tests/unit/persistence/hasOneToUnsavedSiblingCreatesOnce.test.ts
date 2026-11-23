// Regression test for https://github.com/contember/bindx/issues/169
/**
 * Two entities created in one persist through the same has-many, the second pointing at the
 * first by a has-one (a section and its sub-section in a self-referencing tree). The first
 * entity must be created once — through the has-many — and the has-one must refer to it, not
 * carry a second inline create of it that lacks everything the has-many supplied implicitly.
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
		Website: {
			name: 'Website',
			scalars: ['id', 'name'],
			fields: {
				id: { type: 'column' },
				name: { type: 'column' },
				sections: { type: 'many', entity: 'Section', relationKind: 'oneHasMany', inverse: 'website' },
			},
		},
		Section: {
			name: 'Section',
			scalars: ['id', 'name'],
			fields: {
				id: { type: 'column' },
				name: { type: 'column' },
				website: { type: 'one', entity: 'Website', nullable: false, inverse: 'sections' },
				parent: { type: 'one', entity: 'Section', nullable: true },
			},
		},
	},
	enums: {},
}

interface PersistCall {
	readonly entityType: string
	readonly changes: Record<string, unknown>
}

function createAdapter(calls: PersistCall[]): BackendAdapter {
	return {
		query: () => Promise.resolve([]),
		persist: (entityType, entityId, changes) => {
			calls.push({ entityType, changes })
			return Promise.resolve({ ok: true, data: { id: entityId } })
		},
		create: (_entityType, data) => Promise.resolve({ ok: true, data }),
		delete: () => Promise.resolve({ ok: true }),
	}
}

/** Counts the `create` operations anywhere in a mutation whose data carries the given name. */
function countCreatesNamed(value: unknown, name: string): number {
	if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + countCreatesNamed(item, name), 0)
	if (typeof value !== 'object' || value === null) return 0
	const record = value as Record<string, unknown>
	const create = record['create']
	const own = typeof create === 'object' && create !== null && (create as Record<string, unknown>)['name'] === name ? 1 : 0
	return own + Object.values(record).reduce<number>((sum, item) => sum + countCreatesNamed(item, name), 0)
}

describe('has-one pointing at an entity created through a sibling has-many addition', () => {
	let store: SnapshotStore
	let calls: PersistCall[]
	let persister: BatchPersister

	beforeEach(() => {
		store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		calls = []
		persister = new BatchPersister(createAdapter(calls), store, dispatcher, {
			mutationCollector: new MutationCollector(store, new ContemberSchemaMutationAdapter(schema)),
		})

		store.setEntityData('Website', 'website-1', { id: 'website-1', name: 'Site' }, true)
		store.setExistsOnServer('Website', 'website-1', true)
		store.getOrCreateHasMany('Website', 'website-1', 'sections', [])

		const root = store.createEntity('Section', { name: 'Root' })
		store.addToHasMany('Website', 'website-1', 'sections', root)

		const child = store.createEntity('Section', { name: 'Child' })
		store.getOrCreateRelation('Section', child, 'parent', {
			currentId: root, serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
		})
		store.addToHasMany('Website', 'website-1', 'sections', child)
	})

	test('should create the parent section once when its sub-section is added in the same persist', async () => {
		await persister.persistAll()

		const websiteMutation = calls.find(call => call.entityType === 'Website')
		expect(websiteMutation).toBeDefined()
		expect(countCreatesNamed(websiteMutation?.changes, 'Root')).toBe(1)
	})
})
