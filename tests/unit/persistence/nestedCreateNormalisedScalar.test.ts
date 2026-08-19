import { describe, test, expect, mock } from 'bun:test'
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

/**
 * Page → blocks (hasMany) → button (hasOne) → link (hasOne).
 *
 * The node selection is also the content matcher's input: every field it requests is a
 * field the matcher then compares. These tests pin how the matcher behaves when a
 * comparison cannot succeed — a server that echoes a value back normalised — and where
 * it refuses to guess.
 */
const schema: SchemaNames = {
	entities: {
		Page: {
			name: 'Page',
			scalars: ['id', 'title'],
			fields: { id: { type: 'column' }, title: { type: 'column' }, blocks: { type: 'many', entity: 'Block' } },
		},
		Block: {
			name: 'Block',
			scalars: ['id', 'order', 'type'],
			fields: {
				id: { type: 'column' },
				order: { type: 'column' },
				type: { type: 'column' },
				button: { type: 'one', entity: 'Button', nullable: true },
			},
		},
		Button: {
			name: 'Button',
			scalars: ['id', 'label'],
			fields: { id: { type: 'column' }, label: { type: 'column' }, link: { type: 'one', entity: 'Link', nullable: true } },
		},
		Link: {
			name: 'Link',
			scalars: ['id', 'type', 'publishedAt'],
			fields: { id: { type: 'column' }, type: { type: 'column' }, publishedAt: { type: 'column' } },
		},
	},
	enums: {},
}

interface SelectionField {
	readonly name: string
	readonly selectionSet?: readonly unknown[]
}

interface NodeSelection {
	name: string
	children?: NodeSelection[]
}

function isSelectionField(value: unknown): value is SelectionField {
	return typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string'
}

function readSelection(selectionSet: readonly unknown[]): NodeSelection[] {
	return selectionSet.map(item => {
		if (!isSelectionField(item)) throw new Error('selection entry is not a GraphQL field')
		return { name: item.name, children: item.selectionSet ? readSelection(item.selectionSet) : undefined }
	})
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface ServerOptions {
	/** Normalises a scalar on its way back out, the way a datetime or decimal column does. */
	readonly normalise?: (fieldName: string, value: unknown) => unknown
	/** Returns hasMany rows in reverse — the API guarantees no ordering. */
	readonly reverseRows?: boolean
}

interface MockServer {
	readonly adapter: BackendAdapter
	/** Every row the server built, keyed by the ID it assigned — the ground truth for pairing. */
	readonly rowsById: Map<string, Record<string, unknown>>
}

/**
 * Echoes back exactly the fields the node selection asked for — the contract a real
 * Contember API honours — optionally normalising scalars and reordering hasMany rows.
 */
function createMockServer(options: ServerOptions = {}): MockServer {
	let serverIdCounter = 0
	const rowsById = new Map<string, Record<string, unknown>>()

	const buildNode = (data: Record<string, unknown>, selection: NodeSelection[]): Record<string, unknown> => {
		const selected = new Map(selection.map(field => [field.name, field]))
		const node: Record<string, unknown> = { id: `server-${++serverIdCounter}` }

		for (const [fieldName, value] of Object.entries(data)) {
			const fieldSelection = selected.get(fieldName)
			if (!fieldSelection || value === null || value === undefined) continue

			if (Array.isArray(value)) {
				const rows: Record<string, unknown>[] = []
				for (const op of value) {
					if (!isRecord(op)) continue
					const create = op['create']
					if (isRecord(create)) rows.push(buildNode(create, fieldSelection.children ?? []))
				}
				if (rows.length > 0) node[fieldName] = options.reverseRows ? rows.reverse() : rows
			} else if (isRecord(value)) {
				const create = value['create']
				if (isRecord(create)) node[fieldName] = buildNode(create, fieldSelection.children ?? [])
			} else {
				node[fieldName] = options.normalise ? options.normalise(fieldName, value) : value
			}
		}

		const id = node['id']
		if (typeof id === 'string') rowsById.set(id, node)
		return node
	}

	const respond = (data: Record<string, unknown>) =>
		Promise.resolve({ ok: true, data: buildNode(data, readSelection(buildNodeSelectionFromMutationData(data))) })

	return {
		rowsById,
		adapter: {
			query: mock(() => Promise.resolve([])),
			delete: mock(() => Promise.resolve({ ok: true })),
			persist: mock((_entityType: string, _entityId: string, changes: Record<string, unknown>) => respond(changes)),
			create: mock((_entityType: string, data: Record<string, unknown>) => respond(data)),
		},
	}
}

function createPersister(store: SnapshotStore, adapter: BackendAdapter): BatchPersister {
	const schemaAdapter = new ContemberSchemaMutationAdapter(schema)
	return new BatchPersister(adapter, store, new ActionDispatcher(store), {
		mutationCollector: new MutationCollector(store, schemaAdapter),
		schema: schemaAdapter as never, // ContemberSchemaMutationAdapter satisfies MutationSchemaProvider
	})
}

function seedPage(store: SnapshotStore): void {
	store.setEntityData('Page', 'page-1', { id: 'page-1', title: 'Contacts' }, true)
	store.setExistsOnServer('Page', 'page-1', true)
	store.getOrCreateHasMany('Page', 'page-1', 'blocks', [])
}

function addBlock(store: SnapshotStore, data: Record<string, unknown>): string {
	const blockId = store.createEntity('Block', data)
	store.addToHasMany('Page', 'page-1', 'blocks', blockId)
	return blockId
}

function connect(store: SnapshotStore, parentType: string, parentId: string, field: string, childId: string): void {
	store.getOrCreateRelation(parentType, parentId, field, {
		currentId: childId, serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
	})
}

/** ISO-normalises a date-only value, the shape a datetime column echoes back. */
const normaliseDate = (fieldName: string, value: unknown): unknown =>
	fieldName === 'publishedAt' && value === '2024-01-01' ? '2024-01-01T00:00:00.000Z' : value

describe('Nested create reconciliation when the server normalises a scalar', () => {
	test('maps every sibling even though the normalised value matches nothing', async () => {
		const store = new SnapshotStore()
		const server = createMockServer({ normalise: normaliseDate })
		const persister = createPersister(store, server.adapter)
		seedPage(store)

		// The link subtree only reaches the node selection because sibling shapes are
		// unioned; comparing it byte-for-byte is what the normalised date defeats.
		const blockWithLink = addBlock(store, { order: 1, type: 'button' })
		const buttonWithLink = store.createEntity('Button', { label: 'A' })
		const link = store.createEntity('Link', { type: 'external', publishedAt: '2024-01-01' })
		connect(store, 'Block', blockWithLink, 'button', buttonWithLink)
		connect(store, 'Button', buttonWithLink, 'link', link)

		const plainBlock = addBlock(store, { order: 2, type: 'button' })
		const plainButton = store.createEntity('Button', { label: 'B' })
		connect(store, 'Block', plainBlock, 'button', plainButton)

		expect((await persister.persistAll()).success).toBe(true)

		expect(store.getPersistedId('Block', blockWithLink)).not.toBeNull()
		expect(store.getPersistedId('Button', buttonWithLink)).not.toBeNull()
		expect(store.getPersistedId('Link', link)).not.toBeNull()
		expect(store.getPersistedId('Block', plainBlock)).not.toBeNull()
		expect(store.getPersistedId('Button', plainButton)).not.toBeNull()

		expect(store.getPersistedId('Block', blockWithLink)).not.toBe(store.getPersistedId('Block', plainBlock))
	})

	test('refuses to pair when two siblings are both unmatched, rather than guessing', async () => {
		const store = new SnapshotStore()
		const server = createMockServer({ normalise: normaliseDate })
		const persister = createPersister(store, server.adapter)
		seedPage(store)

		// Both blocks carry the defeated comparison, so neither can be identified and
		// elimination has nothing unambiguous to fall back on.
		const blockIds = [1, 2].map(order => {
			const blockId = addBlock(store, { order, type: 'button' })
			const buttonId = store.createEntity('Button', { label: `label-${order}` })
			const linkId = store.createEntity('Link', { type: 'external', publishedAt: '2024-01-01' })
			connect(store, 'Block', blockId, 'button', buttonId)
			connect(store, 'Button', buttonId, 'link', linkId)
			return blockId
		})

		expect((await persister.persistAll()).success).toBe(true)

		for (const blockId of blockIds) {
			expect(store.getPersistedId('Block', blockId)).toBeNull()
		}
	})
})

describe('Pairing create operations with response rows', () => {
	test('an ambiguous payload does not consume the row its sibling matches uniquely', async () => {
		const store = new SnapshotStore()
		const server = createMockServer({ reverseRows: true })
		const persister = createPersister(store, server.adapter)
		seedPage(store)

		// The first payload is a strict subset of the second, so it matches both rows.
		const looseBlock = addBlock(store, { order: 1 })
		const preciseBlock = addBlock(store, { order: 1, type: 'button' })

		expect((await persister.persistAll()).success).toBe(true)

		const looseId = store.getPersistedId('Block', looseBlock)
		const preciseId = store.getPersistedId('Block', preciseBlock)
		expect(looseId).not.toBeNull()
		expect(preciseId).not.toBeNull()
		expect(looseId).not.toBe(preciseId)

		// Each block must own the row built from its own payload.
		expect(server.rowsById.get(looseId!)?.['type']).toBeUndefined()
		expect(server.rowsById.get(preciseId!)?.['type']).toBe('button')
	})

	test('maps indistinguishable siblings, which any pairing describes equally well', async () => {
		const store = new SnapshotStore()
		const server = createMockServer()
		const persister = createPersister(store, server.adapter)
		seedPage(store)

		const first = addBlock(store, { order: 1, type: 'button' })
		const second = addBlock(store, { order: 1, type: 'button' })

		expect((await persister.persistAll()).success).toBe(true)

		expect(store.getPersistedId('Block', first)).not.toBeNull()
		expect(store.getPersistedId('Block', second)).not.toBeNull()
		expect(store.getPersistedId('Block', first)).not.toBe(store.getPersistedId('Block', second))
	})
})
