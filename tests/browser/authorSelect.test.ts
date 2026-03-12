import { test, expect } from 'bun:test'
import { browserTest, el } from './browser.js'

browserTest('Article with Author Select', () => {
	test('section renders', () => {
		expect(el('article-with-author-select').exists).toBe(true)
		expect(el('author-select-dropdown').exists).toBe(true)
		expect(el('current-author-display').exists).toBe(true)
	})

	test('shows current author', () => {
		expect(el('current-author-display').text).toContain('Current author:')
	})

	test('save is initially disabled', () => {
		expect(el('author-select-save-button').isDisabled).toBe(true)
	})

	test('changing author enables save and updates display', () => {
		el('author-select-dropdown').select('Bob Wilson')

		expect(el('author-select-save-button').isDisabled).toBe(false)
		expect(el('current-author-display').text).toContain('Bob Wilson')
		expect(el('current-author-display').text).toContain('Changes will be applied on save')
	})

	test('reset reverts author change', () => {
		el('author-select-reset-button').click()

		expect(el('author-select-save-button').isDisabled).toBe(true)
	})
})
