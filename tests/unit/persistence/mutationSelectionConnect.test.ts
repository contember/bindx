/**
 * Connected has-one ids are part of the node selection, so sibling creates that differ
 * only by what they connect are paired with their own response rows.
 */
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
import { buildNodeSelectionFromMutationData } from '@contember/bindx-client'

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
			scalars: ['id', 'order'],
			fields: {
				id: { type: 'column' },
				order: { type: 'column' },
				author: { type: 'one', entity: 'Author', nullable: true },
			},
		},
		Author: {
			name: 'Author',
			scalars: ['id', 'name'],
			fields: { id: { type: 'column' }, name: { type: 'column' } },
		},
	},
	enums: {},
}

type NodeSelection = { name: string; children?: NodeSelection[] }

const readSelection = (selectionSet: readonly unknown[]): NodeSelection[] =>
	selectionSet.map(item => {
		const field = item as { name: string; selectionSet?: readonly unknown[] }
		return { name: field.name, children: field.selectionSet ? readSelection(field.selectionSet) : undefined }
	})

/**
 * Echoes back exactly the selected fields, and returns the hasMany rows in
 * reverse order — the Contember API gives no ordering guarantee for a
 * mutation's `node` hasMany, which is why the persister content-matches.
 */
function createReorderingEchoAdapter(assigned: Map<string, string>): BackendAdapter {
	let counter = 0

	const buildNode = (data: Record<string, unknown>, selection: NodeSelection[]): Record<string, unknown> => {
		const selected = new Map(selection.map(field => [field.name, field]))
		const node: Record<string, unknown> = { id: `server-${++counter}` }

		for (const [key, value] of Object.entries(data)) {
			const fieldSelection = selected.get(key)
			if (!fieldSelection || value === null || value === undefined) continue

			if (Array.isArray(value)) {
				const items: Record<string, unknown>[] = []
				for (const op of value) {
					if (typeof op !== 'object' || op === null) continue
					const opObj = op as Record<string, unknown>
					if ('create' in opObj) {
						const built = buildNode(opObj['create'] as Record<string, unknown>, fieldSelection.children ?? [])
						if (typeof opObj['alias'] === 'string') assigned.set(opObj['alias'], built['id'] as string)
						items.push(built)
					} else if ('connect' in opObj) {
						items.push({ id: (opObj['connect'] as Record<string, unknown>)['id'] })
					}
				}
				if (items.length > 0) node[key] = items.reverse()
			} else if (typeof value === 'object') {
				const opObj = value as Record<string, unknown>
				if ('create' in opObj) {
					node[key] = buildNode(opObj['create'] as Record<string, unknown>, fieldSelection.children ?? [])
				} else if ('connect' in opObj) {
					node[key] = { id: (opObj['connect'] as Record<string, unknown>)['id'] }
				}
			} else {
				node[key] = value
			}
		}
		return node
	}

	const respond = (data: Record<string, unknown>) =>
		Promise.resolve({ ok: true, data: buildNode(data, readSelection(buildNodeSelectionFromMutationData(data))) })

	return {
		query: mock(() => Promise.resolve([])),
		delete: mock(() => Promise.resolve({ ok: true })),
		persist: mock((_e: string, _i: string, changes: Record<string, unknown>) => respond(changes)),
		create: mock((_e: string, data: Record<string, unknown>) => respond(data)),
	}
}

describe('node selection must carry connected hasOne ids', () => {
	test('a connected hasOne is part of the node selection', () => {
		const selection = buildNodeSelectionFromMutationData({
			blocks: [
				{ alias: 't1', create: { order: 1, author: { connect: { id: 'author-1' } } } },
				{ alias: 't2', create: { order: 1, author: { connect: { id: 'author-2' } } } },
			],
		})
		const blocks = selection.find(f => (f as { name: string }).name === 'blocks') as { selectionSet?: readonly unknown[] }
		expect((blocks.selectionSet ?? []).map(f => (f as { name: string }).name)).toContain('author')
	})

	test('sibling creates that differ only by their connected relation keep their own server ids', async () => {
		const store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		const schemaAdapter = new ContemberSchemaMutationAdapter(schema)
		const mutationCollector = new MutationCollector(store, schemaAdapter)
		const assigned = new Map<string, string>()
		const persister = new BatchPersister(createReorderingEchoAdapter(assigned), store, dispatcher, {
			mutationCollector,
			schema: schemaAdapter as never,
		})

		store.setEntityData('Page', 'page-1', { id: 'page-1', title: 'Page' }, true)
		store.setExistsOnServer('Page', 'page-1', true)
		store.getOrCreateHasMany('Page', 'page-1', 'blocks', [])

		// Two blocks with identical scalars; only the connected author differs.
		const blockA = store.createEntity('Block', { order: 1 })
		store.getOrCreateRelation('Block', blockA, 'author', {
			currentId: 'author-1', serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
		})
		store.addToHasMany('Page', 'page-1', 'blocks', blockA)

		const blockB = store.createEntity('Block', { order: 1 })
		store.getOrCreateRelation('Block', blockB, 'author', {
			currentId: 'author-2', serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
		})
		store.addToHasMany('Page', 'page-1', 'blocks', blockB)

		const result = await persister.persistAll()
		expect(result.success).toBe(true)

		expect(store.getPersistedId('Block', blockA)).toBe(assigned.get(blockA)!)
		expect(store.getPersistedId('Block', blockB)).toBe(assigned.get(blockB)!)
	})
})
