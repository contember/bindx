import { test, expect, describe } from 'bun:test'
import { browserTest, el, tid, waitFor } from './browser.js'

const scope = tid('hasmany-datagrid-example')

browserTest('HasMany DataGrid', () => {
	describe('parent entity', () => {
		test('shows author name', () => {
			expect(el('hasmany-datagrid-author').text).toContain('John Doe')
		})
	})

	describe('table structure', () => {
		test('table renders with data', () => {
			expect(el(`${scope} ${tid('datagrid-table')}`).exists).toBe(true)
			expect(el(`${scope} ${tid('datagrid-header')}`).exists).toBe(true)
			expect(el(`${scope} ${tid('datagrid-body')}`).exists).toBe(true)
			expect(el(`${scope} ${tid('datagrid-row-0')}`).exists).toBe(true)
		})
	})

	describe('column headers', () => {
		test.each([
			['title', 'Title'],
			['content', 'Content'],
			['publishedAt', 'Published'],
		])('%s column header shows label "%s"', (key, label) => {
			expect(el(`${scope} ${tid(`datagrid-header-${key}`)}`).text).toContain(label)
		})
	})

	describe('cell content', () => {
		test('title cell shows article title', () => {
			expect(el(`${scope} ${tid('datagrid-row-0')} ${tid('datagrid-cell-title')}`).text).toContain('Introduction to React')
		})

		test('content cell shows article content', () => {
			expect(el(`${scope} ${tid('datagrid-row-0')} ${tid('datagrid-cell-content')}`).text).toBeTruthy()
		})
	})

	describe('pagination', () => {
		test('shows row count', () => {
			expect(el(`${scope}`).text).toContain('1 rows')
		})
	})

	describe('toolbar', () => {
		test('title text filter exists', () => {
			expect(el(`${scope} input[placeholder]`).exists).toBe(true)
		})
	})

	describe('column header interactions', () => {
		test('clicking column header opens popover', () => {
			el(`${scope} ${tid('datagrid-header-title')} button`).click()
			waitFor(() => el('[data-radix-popper-content-wrapper]').exists)
			el(`${scope} ${tid('datagrid-body')}`).click()
		})
	})
})
