import { test, expect } from 'bun:test'
import { browserTest, clickUntil, el, tid, waitFor } from './browser.js'

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
		// Select from the stable initial list; filtering remounts options asynchronously.
		const janeOption = () => el('xpath=//*[@role="dialog"]//button[contains(normalize-space(.), "Jane")]')
		waitFor(() => janeOption().exists)
		clickUntil(
			() => {
				const option = janeOption()
				expect(option.text).toContain('Jane')
				return option
			},
			() => !el('author-select-save-button').isDisabled,
		)
		expect(el('current-author-display').text).toContain('Changes will be applied on save')
	})

}, 'author-select')
