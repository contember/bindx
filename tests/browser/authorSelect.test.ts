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
		const trigger = () => el(`${tid('article-with-author-select')} [aria-haspopup="dialog"]`)
		// Pick from the stable initial list; filtering remounts options asynchronously.
		const janeOption = () => el('[role="dialog"] button[data-entity-id="00000000-0000-0000-0000-000000000a02"]')

		clickUntil(
			() => {
				// Re-open on every attempt. A click that lands mid-remount is lost *and*
				// dismisses the popover, so without this the remaining attempts have no
				// option to click and the whole budget burns without a single real try.
				if (!janeOption().exists) {
					trigger().click()
					waitFor(() => janeOption().exists, { capture: false })
				}
				const option = janeOption()
				expect(option.text).toContain('Jane')
				return option
			},
			() => el('current-author-display').text.includes('Jane'),
		)
		expect(el('author-select-save-button').isDisabled).toBe(false)
		expect(el('current-author-display').text).toContain('Changes will be applied on save')
	})

}, 'author-select')
