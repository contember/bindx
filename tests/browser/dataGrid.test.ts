import { test, expect, describe } from 'bun:test'
import { browserTest, el, tid, wait } from './browser.js'

browserTest('DataGrid', () => {
	describe('styled rendering', () => {
		test('table structure renders', () => {
			expect(el('datagrid-example').exists).toBe(true)
			expect(el('datagrid-table').exists).toBe(true)
			expect(el('datagrid-header').exists).toBe(true)
			expect(el('datagrid-body').exists).toBe(true)
			expect(el('datagrid-row-0').exists).toBe(true)
			expect(el('datagrid-row-1').exists).toBe(true)
		})
	})

	describe('column headers', () => {
		test.each([
			['title', 'Title'],
			['content', 'Content'],
			['publishedAt', 'Published'],
			['author', 'Author'],
			['tags', 'Tags'],
		])('%s column header shows label "%s"', (key, label) => {
			expect(el(`datagrid-header-${key}`).exists).toBe(true)
			expect(el(`datagrid-header-${key}`).text).toContain(label)
		})
	})

	describe('cell content', () => {
		test.each(['title', 'author', 'tags'])('%s cell shows content', (key) => {
			expect(el(`datagrid-cell-${key}`).text).toBeTruthy()
		})
	})

	describe('toolbar', () => {
		test('toolbar buttons exist', () => {
			expect(el(`${tid('datagrid-example')} button`).exists).toBe(true)
			expect(el(`${tid('datagrid-example')} button[data-state]`).exists).toBe(true)
		})
	})

	describe('pagination', () => {
		test('pagination UI renders', () => {
			expect(el('datagrid-example').text).toBeTruthy()
			expect(el(`${tid('datagrid-example')} .sr-only`).exists).toBe(true)
		})
	})

	describe('column header interactions', () => {
		test('clicking column header opens popover with sort controls', () => {
			el(`${tid('datagrid-header-title')} button`).click()
			wait(200)

			expect(el('[data-radix-popper-content-wrapper]').exists).toBe(true)

			el('datagrid-body').click()
		})
	})

	describe('has-one and has-many cells', () => {
		test('author cell shows content', () => {
			expect(el('datagrid-cell-author').text).toBeTruthy()
		})

		test('tags cell shows content', () => {
			expect(el('datagrid-cell-tags').text).toBeTruthy()
		})
	})

	describe('row highlighting', () => {
		test('clicking a row highlights it', () => {
			el('datagrid-row-0').click()

			expect(el('datagrid-row-0').attr('data-highlighted')).toBe('')
		})

		test('clicking another row moves highlight', () => {
			el('datagrid-row-1').click()

			expect(el('datagrid-row-1').attr('data-highlighted')).toBe('')
			expect(el(`${tid('datagrid-row-0')}[data-highlighted]`).exists).toBe(false)
		})
	})
})
