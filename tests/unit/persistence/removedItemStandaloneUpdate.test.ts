// Regression test for <issue-url — filled in after Step 7>
//
// An item that is dirty AND planned for removal (`delete`) from its parent's has-many
// must not get its own top-level `update` mutation: the parent's update carries the
// nested `delete`, so the standalone update targets a row that no longer exists.
// With the default sequential adapter (no `persistTransaction`, like ContemberAdapter)
// the parent runs first and the update then fails with NotFoundOrDenied.
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
		Article: {
			name: 'Article',
			scalars: ['id', 'title'],
			fields: {
				id: { type: 'column' },
				title: { type: 'column' },
				tags: { type: 'many', entity: 'Tag' },
			},
		},
		Tag: {
			name: 'Tag',
			scalars: ['id', 'name', 'order'],
			fields: {
				id: { type: 'column' },
				name: { type: 'column' },
				order: { type: 'column' },
			},
		},
	},
	enums: {},
}

type Call = { operation: 'update' | 'delete'; entityType: string; id: string; data?: Record<string, unknown> }

// Sequential adapter without `persistTransaction` — mirrors ContemberAdapter, which sends one
// request per mutation. The "server" tracks which Tag rows still exist so that an update of a
// row deleted earlier in the same persist fails the way the real API does.
function createSequentialAdapter(existingTags: string[]) {
	const calls: Call[] = []
	const tags = new Set(existingTags)
	const adapter: BackendAdapter = {
		query: mock(() => Promise.resolve([])),
		persist: mock((entityType: string, id: string, changes: Record<string, unknown>) => {
			calls.push({ operation: 'update', entityType, id, data: changes })
			if (entityType === 'Tag' && !tags.has(id)) {
				return Promise.resolve({ ok: false, errorMessage: `Execution has failed:\nunknown field: NotFoundOrDenied (for input {"id":"${id}"})` })
			}
			if (entityType === 'Article') {
				const items = (changes['tags'] as Array<Record<string, unknown>> | undefined) ?? []
				for (const op of items) {
					const del = op['delete'] as { id: string } | undefined
					if (del) tags.delete(del.id)
				}
			}
			return Promise.resolve({ ok: true })
		}),
		create: mock((entityType: string, data: Record<string, unknown>) => Promise.resolve({ ok: true, data: { id: 'new-id', ...data } })),
		delete: mock((entityType: string, id: string) => {
			calls.push({ operation: 'delete', entityType, id })
			tags.delete(id)
			return Promise.resolve({ ok: true })
		}),
	}
	return { adapter, calls }
}

describe('BatchPersister — has-many item planned for delete', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
	})

	test('should not emit a standalone update for a dirty item that is planned for delete', async () => {
		const { adapter, calls } = createSequentialAdapter(['tag-1', 'tag-2', 'tag-3'])
		const schemaAdapter = new ContemberSchemaMutationAdapter(testSchema)
		const mutationCollector = new MutationCollector(store, schemaAdapter)
		const persister = new BatchPersister(adapter, store, dispatcher, { mutationCollector })

		// Server state: an article with three ordered tags.
		store.setEntityData('Article', 'a-1', {
			id: 'a-1',
			title: 'Article',
			tags: [{ id: 'tag-1' }, { id: 'tag-2' }, { id: 'tag-3' }],
		}, true)
		store.setEntityData('Tag', 'tag-1', { id: 'tag-1', name: 'One', order: 10 }, true)
		store.setEntityData('Tag', 'tag-2', { id: 'tag-2', name: 'Two', order: 20 }, true)
		store.setEntityData('Tag', 'tag-3', { id: 'tag-3', name: 'Three', order: 30 }, true)
		store.setHasManyServerIds('Article', 'a-1', 'tags', ['tag-1', 'tag-2', 'tag-3'])

		// The sortable-repeater sequence: removing tag-1 renumbers the survivors (tag-2 and
		// tag-3 become dirty), then tag-2 is removed as well — it is now dirty AND removed.
		store.planHasManyRemoval('Article', 'a-1', 'tags', 'tag-1', 'delete')
		store.setFieldValue('Tag', 'tag-2', ['order'], 0)
		store.setFieldValue('Tag', 'tag-3', ['order'], 1)
		store.planHasManyRemoval('Article', 'a-1', 'tags', 'tag-2', 'delete')

		const result = await persister.persistAll()

		const tag2Updates = calls.filter(c => c.operation === 'update' && c.entityType === 'Tag' && c.id === 'tag-2')
		expect(tag2Updates).toEqual([])

		const articleUpdate = calls.find(c => c.operation === 'update' && c.entityType === 'Article')
		expect(articleUpdate).toBeDefined()
		const tagOps = (articleUpdate!.data!['tags'] as Array<Record<string, unknown>>)
		expect(tagOps).toContainEqual(expect.objectContaining({ delete: { id: 'tag-1' } }))
		expect(tagOps).toContainEqual(expect.objectContaining({ delete: { id: 'tag-2' } }))

		// The surviving tag keeps its reorder, and the whole save succeeds.
		const tag3Update = calls.find(c => c.operation === 'update' && c.entityType === 'Tag' && c.id === 'tag-3')
		expect(tag3Update?.data).toEqual({ order: 1 })
		expect(result.success).toBe(true)
		expect(result.failedCount).toBe(0)
	})
})
