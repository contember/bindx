import { test, expect } from 'bun:test'
import { browserTest, el, tid, waitFor } from './browser.js'

browserTest('Article with Author Select', () => {
	test('section renders', () => {
		waitFor(() => el('article-with-author-select').exists)
		expect(el('current-author-display').exists).toBe(true)
	})

	test('shows current author', () => {
		expect(el('current-author-display').text).toContain('Current author:')
	})

	test('save is initially disabled', () => {
		expect(el('author-select-save-button').isDisabled).toBe(true)
	})

	test('changing author enables save and updates display', () => {
		// Open the author SelectField popover
		el(`${tid('article-with-author-select')} [aria-haspopup="dialog"]`).click()
		// Type to filter and click an option
		waitFor(() => el('[role="dialog"] input').exists)
		el('[role="dialog"] input').fill('Bob')
		waitFor(() => el('[role="dialog"] button[class]').exists)
		el('[role="dialog"] button[class]').click()

		waitFor(() => !el('author-select-save-button').isDisabled)
		expect(el('current-author-display').text).toContain('Changes will be applied on save')
	})

}, 'author-select')
