import { describe, test, expect } from 'bun:test'
import { createFragment, buildQueryFromSelection, __internal } from '@contember/bindx-react'

const { createSelectionBuilder, getSelectionMeta } = __internal

interface Author {
	id: string
	name: string
	email: string
}

interface Tag {
	id: string
	name: string
}

interface Article {
	id: string
	title: string
	content: string
	author: Author
	tags: Tag[]
}

describe('Query Building with Fluent API', () => {
	describe('createSelectionBuilder', () => {
		test('should extract scalar field paths', () => {
			const builder = createSelectionBuilder<Article>()
			const result = builder.title().content()
			const meta = getSelectionMeta(result)

			expect(meta.fields.size).toBe(2)
			expect(meta.fields.get('title')?.fieldName).toBe('title')
			expect(meta.fields.get('content')?.fieldName).toBe('content')
		})

		test('should extract nested object paths with callback', () => {
			const builder = createSelectionBuilder<Article>()
			const result = builder.title().author(a => a.name().email())
			const meta = getSelectionMeta(result)

			expect(meta.fields.size).toBe(2)
			expect(meta.fields.get('title')?.fieldName).toBe('title')
			expect(meta.fields.get('author')?.fieldName).toBe('author')
			expect(meta.fields.get('author')?.nested).toBeDefined()
			expect(meta.fields.get('author')?.nested?.fields.get('name')?.fieldName).toBe('name')
			expect(meta.fields.get('author')?.nested?.fields.get('email')?.fieldName).toBe('email')
		})

		test('should handle has-many with callback', () => {
			const builder = createSelectionBuilder<Article>()
			const result = builder.title().tags(t => t.name())
			const meta = getSelectionMeta(result)

			expect(meta.fields.size).toBe(2)
			expect(meta.fields.get('tags')?.fieldName).toBe('tags')
			expect(meta.fields.get('tags')?.nested).toBeDefined()
			expect(meta.fields.get('tags')?.nested?.fields.get('name')?.fieldName).toBe('name')
		})

		test('should support alias with scalar field', () => {
			const builder = createSelectionBuilder<Article>()
			const result = builder.title({ as: 'headline' })
			const meta = getSelectionMeta(result)

			expect(meta.fields.size).toBe(1)
			expect(meta.fields.get('headline')?.fieldName).toBe('title')
			expect(meta.fields.get('headline')?.alias).toBe('headline')
		})
	})

	describe('buildQueryFromSelection', () => {
		test('should build query for scalar fields', () => {
			const builder = createSelectionBuilder<Article>()
			const result = builder.title()
			const meta = getSelectionMeta(result)
			const query = buildQueryFromSelection(meta)

			// 'id' is automatically added for all queries
			expect(query.fields.length).toBe(2)
			expect(query.fields[0]?.name).toBe('id')
			expect(query.fields[1]?.name).toBe('title')
			expect(query.fields[1]?.sourcePath).toEqual(['title'])
		})

		test('should build query for nested objects', () => {
			const builder = createSelectionBuilder<Article>()
			const result = builder.author(a => a.name())
			const meta = getSelectionMeta(result)
			const query = buildQueryFromSelection(meta)

			// 'id' is automatically added for all queries
			expect(query.fields.length).toBe(2)
			expect(query.fields[0]?.name).toBe('id')
			expect(query.fields[1]?.name).toBe('author')
			expect(query.fields[1]?.nested).toBeDefined()
			// 'id' is also automatically added for nested queries
			expect(query.fields[1]?.nested?.fields[0]?.name).toBe('id')
			expect(query.fields[1]?.nested?.fields[1]?.name).toBe('name')
		})

		test('should build query with has-many parameters', () => {
			const builder = createSelectionBuilder<Article>()
			const result = builder.tags({ filter: { name: { eq: 'featured' } }, limit: 10 }, t => t.name())
			const meta = getSelectionMeta(result)
			const query = buildQueryFromSelection(meta)

			// 'id' is automatically added for all queries
			expect(query.fields.length).toBe(2)
			expect(query.fields[0]?.name).toBe('id')
			// The name is the auto-generated alias (tags_xxx) but sourcePath is still ['tags']
			const tagsField = query.fields[1]
			expect(tagsField?.sourcePath).toEqual(['tags'])
			expect(tagsField?.isArray).toBe(true)
			expect(tagsField?.filter).toEqual({ name: { eq: 'featured' } })
			expect(tagsField?.limit).toBe(10)
		})
	})

	describe('createFragment', () => {
		test('should create reusable fragment', () => {
			const AuthorFragment = createFragment<Author>()(e => e.id().name())

			expect(AuthorFragment.__meta).toBeDefined()
			expect(AuthorFragment.__meta.fields.size).toBe(2)
			expect(AuthorFragment.__isFragment).toBe(true)
		})

		test('fragment should be usable in has-one selection', () => {
			const AuthorFragment = createFragment<Author>()(e => e.id().name())

			const builder = createSelectionBuilder<Article>()
			const result = builder.title().author(AuthorFragment)
			const meta = getSelectionMeta(result)

			expect(meta.fields.size).toBe(2)
			expect(meta.fields.get('author')?.nested).toBeDefined()
			expect(meta.fields.get('author')?.nested?.fields.get('id')?.fieldName).toBe('id')
			expect(meta.fields.get('author')?.nested?.fields.get('name')?.fieldName).toBe('name')
		})

		test('fragment should be usable in has-many selection', () => {
			const TagFragment = createFragment<Tag>()(e => e.id().name())

			const builder = createSelectionBuilder<Article>()
			const result = builder.tags(TagFragment)
			const meta = getSelectionMeta(result)

			expect(meta.fields.size).toBe(1)
			expect(meta.fields.get('tags')?.nested).toBeDefined()
			expect(meta.fields.get('tags')?.nested?.fields.get('id')?.fieldName).toBe('id')
			expect(meta.fields.get('tags')?.nested?.fields.get('name')?.fieldName).toBe('name')
		})
	})
})
