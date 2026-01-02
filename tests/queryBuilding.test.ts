import { describe, test, expect } from 'bun:test'
import {
	createModelProxy,
	extractFragmentMeta,
	buildQuery,
	defineFragment,
	type ModelProxy,
} from '../src/index.js'

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

describe('Query Building', () => {
	describe('extractFragmentMeta', () => {
		test('should extract scalar field paths', () => {
			const proxy = createModelProxy<Article>()
			const result = { title: proxy.title, content: proxy.content }
			const meta = extractFragmentMeta(result)

			expect(meta.fields.size).toBe(2)
			expect(meta.fields.get('title')?.path).toEqual(['title'])
			expect(meta.fields.get('content')?.path).toEqual(['content'])
		})

		test('should extract nested object paths', () => {
			const proxy = createModelProxy<Article>()
			const result = {
				title: proxy.title,
				author: {
					name: proxy.author.name,
					email: proxy.author.email,
				},
			}
			const meta = extractFragmentMeta(result)

			expect(meta.fields.size).toBe(2)
			expect(meta.fields.get('title')?.path).toEqual(['title'])
			expect(meta.fields.get('author')?.path).toEqual(['author'])
			expect(meta.fields.get('author')?.nested).toBeDefined()
			expect(meta.fields.get('author')?.nested?.fields.get('name')?.path).toEqual(['author', 'name'])
			expect(meta.fields.get('author')?.nested?.fields.get('email')?.path).toEqual(['author', 'email'])
		})

		test('should extract array with map', () => {
			const proxy = createModelProxy<Article>()
			const result = {
				title: proxy.title,
				tags: proxy.tags.map(t => ({
					name: t.name,
				})),
			}
			const meta = extractFragmentMeta(result)

			expect(meta.fields.size).toBe(2)
			expect(meta.fields.get('tags')?.isArray).toBe(true)
			expect(meta.fields.get('tags')?.path).toEqual(['tags'])
			expect(meta.fields.get('tags')?.arrayItemMeta).toBeDefined()
			expect(meta.fields.get('tags')?.arrayItemMeta?.fields.get('name')?.path).toEqual(['name'])
		})
	})

	describe('buildQuery', () => {
		test('should build query for scalar fields', () => {
			const proxy = createModelProxy<Article>()
			const result = { title: proxy.title }
			const meta = extractFragmentMeta(result)
			const query = buildQuery(meta)

			expect(query.fields.length).toBe(1)
			expect(query.fields[0]?.name).toBe('title')
			expect(query.fields[0]?.sourcePath).toEqual(['title'])
		})

		test('should build query for nested objects', () => {
			const proxy = createModelProxy<Article>()
			const result = {
				author: {
					name: proxy.author.name,
				},
			}
			const meta = extractFragmentMeta(result)
			const query = buildQuery(meta)

			expect(query.fields.length).toBe(1)
			expect(query.fields[0]?.name).toBe('author')
			expect(query.fields[0]?.nested).toBeDefined()
			expect(query.fields[0]?.nested?.fields[0]?.name).toBe('name')
		})

		test('should build query for arrays', () => {
			const proxy = createModelProxy<Article>()
			const result = {
				tags: proxy.tags.map(t => ({ name: t.name })),
			}
			const meta = extractFragmentMeta(result)
			const query = buildQuery(meta)

			expect(query.fields.length).toBe(1)
			expect(query.fields[0]?.name).toBe('tags')
			expect(query.fields[0]?.isArray).toBe(true)
			expect(query.fields[0]?.nested).toBeDefined()
		})
	})

	describe('defineFragment', () => {
		test('should create reusable fragment', () => {
			const AuthorFragment = defineFragment((author: ModelProxy<Author>) => ({
				id: author.id,
				name: author.name,
			}))

			expect(AuthorFragment.__meta).toBeDefined()
			expect(AuthorFragment.__meta.fields.size).toBe(2)
		})

		test('fragment.compose should merge metadata', () => {
			const AuthorFragment = defineFragment((author: ModelProxy<Author>) => ({
				id: author.id,
				name: author.name,
			}))

			const proxy = createModelProxy<Article>()
			const result = {
				title: proxy.title,
				author: AuthorFragment.compose(proxy.author),
			}
			const meta = extractFragmentMeta(result)

			expect(meta.fields.size).toBe(2)
			expect(meta.fields.get('author')?.nested).toBeDefined()
			expect(meta.fields.get('author')?.nested?.fields.get('id')?.path).toEqual(['author', 'id'])
			expect(meta.fields.get('author')?.nested?.fields.get('name')?.path).toEqual(['author', 'name'])
		})
	})
})
