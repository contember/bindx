import { describe, test, expect } from 'bun:test'
import {
	SnapshotStore,
	MutationCollector,
	ContemberSchemaMutationAdapter,
	ActionDispatcher,
	BatchPersister,
	SchemaRegistry,
	type BackendAdapter,
	type SchemaNames,
} from '@contember/bindx'
import { schemaNamesToDef } from '@contember/bindx-react'
import { buildNodeSelectionFromMutationData, ContemberSchema, type RawContemberSchema } from '@contember/bindx-client'

// A created row's columns the client did not send hold what the database filled in
// (a default, `now`); the create's response reads them back into the store.

const NOW = '2026-11-24T10:00:00.000Z'

const schema: SchemaNames = {
	entities: {
		Article: {
			name: 'Article',
			scalars: ['id', 'title'],
			fields: {
				id: { type: 'column' },
				title: { type: 'column' },
				tags: { type: 'many', entity: 'Tag', relationKind: 'manyHasMany' },
			},
		},
		Tag: {
			name: 'Tag',
			scalars: ['id', 'name', 'color', 'createdAt', 'secret'],
			fields: {
				id: { type: 'column' },
				name: { type: 'column' },
				color: { type: 'column' },
				createdAt: { type: 'column' },
				secret: { type: 'column' },
			},
		},
	},
	enums: {},
}

const column = (name: string, defaultValue: string | null = null): RawContemberSchema['entities'][number]['fields'][number] => ({
	__typename: '_Column', name, type: 'String', nullable: true, enumName: null, defaultValue,
})

/** What introspection returns for a role that cannot read `Tag.secret`. */
const roleSchema = ContemberSchema.fromRaw({
	enums: [],
	entities: [
		{
			name: 'Article',
			customPrimaryAllowed: false,
			unique: [],
			fields: [
				column('id'),
				column('title'),
				{
					__typename: '_Relation', name: 'tags', type: 'ManyHasMany', nullable: null, side: 'owning', targetEntity: 'Tag',
					inversedBy: null, onDelete: null, orderBy: null, orphanRemoval: null,
				},
			],
		},
		{
			name: 'Tag',
			customPrimaryAllowed: false,
			unique: [],
			fields: [column('id'), column('name'), column('color', 'gray'), column('createdAt', 'now')],
		},
	],
})

type Row = Record<string, unknown>

interface SelectionField {
	readonly name: string
	readonly selectionSet?: readonly unknown[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSelectionField(value: unknown): value is SelectionField {
	return isRecord(value) && typeof value['name'] === 'string'
}

/**
 * Writes rows the way the database does (unset columns take their defaults) and
 * answers with the node selection the Contember adapter would send.
 */
class Server {
	readonly rows = new Map<string, Row>()
	readonly articleTags = new Map<string, string[]>()
	readonly sent: Row[] = []
	/** While set, a mutation waits for it, so the test can edit during the create. */
	gate: Promise<void> | undefined
	/** How the server stores a sent `name`, the way a column may normalise a value. */
	normaliseName: (value: unknown) => unknown = value => value
	private nextId = 0

	readonly adapter: BackendAdapter = {
		query: () => Promise.resolve([]),
		delete: () => Promise.resolve({ ok: true }),
		create: (entityType, data) => this.respond(entityType, data, true, () => this.insertTag(data)),
		persist: (entityType, id, changes) => this.respond(entityType, changes, false, () => this.updateArticle(id, changes)),
	}

	seedArticle(id: string, tagIds: string[]): void {
		this.rows.set(id, { id, title: 'Article' })
		this.articleTags.set(id, tagIds)
	}

	seedTag(id: string, row: Row): void {
		this.rows.set(id, { id, ...row })
	}

	private async respond(entityType: string, data: Row, isRootCreated: boolean, write: () => string): Promise<{ ok: true; data: Row }> {
		this.sent.push(data)
		await this.gate
		const id = write()
		const selection = buildNodeSelectionFromMutationData(data, { schema: roleSchema, entityType, isRootCreated })
		return { ok: true, data: this.node(entityType, id, selection) }
	}

	private insertTag(data: Row): string {
		const id = `server-${++this.nextId}`
		this.rows.set(id, {
			id,
			color: 'gray',
			createdAt: NOW,
			secret: 'hidden',
			...data,
			name: this.normaliseName(data['name']),
		})
		return id
	}

	private updateArticle(id: string, changes: Row): string {
		const tags = changes['tags']
		if (!Array.isArray(tags)) return id
		for (const op of tags) {
			if (isRecord(op) && isRecord(op['create'])) {
				this.articleTags.get(id)?.push(this.insertTag(op['create']))
			}
		}
		return id
	}

	private node(entityType: string, id: string, selection: readonly unknown[]): Row {
		const row = this.rows.get(id) ?? {}
		const node: Row = {}
		for (const field of selection) {
			if (!isSelectionField(field)) throw new Error('selection entry is not a GraphQL field')
			if (entityType === 'Tag' && field.name === 'secret') throw new Error('Field "secret" is not defined for this role')
			if (entityType === 'Article' && field.name === 'tags') {
				node['tags'] = (this.articleTags.get(id) ?? []).map(tagId => this.node('Tag', tagId, field.selectionSet ?? []))
				continue
			}
			node[field.name] = row[field.name] ?? null
		}
		return node
	}
}

/** Wired the way ContemberBindxProvider wires it. */
function createPersister(store: SnapshotStore, adapter: BackendAdapter): BatchPersister {
	return new BatchPersister(adapter, store, new ActionDispatcher(store), {
		mutationCollector: new MutationCollector(store, new ContemberSchemaMutationAdapter(schema)),
		schema: new SchemaRegistry(schemaNamesToDef(schema)),
	})
}

function tagState(store: SnapshotStore, id: string): { data: Row; serverData: Row; dirty: string[] } {
	const snapshot = store.getEntitySnapshot<Row>('Tag', id)
	if (!snapshot) throw new Error(`Tag ${id} is not in the store`)
	// The dirty tracker keys by the persisted id once the temp id is mapped.
	const dirty = store.getDirtyFields('Tag', store.getPersistedId('Tag', id) ?? id)
	return { data: { ...snapshot.data }, serverData: { ...snapshot.serverData }, dirty }
}

describe('A created row read back after the create', () => {
	test('a top-level create reads the default and the `now` value the database filled in', async () => {
		const store = new SnapshotStore()
		const server = new Server()
		const tagId = store.createEntity('Tag', { name: 'New' })

		expect((await createPersister(store, server.adapter).persistAll()).success).toBe(true)

		const tag = tagState(store, tagId)
		expect(tag.data).toMatchObject({ color: 'gray', createdAt: NOW })
		expect(tag.serverData).toMatchObject({ color: 'gray', createdAt: NOW })
		expect(tag.dirty).toEqual([])
		// The create still leaves unset columns to the database.
		expect(server.sent).toStrictEqual([{ name: 'New' }])
	})

	test('a has-many create inside an update reads its filled-in columns too', async () => {
		const store = new SnapshotStore()
		const server = new Server()
		server.seedArticle('article-1', ['tag-1'])
		server.seedTag('tag-1', { name: 'Existing', color: 'blue', createdAt: '2020-01-01T00:00:00.000Z' })
		store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Article' }, true)
		store.setExistsOnServer('Article', 'article-1', true)
		store.setEntityData('Tag', 'tag-1', { id: 'tag-1', name: 'Existing', color: 'blue' }, true)
		store.setExistsOnServer('Tag', 'tag-1', true)
		store.getOrCreateHasMany('Article', 'article-1', 'tags', ['tag-1'])
		const tagId = store.createEntity('Tag', { name: 'New' })
		store.addToHasMany('Article', 'article-1', 'tags', tagId)

		expect((await createPersister(store, server.adapter).persistAll()).success).toBe(true)

		const tag = tagState(store, tagId)
		expect(tag.data).toMatchObject({ name: 'New', color: 'gray', createdAt: NOW })
		expect(tag.serverData).toMatchObject({ name: 'New', color: 'gray', createdAt: NOW })
		expect(tag.dirty).toEqual([])
		expect(server.sent).toStrictEqual([{ tags: [{ create: { name: 'New' }, alias: expect.any(String) }] }])
		// A row the update did not create keeps the client's view.
		expect(tagState(store, 'tag-1').data).not.toHaveProperty('createdAt')
	})

	test('a column the role cannot read is not asked for', async () => {
		const store = new SnapshotStore()
		const server = new Server()
		const tagId = store.createEntity('Tag', { name: 'New' })

		// The server rejects a selection of `secret`, as the API does for an unreadable field.
		expect((await createPersister(store, server.adapter).persistAll()).success).toBe(true)
		expect(tagState(store, tagId).serverData).not.toHaveProperty('secret')
	})

	test('a column edited while the create is in flight keeps the edit and stays dirty', async () => {
		const store = new SnapshotStore()
		const server = new Server()
		let release = (): void => {}
		server.gate = new Promise(resolve => {
			release = resolve
		})
		const tagId = store.createEntity('Tag', { name: 'New' })

		const persisting = createPersister(store, server.adapter).persistAll()
		await Promise.resolve()
		store.setFieldValue('Tag', tagId, ['color'], 'red')
		release()
		expect((await persisting).success).toBe(true)

		const tag = tagState(store, tagId)
		expect(tag.data['color']).toBe('red')
		expect(tag.serverData['color']).toBe('gray')
		expect(tag.dirty).toEqual(['color'])
	})

	test('a sent column keeps the sent value when the server echoes it normalised', async () => {
		const store = new SnapshotStore()
		const server = new Server()
		server.normaliseName = value => typeof value === 'string' ? value.trim() : value
		const tagId = store.createEntity('Tag', { name: ' New ' })

		expect((await createPersister(store, server.adapter).persistAll()).success).toBe(true)

		const tag = tagState(store, tagId)
		expect(tag.data['name']).toBe(' New ')
		expect(tag.serverData['name']).toBe(' New ')
		expect(tag.dirty).toEqual([])
	})
})
