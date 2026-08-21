import { describe, test, expect } from 'bun:test'
import {
	ActionDispatcher,
	BatchPersister,
	EntityHandle,
	FIELD_REF_META,
	MutationCollector,
	SchemaRegistry,
	SnapshotStore,
	type BackendAdapter,
	type SchemaDefinition,
	type SelectionMeta,
} from '@contember/bindx'

interface TestArticle {
	id: string
	title: string
	author: TestAuthor | null
	tags: TestTag[]
}

interface TestAuthor { id: string; name: string }
interface TestTag { id: string; name: string }

interface TestSchema {
	Article: TestArticle
	Author: TestAuthor
	Tag: TestTag
	[key: string]: object
}

const schemaDefinition: SchemaDefinition<TestSchema> = {
	entities: {
		Article: {
			fields: {
				id: { type: 'scalar' },
				title: { type: 'scalar' },
				author: { type: 'hasOne', target: 'Author' },
				tags: { type: 'hasMany', target: 'Tag', relationKind: 'manyHasMany' },
			},
		},
		Author: { fields: { id: { type: 'scalar' }, name: { type: 'scalar' } } },
		Tag: { fields: { id: { type: 'scalar' }, name: { type: 'scalar' } } },
	},
}

const selection: SelectionMeta = {
	fields: new Map([
		['id', { fieldName: 'id', alias: 'id', path: ['id'], isArray: false, isRelation: false }],
		['title', { fieldName: 'title', alias: 'title', path: ['title'], isArray: false, isRelation: false }],
	]),
}

function createHandle(selected?: SelectionMeta): EntityHandle<TestArticle> {
	const store = new SnapshotStore()
	store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Hello' }, true)
	return EntityHandle.createRaw<TestArticle>(
		'a-1',
		'Article',
		store,
		new ActionDispatcher(store),
		new SchemaRegistry(schemaDefinition),
		undefined,
		selected,
	)
}

const aliasedSelection: SelectionMeta = {
	fields: new Map([
		['data', { fieldName: 'title', alias: 'data', path: ['title'], isArray: false, isRelation: false }],
		['isDirty', {
			fieldName: 'author',
			alias: 'isDirty',
			path: ['author'],
			isArray: false,
			isRelation: true,
			nested: { fields: new Map([
				['name', { fieldName: 'name', alias: 'name', path: ['name'], isArray: false, isRelation: false }],
			]) },
		}],
		['tags_filtered', {
			fieldName: 'tags',
			alias: 'tags_filtered',
			path: ['tags'],
			isArray: true,
			isRelation: true,
			nested: { fields: new Map([
				['name', { fieldName: 'name', alias: 'name', path: ['name'], isArray: false, isRelation: false }],
			]) },
		}],
		['tags_auto_hash', {
			fieldName: 'tags',
			alias: 'tags_auto_hash',
			path: ['tags'],
			isArray: true,
			isRelation: true,
			nested: { fields: new Map([
				['name', { fieldName: 'name', alias: 'name', path: ['name'], isArray: false, isRelation: false }],
			]) },
		}],
	]),
}

function createAliasedHandle(): EntityHandle<TestArticle> {
	const store = new SnapshotStore()
	store.setEntityData('Article', 'a-1', {
		id: 'a-1',
		data: 'Aliased title',
		isDirty: { id: 'author-1', name: 'Ada' },
		tags_filtered: [{ id: 'tag-1', name: 'One' }],
		tags_auto_hash: [{ id: 'tag-2', name: 'Two' }],
	}, true)
	return EntityHandle.createRaw<TestArticle>(
		'a-1',
		'Article',
		store,
		new ActionDispatcher(store),
		new SchemaRegistry(schemaDefinition),
		undefined,
		aliasedSelection,
	)
}

/**
 * Enumerating an entity accessor must list `id` and the selected fields only — never
 * the handle's instance fields, which a generic walker would then read as entity
 * fields and trip selection validation.
 */
describe('entity accessor enumeration', () => {
	test('lists id and the selected fields', () => {
		const accessor = EntityHandle.wrapProxy(createHandle(selection))
		expect(Object.keys(accessor)).toEqual(['id', 'title'])
		const seen: string[] = []
		for (const key in accessor) seen.push(key)
		expect(seen).toEqual(['id', 'title'])
	})

	test('reading every enumerated key does not throw', () => {
		const accessor = EntityHandle.wrapProxy(createHandle(selection))
		for (const [key, value] of Object.entries(accessor)) {
			expect(value, key).toBeDefined()
		}
		expect(Object.getOwnPropertyDescriptor(accessor, 'store')).toBeUndefined()
	})

	test('without a selection only id is listed', () => {
		const accessor = EntityHandle.wrapProxy(createHandle())
		expect(Object.keys(accessor)).toEqual(['id'])
	})

	test('enumerates aliases and every scalar/relation value is readable', () => {
		const accessor = EntityHandle.wrapProxy(createAliasedHandle())

		expect(Object.keys(accessor)).toEqual(['id', 'data', 'isDirty', 'tags_filtered', 'tags_auto_hash'])
		expect(Reflect.get(accessor, 'data').value).toBe('Aliased title')
		expect(Reflect.get(accessor, 'data')[FIELD_REF_META].fieldName).toBe('title')
		expect(Reflect.get(accessor, 'isDirty').name.value).toBe('Ada')
		expect(Reflect.get(accessor, 'isDirty')[FIELD_REF_META].fieldName).toBe('author')
		expect(Reflect.get(accessor, 'tags_filtered').items[0].name.value).toBe('One')
		expect(Reflect.get(accessor, 'tags_filtered')[FIELD_REF_META].fieldName).toBe('tags')
		expect(Reflect.get(accessor, 'tags_auto_hash').items[0].name.value).toBe('Two')
		for (const value of Object.values(accessor)) expect(value).toBeDefined()
	})

	test('writes and reconciles an aliased scalar through its schema field', async () => {
		const store = new SnapshotStore()
		store.setEntityData('Article', 'a-1', { id: 'a-1', data: 'Aliased title' }, true)
		const dispatcher = new ActionDispatcher(store)
		const schema = new SchemaRegistry(schemaDefinition)
		const handle = EntityHandle.createRaw<TestArticle>(
			'a-1',
			'Article',
			store,
			dispatcher,
			schema,
			undefined,
			aliasedSelection,
		)
		const title = handle.field('title', 'data')
		let changes = 0
		title.onChange(() => { changes++ })

		expect(title.value).toBe('Aliased title')
		title.setValue('Updated title')

		const data = store.getEntitySnapshot<Record<string, unknown>>('Article', 'a-1')?.data
		expect(title.value).toBe('Updated title')
		expect(data?.['data']).toBe('Aliased title')
		expect(data?.['title']).toBe('Updated title')
		expect(title.isDirty).toBe(true)
		expect(store.getDirtyFields('Article', 'a-1')).toContain('title')
		expect(changes).toBe(1)
		const collector = new MutationCollector(store, schema)
		expect(collector.collectUpdateData('Article', 'a-1')).toEqual({
			title: 'Updated title',
		})

		const adapter: BackendAdapter = {
			query: () => Promise.resolve([]),
			persist: () => Promise.resolve({
				ok: true,
				data: { id: 'a-1', data: 'Aliased title', title: 'Updated title' },
			}),
			create: (_entityType, createData) => Promise.resolve({ ok: true, data: createData }),
			delete: () => Promise.resolve({ ok: true }),
		}
		await new BatchPersister(adapter, store, dispatcher, {
			mutationCollector: collector,
		}).persistAll()

		expect(title.value).toBe('Updated title')
		expect(title.serverValue).toBe('Updated title')
		expect(title.isDirty).toBe(false)
		expect(store.getDirtyFields('Article', 'a-1')).toEqual([])
	})

	test('keeps unselected fields unavailable', () => {
		const accessor = EntityHandle.wrapProxy(createAliasedHandle())
		expect(() => Reflect.get(accessor, 'title')).toThrow('unfetched field')
	})
})
