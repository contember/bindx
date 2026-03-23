import { test, expect, describe } from 'bun:test'
import { browserTest, el, waitFor } from './browser.js'

browserTest('Entity Lists', () => {
	describe('Article View (read-only)', () => {
		test('renders article title and author', () => {
			waitFor(() => el('article-view').exists)
			expect(el('article-view-title').exists).toBe(true)
			expect(el('article-view-author').text).toContain('By:')
		})
	})

	describe('Author List', () => {
		test('renders author list', () => {
			expect(el('author-list').exists).toBe(true)
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
}, 'entity-lists')
