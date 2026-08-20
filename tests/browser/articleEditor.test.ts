import { test, expect } from 'bun:test'
import { browserTest, clickUntil, el, tid, waitFor } from './browser.js'

browserTest('Article Editor', () => {
	test('section renders with all sub-components', () => {
		waitFor(() => el('article-editor').exists)
		expect(el('article-title-input').exists).toBe(true)
		expect(el('article-content-input').exists).toBe(true)
		expect(el('article-author-select').exists).toBe(true)
		expect(el('author-editor').exists).toBe(true)
		expect(el('author-name-input').exists).toBe(true)
		expect(el('author-email-input').exists).toBe(true)
		expect(el('article-location').exists).toBe(true)
		expect(el('article-tags').exists).toBe(true)
	})

	test('save is initially disabled', () => {
		expect(el('article-save-button').isDisabled).toBe(true)
	})

	test('changing author enables save and shows dirty notice', () => {
		// Open the author SelectField popover
		el(`${tid('article-author-select')} [aria-haspopup="dialog"]`).click()
		// Select from the stable initial list; filtering remounts options asynchronously.
		const janeOption = () => el('xpath=//*[@role="dialog"]//button[contains(normalize-space(.), "Jane")]')
		waitFor(() => janeOption().exists)
		clickUntil(
			() => {
				const option = janeOption()
				expect(option.text).toContain('Jane')
				return option
			},
			() => !el('article-save-button').isDisabled,
		)
		expect(el('article-dirty-notice').exists).toBe(true)
	})

	test('removing a tag updates the tag list', () => {
		// Click the remove button (X) next to the React tag chip
		el(`${tid('article-tags')} span:has(${tid('tag-badge-React')}) [role="button"]`).click()

		waitFor(() => !el('tag-badge-React').exists)
		expect(el('tag-badge-JavaScript').exists).toBe(true)
		expect(el('tags-dirty-notice').exists).toBe(true)
	})

	test('adding a tag shows it in the list', () => {
		// Open the tags MultiSelectField popover
		el(`${tid('article-tags')} [aria-haspopup="dialog"]`).click()
		// Select from the stable initial list; filtering remounts options asynchronously.
		const typeScriptOption = () => el('xpath=//*[@role="dialog"]//button[contains(normalize-space(.), "TypeScript")]')
		waitFor(() => typeScriptOption().exists)
		clickUntil(
			() => {
				const option = typeScriptOption()
				expect(option.text).toContain('TypeScript')
				return option
			},
			() => el('tag-badge-TypeScript').exists,
		)
	})

}, 'article-editor')
