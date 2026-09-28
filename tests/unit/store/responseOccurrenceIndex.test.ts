// Regression tests for https://github.com/contember/bindx/issues/123
import { describe, expect, test } from 'bun:test'
import { __internal } from '@contember/bindx-react'
import { ResponseOccurrenceIndex, type RelationTargetResolver } from '../../../packages/bindx/src/store/ResponseOccurrenceIndex.js'

const { createSelectionBuilder, getSelectionMeta } = __internal

interface Tag {
	id: string
	name: string
	color: string
}

interface Author {
	id: string
	name: string
	email: string
	tags: Tag[]
}

interface Article {
	id: string
	title: string
	author: Author | null
	coAuthor: Author | null
	tags: Tag[]
}

const relations: Record<string, Record<string, { target: string; isHasMany: boolean }>> = {
	Article: {
		author: { target: 'Author', isHasMany: false },
		coAuthor: { target: 'Author', isHasMany: false },
		tags: { target: 'Tag', isHasMany: true },
	},
	Author: {
		tags: { target: 'Tag', isHasMany: true },
	},
}

const schema: RelationTargetResolver = {
	getRelationTarget: (entityType, fieldName) => relations[entityType]?.[fieldName]?.target,
	isHasMany: (entityType, fieldName) => relations[entityType]?.[fieldName]?.isHasMany ?? false,
}

describe('ResponseOccurrenceIndex', () => {
	test('resolves every occurrence of an entity to the union of their fields', () => {
		const selection = getSelectionMeta(
			createSelectionBuilder<Article>().id().author(a => a.id().name()).coAuthor(a => a.id().email()),
		)
		const author = { id: 'author-1', name: 'Ann' }
		const coAuthor = { id: 'author-1', email: 'ann@example.com' }
		const index = new ResponseOccurrenceIndex()

		index.index('Article', { id: 'article-1', author, coAuthor }, selection, schema)

		const expected = { id: 'author-1', name: 'Ann', email: 'ann@example.com' }
		expect(index.resolve(author)).toEqual(expected)
		expect(index.resolve(coAuthor)).toBe(index.resolve(author))
	})

	test('returns an occurrence with no sibling as is', () => {
		const selection = getSelectionMeta(createSelectionBuilder<Article>().id().author(a => a.id().name()))
		const author = { id: 'author-1', name: 'Ann' }
		const index = new ResponseOccurrenceIndex()

		index.index('Article', { id: 'article-1', author }, selection, schema)

		expect(index.resolve(author)).toBe(author)
	})

	test('unites relations inside relations level by level', () => {
		const selection = getSelectionMeta(
			createSelectionBuilder<Article>()
				.id()
				.author(a => a.id().tags(t => t.id().name()))
				.coAuthor(a => a.id().tags(t => t.id().color())),
		)
		const narrowTag = { id: 'tag-1', name: 'News' }
		const otherTag = { id: 'tag-1', color: 'red' }
		const index = new ResponseOccurrenceIndex()

		index.index('Article', {
			id: 'article-1',
			author: { id: 'author-1', tags: [narrowTag] },
			coAuthor: { id: 'author-1', tags: [otherTag] },
		}, selection, schema)

		expect(index.resolve(narrowTag)).toEqual({ id: 'tag-1', name: 'News', color: 'red' })
	})

	test('unites the nodes of a paginated connection by id', () => {
		const selection = getSelectionMeta(
			createSelectionBuilder<Article>().id().tags(t => t.id().name()).author(a => a.id().tags(t => t.id().color())),
		)
		const node = { id: 'tag-1', name: 'News' }
		const otherNode = { id: 'tag-1', color: 'red' }
		const index = new ResponseOccurrenceIndex()

		index.index('Article', {
			id: 'article-1',
			tags: { pageInfo: { totalCount: 1 }, edges: [{ node }] },
			author: { id: 'author-1', tags: { pageInfo: { totalCount: 1 }, edges: [{ node: otherNode }] } },
		}, selection, schema)

		expect(index.resolve(node)).toEqual({ id: 'tag-1', name: 'News', color: 'red' })
	})

	test('keeps entity types that share an id apart', () => {
		const selection = getSelectionMeta(createSelectionBuilder<Article>().id().author(a => a.id().name()).tags(t => t.id().color()))
		const author = { id: 'shared', name: 'Ann' }
		const tag = { id: 'shared', color: 'red' }
		const index = new ResponseOccurrenceIndex()

		index.index('Article', { id: 'article-1', author, tags: [tag] }, selection, schema)

		expect(index.resolve(author)).toBe(author)
		expect(index.resolve(tag)).toBe(tag)
	})

	test('leaves out a relation whose target type the schema does not know', () => {
		const selection = getSelectionMeta(createSelectionBuilder<Article>().id().author(a => a.id().name()).coAuthor(a => a.id().email()))
		const author = { id: 'author-1', name: 'Ann' }
		const coAuthor = { id: 'author-1', email: 'ann@example.com' }
		const index = new ResponseOccurrenceIndex()
		const withoutCoAuthor: RelationTargetResolver = {
			getRelationTarget: (entityType, fieldName) => (fieldName === 'coAuthor' ? undefined : schema.getRelationTarget(entityType, fieldName)),
			isHasMany: schema.isHasMany,
		}

		index.index('Article', { id: 'article-1', author, coAuthor }, selection, withoutCoAuthor)

		expect(index.resolve(author)).toBe(author)
		expect(index.resolve(coAuthor)).toBe(coAuthor)
	})

	test('takes a scalar the occurrences disagree on from the one visited last', () => {
		const selection = getSelectionMeta(createSelectionBuilder<Article>().id().author(a => a.id().name()).coAuthor(a => a.id().name()))
		const author = { id: 'author-1', name: 'Ann' }
		const index = new ResponseOccurrenceIndex()

		index.index('Article', { id: 'article-1', author, coAuthor: { id: 'author-1', name: 'Anna' } }, selection, schema)

		// Breadth first, relations in selection order: `coAuthor` is visited after `author`.
		expect(index.resolve(author)['name']).toBe('Anna')
	})

	test('indexes the items of a list response together', () => {
		const selection = getSelectionMeta(createSelectionBuilder<Article>().id().author(a => a.id().name()).coAuthor(a => a.id().email()))
		const author = { id: 'author-1', name: 'Ann' }
		const index = new ResponseOccurrenceIndex()

		index.index('Article', [
			{ id: 'article-1', author },
			{ id: 'article-2', coAuthor: { id: 'author-1', email: 'ann@example.com' } },
		], selection, schema)

		expect(index.resolve(author)).toEqual({ id: 'author-1', name: 'Ann', email: 'ann@example.com' })
	})
})
