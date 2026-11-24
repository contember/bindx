import { describe, expect, test } from 'bun:test'
import {
	EntityHandle,
	SchemaRegistry,
	type SchemaDefinition,
	type SelectionFieldMeta,
	type SelectionMeta,
} from '@contember/bindx'
import { createTestDispatcher } from '../shared/unitTestHelpers.js'

interface Article { id: string; title: string; author: Author | null; tags: Tag[] }
interface Author { id: string; name: string }
interface Tag { id: string; label: string }
interface Other { id: string; value: string }

interface TestSchema {
	Article: Article
	Author: Author
	Tag: Tag
	Other: Other
	[key: string]: object
}

const definition: SchemaDefinition<TestSchema> = {
	entities: {
		Article: {
			fields: {
				id: { type: 'scalar' },
				title: { type: 'scalar' },
				author: { type: 'hasOne', target: 'Author' },
				tags: { type: 'hasMany', target: 'Tag' },
			},
		},
		Author: { fields: { id: { type: 'scalar' }, name: { type: 'scalar' } } },
		Tag: { fields: { id: { type: 'scalar' }, label: { type: 'scalar' } } },
		Other: { fields: { id: { type: 'scalar' }, value: { type: 'scalar' } } },
	},
}

const schema = new SchemaRegistry(definition)

const scalar = (name: string): [string, SelectionFieldMeta] =>
	[name, { fieldName: name, alias: name, path: [name], isArray: false, isRelation: false }]

const relation = (name: string, alias: string, nested: SelectionMeta): [string, SelectionFieldMeta] =>
	[alias, { fieldName: name, alias, path: [name], isArray: false, isRelation: true, nested }]

const selection: SelectionMeta = {
	fields: new Map([
		scalar('id'),
		scalar('title'),
		relation('author', 'author', { fields: new Map([scalar('id'), scalar('name')]) }),
		relation('tags', 'tags', { fields: new Map([scalar('id'), scalar('label')]) }),
	]),
}

function setup(): { article: EntityHandle<Article>; write: (entityType: string, id: string, field: string, value: string) => void } {
	const { store, dispatcher } = createTestDispatcher()
	store.writeServerRead('Article', {
		id: 'article-1',
		title: 'Hello',
		author: { id: 'author-1', name: 'Jane' },
		tags: [{ id: 'tag-1', label: 'A' }, { id: 'tag-2', label: 'B' }],
	}, schema)
	store.writeServerRead('Other', { id: 'other-1', value: 'x' }, schema)
	return {
		article: EntityHandle.createRaw<Article>('article-1', 'Article', store, dispatcher, schema, undefined, selection),
		write: (entityType, id, field, value) => store.setFieldValue(entityType, id, [field], value),
	}
}

describe('EntityHandle.data with a selection', () => {
	test('should keep its identity when an entity outside it changes', () => {
		const { article, write } = setup()
		const before = article.data

		write('Other', 'other-1', 'value', 'y')

		expect(article.data).toBe(before)
	})

	test('should change only the path to a changed related entity', () => {
		const { article, write } = setup()
		const before = article.data

		write('Tag', 'tag-2', 'label', 'Changed')
		const after = article.data

		expect(after).not.toBe(before)
		expect(after?.tags[1]?.label).toBe('Changed')
		expect(after?.tags[0]).toBe(before?.tags[0])
		expect(after?.author).toBe(before?.author)
	})

	test('should leave out a list view that was never read', () => {
		const { store, dispatcher } = createTestDispatcher()
		store.writeServerRead('Article', { id: 'article-1', title: 'Hello', tags: [{ id: 'tag-1', label: 'A' }] }, schema)
		const filtered: SelectionMeta = {
			fields: new Map([
				scalar('id'),
				relation('tags', 'tags_filtered', { fields: new Map([scalar('id')]) }),
			]),
		}
		const article = EntityHandle.createRaw<Article>('article-1', 'Article', store, dispatcher, schema, undefined, filtered)

		expect(Object.keys(article.data ?? {})).toEqual(['id', 'title'])
	})
})
