// Regression tests for https://github.com/contember/bindx/issues/123
import { describe, expect, test } from 'bun:test'
import { __internal, createFragment } from '@contember/bindx-react'
import { planOccurrenceWalk, ResponseOccurrenceIndex, type RelationTargetResolver } from '../../../packages/bindx/src/store/ResponseOccurrenceIndex.js'

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

interface Section {
	id: string
	article: Article | null
	reviewer: Author | null
}

interface Article {
	id: string
	title: string
	author: Author | null
	coAuthor: Author | null
	tags: Tag[]
	sections: Section[]
}

const relations: Record<string, Record<string, { target: string; isHasMany: boolean }>> = {
	Article: {
		author: { target: 'Author', isHasMany: false },
		coAuthor: { target: 'Author', isHasMany: false },
		tags: { target: 'Tag', isHasMany: true },
		sections: { target: 'Section', isHasMany: true },
	},
	Section: {
		article: { target: 'Article', isHasMany: false },
		reviewer: { target: 'Author', isHasMany: false },
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
		const selection = getSelectionMeta(
			createSelectionBuilder<Article>()
				.id()
				.author(a => a.id().name().tags(t => t.id().name()))
				.coAuthor(a => a.id().email())
				.tags(t => t.id().color()),
		)
		const author = { id: 'shared', name: 'Ann', tags: [{ id: 'tag-1', name: 'News' }] }
		const tag = { id: 'shared', color: 'red' }
		const index = new ResponseOccurrenceIndex()

		index.index('Article', { id: 'article-1', author, coAuthor: { id: 'author-2', email: 'bob@example.com' }, tags: [tag] }, selection, schema)

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

	describe('fast path', () => {
		const countingSchema = (): { resolver: RelationTargetResolver; calls: () => number } => {
			let calls = 0
			return {
				resolver: {
					getRelationTarget: (entityType, fieldName) => {
						calls++
						return schema.getRelationTarget(entityType, fieldName)
					},
					isHasMany: schema.isHasMany,
				},
				calls: () => calls,
			}
		}
		const row = (i: number): { article: Record<string, unknown>; nestedArticle: Record<string, unknown> } => {
			const nestedArticle = { id: `article-${i}`, author: { id: 'author-1', name: 'Ann' } }
			const article = { id: `article-${i}`, author: { id: 'author-1', name: 'Ann' }, sections: [{ id: `section-${i}`, article: nestedArticle }] }
			return { article, nestedArticle }
		}
		const rows = (count: number): Record<string, unknown>[] => Array.from({ length: count }, (_, i) => row(i).article)

		test('finds no repeated type in a selection that reaches every type once', () => {
			const selection = getSelectionMeta(createSelectionBuilder<Article>().id().author(a => a.id().name()).tags(t => t.id().name()))

			expect([...planOccurrenceWalk('Article', selection, schema).repeatedTypes]).toEqual([])
		})

		test('finds the type a cycle reaches twice', () => {
			const selection = getSelectionMeta(
				createSelectionBuilder<Article>().id().tags(t => t.id().name()).sections(s => s.id().article(a => a.id().tags(t => t.id().color()))),
			)
			const plan = planOccurrenceWalk('Article', selection, schema)

			expect([...plan.repeatedTypes].sort()).toEqual(['Article', 'Tag'])
		})

		test('walks only the relations that lead to a repeated type', () => {
			const selection = getSelectionMeta(
				createSelectionBuilder<Article>().id().author(a => a.id().name()).sections(s => s.id().article(a => a.id().title())),
			)
			const plan = planOccurrenceWalk('Article', selection, schema)

			expect([...plan.repeatedTypes]).toEqual(['Article'])
			expect(plan.nodesToWalk.has(selection)).toBe(true)
			expect(plan.nodesToWalk.has(selection.fields.get('sections')!.nested!)).toBe(true)
			expect(plan.nodesToWalk.has(selection.fields.get('author')!.nested!)).toBe(false)
		})

		test('skips walking a response whose selection repeats no type', () => {
			const selection = getSelectionMeta(createSelectionBuilder<Article>().id().author(a => a.id().name()))
			const callsFor = (rowCount: number): number => {
				const { resolver, calls } = countingSchema()
				new ResponseOccurrenceIndex().index('Article', rows(rowCount), selection, resolver)
				return calls()
			}

			// Only the plan consults the schema, once per selection position; the rows are never walked.
			expect(callsFor(1000)).toBe(callsFor(10))
			expect(callsFor(10)).toBeLessThan(10)
		})

		test('walks the ancestors of every position a reused fragment takes', () => {
			const PersonFragment = createFragment<Author>()(a => a.id().name())
			const selection = getSelectionMeta(
				createSelectionBuilder<Article>().id().author(PersonFragment).sections(s => s.id().reviewer(PersonFragment)),
			)
			const plan = planOccurrenceWalk('Article', selection, schema)

			expect([...plan.repeatedTypes]).toEqual(['Author'])
			expect(plan.nodesToWalk.has(selection.fields.get('sections')!.nested!)).toBe(true)

			const reviewer = { id: 'author-1', name: 'Ann' }
			const author = { id: 'author-1', name: 'Ann' }
			const index = new ResponseOccurrenceIndex()
			index.index('Article', { id: 'article-1', author, sections: [{ id: 'section-1', reviewer }] }, selection, schema)

			expect(index.resolve(reviewer)).toBe(index.resolve(author))
		})

		test('walks a response whose selection reaches a type twice', () => {
			const selection = getSelectionMeta(
				createSelectionBuilder<Article>().id().author(a => a.id().name()).sections(s => s.id().article(a => a.id().author(u => u.id().name()))),
			)
			const { resolver, calls } = countingSchema()
			const index = new ResponseOccurrenceIndex()
			const first = row(0)

			index.index('Article', [first.article, ...rows(100).slice(1)], selection, resolver)

			expect(calls()).toBeGreaterThan(100)
			expect(index.resolve(first.nestedArticle)).toBe(index.resolve(first.article))
		})
	})
})
