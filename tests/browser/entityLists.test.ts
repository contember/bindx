import { test, expect, describe } from 'bun:test'
import { browserTest, el } from './browser.js'

browserTest('Entity Lists', () => {
	describe('Article View (read-only)', () => {
		test('renders article title and author', () => {
			expect(el('article-view').exists).toBe(true)
			expect(el('article-view-title').exists).toBe(true)
			expect(el('article-view-author').text).toContain('By:')
		})
	})

	describe('Author List', () => {
		test('renders all 5 authors', () => {
			expect(el('author-list').exists).toBe(true)
			expect(el('author-list-count').text).toContain('All Authors (5)')
		})

		test.each([
			'John Doe',
			'Jane Smith',
			'Bob Wilson',
			'Alice Brown',
			'Charlie Davis',
		])('shows author: %s', (name) => {
			expect(el(`author-item-${name}`).exists).toBe(true)
		})
	})

	describe('Tag List', () => {
		test('renders tag list section', () => {
			expect(el('tag-list').exists).toBe(true)
		})

		test.each([
			'React',
			'JavaScript',
			'TypeScript',
			'CSS',
			'Node.js',
			'GraphQL',
		])('shows tag badge: %s', (tag) => {
			expect(el(`tag-list-badge-${tag}`).exists).toBe(true)
		})
	})
})
