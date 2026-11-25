import { describe, test, expect } from 'bun:test'
import {
	SnapshotStore,
	MutationCollector,
	ContemberSchemaMutationAdapter,
	ActionDispatcher,
	BatchPersister,
	SchemaRegistry,
	UndoManager,
	type BackendAdapter,
	type EntityPersistResult,
	type SchemaNames,
} from '@contember/bindx'
import { schemaNamesToDef } from '@contember/bindx-react'
import { buildNodeSelectionFromMutationData, ContemberSchema, type RawContemberSchema } from '@contember/bindx-client'

// A created row's columns the client did not send hold what the database filled in
// (a default, `now`); the create's response reads them back into the store.

/** The `now` the server stamps on its n-th inserted tag. */
const insertedAt = (n: number): string => `2026-11-24T10:00:0${n}.000Z`
const NOW = insertedAt(1)

const schema: SchemaNames = {
	entities: {
		Article: {
			name: 'Article',
			scalars: ['id', 'title'],
			fields: {
				id: { type: 'column' },
				title: { type: 'column' },
				tags: { type: 'many', entity: 'Tag', relationKind: 'manyHasMany' },
				cover: { type: 'one', entity: 'Tag', nullable: true },
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
				{
					__typename: '_Relation', name: 'cover', type: 'ManyHasOne', nullable: true, side: 'owning', targetEntity: 'Tag',
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
	private nextTagId = 0
	private nextArticleId = 0

	readonly adapter: BackendAdapter = {
		query: () => Promise.resolve([]),
		delete: () => Promise.resolve({ ok: true }),
		create: (entityType, data) => this.respond(entityType, data, true, () => (
			entityType === 'Tag' ? this.insertTag(data) : this.insertArticle(data)
		)),
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
		const id = `server-${++this.nextTagId}`
		this.rows.set(id, {
			id,
			color: 'gray',
			createdAt: insertedAt(this.nextTagId),
			secret: 'hidden',
			...data,
			name: this.normaliseName(data['name']),
		})
		return id
	}

	private insertArticle(data: Row): string {
		const id = `article-server-${++this.nextArticleId}`
		const cover = data['cover']
		const coverId = isRecord(cover) && isRecord(cover['create']) ? this.insertTag(cover['create']) : null
		this.rows.set(id, { id, title: data['title'] ?? null, cover: coverId })
		this.articleTags.set(id, [])
		return this.updateArticle(id, data)
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
			if (entityType === 'Article' && field.name === 'cover') {
				const coverId = row['cover']
				node['cover'] = typeof coverId === 'string' ? this.node('Tag', coverId, field.selectionSet ?? []) : null
				continue
			}
			node[field.name] = row[field.name] ?? null
		}
		return node
	}
}

/** Wired the way ContemberBindxProvider wires it. */
function createPersister(store: SnapshotStore, adapter: BackendAdapter, dispatcher = new ActionDispatcher(store)): BatchPersister {
	return new BatchPersister(adapter, store, dispatcher, {
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

	test('a has-one create inside a top-level create reads its filled-in columns', async () => {
		const store = new SnapshotStore()
		const server = new Server()
		const articleId = store.createEntity('Article', { title: 'Article' })
		const coverId = store.createEntity('Tag', { name: 'Cover' })
		store.getOrCreateRelation('Article', articleId, 'cover', {
			currentId: coverId, serverId: null, state: 'connected', serverState: 'disconnected', placeholderData: {},
		})

		expect((await createPersister(store, server.adapter).persistAll()).success).toBe(true)

		const cover = tagState(store, coverId)
		expect(cover.serverData).toMatchObject({ name: 'Cover', color: 'gray', createdAt: NOW })
		expect(cover.dirty).toEqual([])
		expect(server.sent).toStrictEqual([{ title: 'Article', cover: { create: { name: 'Cover' } } }])
	})

	test('two creates in one list each read their own row', async () => {
		const store = new SnapshotStore()
		const server = new Server()
		server.seedArticle('article-1', [])
		store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Article' }, true)
		store.setExistsOnServer('Article', 'article-1', true)
		store.getOrCreateHasMany('Article', 'article-1', 'tags', [])
		const first = store.createEntity('Tag', { name: 'First' })
		store.addToHasMany('Article', 'article-1', 'tags', first)
		const second = store.createEntity('Tag', { name: 'Second' })
		store.addToHasMany('Article', 'article-1', 'tags', second)

		expect((await createPersister(store, server.adapter).persistAll()).success).toBe(true)

		expect(tagState(store, first).serverData).toMatchObject({ name: 'First', createdAt: insertedAt(1) })
		expect(tagState(store, second).serverData).toMatchObject({ name: 'Second', createdAt: insertedAt(2) })
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

/** An article with one tag and two new ones; the server trims their names, so neither matches its row. */
function articleWithTwoTrimmedCreates(server: Server, store: SnapshotStore): { first: string; second: string } {
	server.seedArticle('article-1', ['tag-1'])
	server.seedTag('tag-1', { name: 'Existing', color: 'blue', createdAt: '2020-01-01T00:00:00.000Z' })
	store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Article' }, true)
	store.setExistsOnServer('Article', 'article-1', true)
	store.setEntityData('Tag', 'tag-1', { id: 'tag-1', name: 'Existing', color: 'blue' }, true)
	store.setExistsOnServer('Tag', 'tag-1', true)
	store.getOrCreateHasMany('Article', 'article-1', 'tags', ['tag-1'])
	// Each add is one gesture, the way a list handle records it.
	const add = (name: string): string => store.transaction(() => {
		const id = store.createEntity('Tag', { name })
		store.addToHasMany('Article', 'article-1', 'tags', id)
		return id
	})
	return { first: add(' First '), second: add(' Second ') }
}

describe('A list create no response row matches', () => {
	test('is replaced by the server rows with their filled-in columns, and not created again', async () => {
		const store = new SnapshotStore()
		const server = new Server()
		server.normaliseName = value => typeof value === 'string' ? value.trim() : value
		const { first, second } = articleWithTwoTrimmedCreates(server, store)
		const persister = createPersister(store, server.adapter)

		expect((await persister.persistAll()).success).toBe(true)

		expect(store.getHasManyOrderedIds('Article', 'article-1', 'tags')).toEqual(['tag-1', 'server-1', 'server-2'])
		expect(store.getEntitySnapshot<Row>('Tag', 'server-1')?.serverData).toMatchObject({ name: 'First', color: 'gray', createdAt: insertedAt(1) })
		expect(store.getEntitySnapshot<Row>('Tag', 'server-2')?.serverData).toMatchObject({ name: 'Second', color: 'gray', createdAt: insertedAt(2) })
		expect(store.getEntitySnapshot('Tag', first)).toBeUndefined()
		expect(store.getEntitySnapshot('Tag', second)).toBeUndefined()
		expect((await persister.persistAll()).results).toEqual([])
		expect(server.sent).toHaveLength(1)
	})

	test('is reported as superseded, with no persisted event', async () => {
		const store = new SnapshotStore()
		const server = new Server()
		server.normaliseName = value => typeof value === 'string' ? value.trim() : value
		const { first, second } = articleWithTwoTrimmedCreates(server, store)
		const dispatcher = new ActionDispatcher(store)
		const persisted: string[] = []
		dispatcher.getEventEmitter().on('entity:persisted', event => persisted.push(event.entityId))

		const outcomes: EntityPersistResult[] = []

		await createPersister(store, server.adapter, dispatcher).persistAll({ onEntityPersisted: entry => outcomes.push(entry) })

		for (const id of [first, second]) {
			const entry = outcomes.find(item => item.entityId === id)
			expect(entry).toMatchObject({ success: true, superseded: true })
			expect(entry?.persistedId).toBeUndefined()
		}
		expect(persisted).toEqual(['article-1'])
	})

	test('joins no view when only a filtered view of the list is loaded', async () => {
		const store = new SnapshotStore()
		const server = new Server()
		server.normaliseName = value => typeof value === 'string' ? value.trim() : value
		server.seedArticle('article-1', ['tag-1', 'tag-hidden'])
		server.seedTag('tag-1', { name: 'Red', color: 'red' })
		server.seedTag('tag-hidden', { name: 'Blue', color: 'blue' })
		store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Article' }, true)
		store.setExistsOnServer('Article', 'article-1', true)
		store.declareHasManyViewMembership('Article', 'tags', 'redTags', 'partial')
		store.getOrCreateHasMany('Article', 'article-1', 'tags', ['tag-1'], 'redTags')
		const first = store.createEntity('Tag', { name: ' First ' })
		store.addToHasMany('Article', 'article-1', 'tags', first, 'redTags')
		const second = store.createEntity('Tag', { name: ' Second ' })
		store.addToHasMany('Article', 'article-1', 'tags', second, 'redTags')
		const persister = createPersister(store, server.adapter)

		expect((await persister.persistAll()).success).toBe(true)

		expect(store.getHasManyOrderedIds('Article', 'article-1', 'tags', 'redTags')).toEqual(['tag-1'])
		expect([...store.getHasMany('Article', 'article-1', 'tags')?.serverIds ?? []]).toEqual(['tag-1'])
		expect(store.getEntitySnapshot('Tag', 'tag-hidden')).toBeUndefined()
		expect(store.getEntitySnapshot('Tag', first)).toBeUndefined()
		expect((await persister.persistAll()).results).toEqual([])
	})

	test('stays unresolved, keeping an edit made while the save was in flight', async () => {
		const store = new SnapshotStore()
		const server = new Server()
		server.normaliseName = value => typeof value === 'string' ? value.trim() : value
		const { first } = articleWithTwoTrimmedCreates(server, store)
		let release = (): void => {}
		server.gate = new Promise(resolve => {
			release = resolve
		})

		const persisting = createPersister(store, server.adapter).persistAll()
		await Promise.resolve()
		store.setFieldValue('Tag', first, ['color'], 'red')
		release()

		expect((await persisting).success).toBe(false)
		expect(store.getEntitySnapshot<Row>('Tag', first)?.data).toMatchObject({ name: ' First ', color: 'red' })
		expect(store.getHasManyOrderedIds('Article', 'article-1', 'tags')).toContain(first)
	})

	test('clears undo history, whose images still hold the dropped items', async () => {
		const store = new SnapshotStore()
		const server = new Server()
		server.normaliseName = value => typeof value === 'string' ? value.trim() : value
		const dispatcher = new ActionDispatcher(store)
		const undo = new UndoManager(store, { debounceMs: 0 })
		dispatcher.addMiddleware(undo.createMiddleware())
		articleWithTwoTrimmedCreates(server, store)
		expect(undo.getState().canUndo).toBe(true)
		const persister = new BatchPersister(server.adapter, store, dispatcher, {
			mutationCollector: new MutationCollector(store, new ContemberSchemaMutationAdapter(schema)),
			schema: new SchemaRegistry(schemaNamesToDef(schema)),
			undoManager: undo,
		})

		expect((await persister.persistAll()).success).toBe(true)
		undo.undo()

		expect(undo.getState().canUndo).toBe(false)
		expect(store.getHasManyOrderedIds('Article', 'article-1', 'tags')).toEqual(['tag-1', 'server-1', 'server-2'])
		expect((await persister.persistAll()).results).toEqual([])
		expect(server.sent).toHaveLength(1)
	})

	test('stays unresolved when the response does not list the relation at all', async () => {
		const store = new SnapshotStore()
		store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Article' }, true)
		store.setExistsOnServer('Article', 'article-1', true)
		store.getOrCreateHasMany('Article', 'article-1', 'tags', [])
		const created = store.createEntity('Tag', { name: 'New' })
		store.addToHasMany('Article', 'article-1', 'tags', created)
		const silent: BackendAdapter = {
			query: () => Promise.resolve([]),
			delete: () => Promise.resolve({ ok: true }),
			persist: (_entityType, id) => Promise.resolve({ ok: true, data: { id } }),
		}

		expect((await createPersister(store, silent).persistAll()).success).toBe(false)
		expect(store.getEntitySnapshot('Tag', created)).not.toBeUndefined()
	})
})
