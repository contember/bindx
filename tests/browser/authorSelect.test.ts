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
		// Type to filter and click an option
		waitFor(() => el('[role="dialog"] input').exists)
		el('[role="dialog"] input').fill('Bob')
		const bobOption = () => el('xpath=//*[@role="dialog"]//button[contains(normalize-space(.), "Bob")]')
		waitFor(() => bobOption().exists)
		clickUntil(
			() => {
				const option = bobOption()
				expect(option.text).toContain('Bob')
				return option
			},
			() => !el('author-select-save-button').isDisabled,
		)
		expect(el('current-author-display').text).toContain('Changes will be applied on save')
	})

}, 'author-select')
