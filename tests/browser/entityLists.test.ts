import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { open, close, query } from './browser.js'

const URL = process.env.PLAYGROUND_URL ?? 'http://localhost:5180'

describe('Entity Lists', () => {
	beforeAll(() => {
		open(URL)
	})

	afterAll(() => {
		close()
	})

	describe('Article View (read-only)', () => {
		test('renders article title and author', () => {
			expect(query.exists('article-view')).toBe(true)
			expect(query.exists('article-view-title')).toBe(true)
			expect(query.text('article-view-author')).toContain('By:')
		})
	})

	describe('Author List', () => {
		test('renders all 5 authors', () => {
			expect(query.exists('author-list')).toBe(true)
			expect(query.text('author-list-count')).toContain('All Authors (5)')
		})

		test.each([
			'John Doe',
			'Jane Smith',
			'Bob Wilson',
			'Alice Brown',
			'Charlie Davis',
		])('shows author: %s', (name) => {
			expect(query.exists(`author-item-${name}`)).toBe(true)
		})
	})

	describe('Tag List', () => {
		test('renders tag list section', () => {
			expect(query.exists('tag-list')).toBe(true)
		})

		test.each([
			'React',
			'JavaScript',
			'TypeScript',
			'CSS',
			'Node.js',
			'GraphQL',
		])('shows tag badge: %s', (tag) => {
			expect(query.exists(`tag-list-badge-${tag}`)).toBe(true)
		})
	})
})
