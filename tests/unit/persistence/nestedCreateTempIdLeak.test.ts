// Regression test for <issue-url>
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

/**
 * Page → blocks (hasMany) → button (hasOne) → link (hasOne).
 *
 * Models a page builder that duplicates a section: the duplicate is emitted as a
 * batch of sibling `create` operations inside one hasMany, each carrying its own
 * nested hasOne creates. Sibling blocks are of different kinds, so their create
 * payloads contain different subsets of the nested fields (unset fields are
 * omitted from create data).
 */
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
			scalars: ['id', 'label', 'modalTitle'],
			fields: {
				id: { type: 'column' },
				label: { type: 'column' },
				modalTitle: { type: 'column' },
				link: { type: 'one', entity: 'Link', nullable: true },
			},
		},
		Link: {
			name: 'Link',
			scalars: ['id', 'type', 'externalTarget'],
			fields: {
				id: { type: 'column' },
				type: { type: 'column' },
				externalTarget: { type: 'column' },
			},
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

type AdapterCall = { entityType: string; entityId: string; data: Record<string, unknown> }

/**
 * Adapter without `persistTransaction`, so BatchPersister takes the sequential path and
 * reconstructs nested IDs from the mutation's `node` response. The response echoes exactly
 * the fields the node selection asked for — the same contract a real Contember API honours.
 */
function createNodeEchoAdapter(calls: AdapterCall[]): BackendAdapter {
	let serverIdCounter = 0

	const buildNode = (data: Record<string, unknown>, selection: NodeSelection[]): Record<string, unknown> => {
		const selected = new Map(selection.map(field => [field.name, field]))
		const node: Record<string, unknown> = { id: `server-${++serverIdCounter}` }

		for (const [key, value] of Object.entries(data)) {
			const fieldSelection = selected.get(key)
			if (!fieldSelection || value === null || value === undefined) continue

			if (Array.isArray(value)) {
				const items: Record<string, unknown>[] = []
				for (const op of value) {
					if (typeof op !== 'object' || op === null) continue
					const opObj = op as Record<string, unknown>
					if ('create' in opObj) {
						items.push(buildNode(opObj['create'] as Record<string, unknown>, fieldSelection.children ?? []))
					} else if ('connect' in opObj) {
						items.push({ id: (opObj['connect'] as Record<string, unknown>)['id'] })
					}
				}
				if (items.length > 0) node[key] = items
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
		persist: mock((entityType: string, entityId: string, changes: Record<string, unknown>) => {
			calls.push({ entityType, entityId, data: changes })
			return respond(changes)
		}),
		create: mock((entityType: string, data: Record<string, unknown>) => {
			calls.push({ entityType, entityId: '<create>', data })
			return respond(data)
		}),
	}
}

describe('Nested create ID reconciliation across sibling creates', () => {
	let store: SnapshotStore
	let persister: BatchPersister
	let calls: AdapterCall[]
	let blockWithModal: string
	let buttonWithModal: string

	beforeEach(async () => {
		store = new SnapshotStore()
		const dispatcher = new ActionDispatcher(store)
		const schemaAdapter = new ContemberSchemaMutationAdapter(schema)
		const mutationCollector = new MutationCollector(store, schemaAdapter)
		calls = []
		persister = new BatchPersister(createNodeEchoAdapter(calls), store, dispatcher, {
			mutationCollector,
			schema: schemaAdapter as never, // ContemberSchemaMutationAdapter satisfies MutationSchemaProvider
		})

		store.setEntityData('Page', 'page-1', { id: 'page-1', title: 'Contacts' }, true)
		store.setExistsOnServer('Page', 'page-1', true)
		store.getOrCreateHasMany('Page', 'page-1', 'blocks', [])

		// First sibling: a button that opens a modal (sets `modalTitle`, has no link).
		blockWithModal = store.createEntity('Block', { order: 1, type: 'button' })
		buttonWithModal = store.createEntity('Button', { label: 'Kontaktujte nás', modalTitle: 'Kontakt' })
		store.getOrCreateRelation('Block', blockWithModal, 'button', {
			currentId: buttonWithModal, serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
		})
		store.addToHasMany('Page', 'page-1', 'blocks', blockWithModal)

		// Second sibling: a plain link button (no `modalTitle`, but a nested link).
		const blockWithLink = store.createEntity('Block', { order: 2, type: 'button' })
		const buttonWithLink = store.createEntity('Button', { label: 'Napište nám' })
		const link = store.createEntity('Link', { type: 'external', externalTarget: 'mailto:info@example.com' })
		store.getOrCreateRelation('Block', blockWithLink, 'button', {
			currentId: buttonWithLink, serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
		})
		store.getOrCreateRelation('Button', buttonWithLink, 'link', {
			currentId: link, serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
		})
		store.addToHasMany('Page', 'page-1', 'blocks', blockWithLink)

		const result = await persister.persistAll()
		expect(result.success).toBe(true)
	})

	test('should map every nested create to its server ID when sibling creates carry different nested shapes', () => {
		expect(store.getPersistedId('Block', blockWithModal)).not.toBeNull()
		expect(store.getPersistedId('Button', buttonWithModal)).not.toBeNull()
	})

	test('should not emit an update keyed by a temp ID when a nested create stays unresolved', async () => {
		// The entity is reported as existing on the server, so the next edit goes out as an update.
		expect(store.existsOnServer('Button', buttonWithModal)).toBe(true)

		calls.length = 0
		const buttonId = store.getPersistedId('Button', buttonWithModal) ?? buttonWithModal
		store.updateEntityFields('Button', buttonId, { label: 'Napište nám hned' })
		await persister.persistAll()

		const buttonUpdate = calls.find(call => call.entityType === 'Button')
		expect(buttonUpdate).toBeDefined()
		expect(buttonUpdate!.entityId).not.toMatch(/^__temp_/)
	})
})
