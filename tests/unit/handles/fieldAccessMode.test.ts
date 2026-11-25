import { describe, expect, test } from 'bun:test'
import {
	EntityHandle,
	SchemaRegistry,
	UnfetchedFieldError,
	type EntityAccessor,
	type FieldAccessMode,
	type SchemaDefinition,
	type SelectionFieldMeta,
	type SelectionMeta,
} from '@contember/bindx'
import { createTestDispatcher } from '../shared/unitTestHelpers.js'

interface Article { id: string; title: string; author: Author | null; tags: Tag[] }
interface Author { id: string; name: string }
interface Tag { id: string; label: string }

interface TestSchema {
	Article: Article
	Author: Author
	Tag: Tag
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
	},
}

const schema = new SchemaRegistry(definition)

const scalar = (name: string): [string, SelectionFieldMeta] =>
	[name, { fieldName: name, alias: name, path: [name], isArray: false, isRelation: false }]

const relation = (name: string, nested: SelectionMeta): [string, SelectionFieldMeta] =>
	[name, { fieldName: name, alias: name, path: [name], isArray: false, isRelation: true, nested }]

const idOnly = (): SelectionMeta => ({ fields: new Map([scalar('id')]) })

/** Selects only the ids, so `title`, `author.name` and `tags[].label` are outside it. */
const selection: SelectionMeta = {
	fields: new Map([scalar('id'), relation('author', idOnly()), relation('tags', idOnly())]),
}

function createArticle(fieldAccess?: FieldAccessMode): EntityAccessor<Article> {
	const { store, dispatcher } = createTestDispatcher()
	store.writeServerRead('Article', {
		id: 'article-1',
		title: 'Hello',
		author: { id: 'author-1', name: 'Jane' },
		tags: [{ id: 'tag-1', label: 'A' }],
	}, schema)
	return EntityHandle.create<Article>('article-1', 'Article', store, dispatcher, schema, undefined, selection, undefined, fieldAccess)
}

describe('EntityHandle field access outside the selection', () => {
	test('throws by default', () => {
		const article = createArticle()

		expect(() => article.title).toThrow(UnfetchedFieldError)
		expect(() => article.author.name).toThrow(UnfetchedFieldError)
		expect(() => article.tags.items[0]?.label).toThrow(UnfetchedFieldError)
	})

	test('reads the field when unchecked, through has-one and has-many handles too', () => {
		const article = createArticle('unchecked')

		expect(article.title.value).toBe('Hello')
		expect(article.author.name.value).toBe('Jane')
		expect(article.tags.items[0]?.label.value).toBe('A')
	})

	test('leaves $data as the selection shapes it', () => {
		expect(createArticle('unchecked').$data).toStrictEqual(createArticle().$data)
	})
})
