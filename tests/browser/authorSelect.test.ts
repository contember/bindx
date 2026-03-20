import { test, expect } from 'bun:test'
import { browserTest, el, waitFor } from './browser.js'

browserTest('Article with Author Select', () => {
	test('section renders', () => {
		waitFor(() => el('article-with-author-select').exists)
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
		el('author-select-dropdown').select('Bob Wilson (bob@example.com)')

		waitFor(() => !el('author-select-save-button').isDisabled)
		expect(el('current-author-display').text).toContain('Bob Wilson')
		expect(el('current-author-display').text).toContain('Changes will be applied on save')
	})

	test('reset reverts author change', () => {
		el('author-select-reset-button').click()

		waitFor(() => el('author-select-save-button').isDisabled)
	})
})
