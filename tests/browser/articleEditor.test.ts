import { test, expect } from 'bun:test'
import { browserTest, el, waitFor } from './browser.js'

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
		expect(el('article-add-tag-select').exists).toBe(true)
	})

	test('save and reset are initially disabled', () => {
		expect(el('article-save-button').isDisabled).toBe(true)
		expect(el('article-reset-button').isDisabled).toBe(true)
	})

	test('changing author enables save/reset and shows dirty notice', () => {
		el('article-author-select').select('Jane Smith')

		waitFor(() => !el('article-save-button').isDisabled)
		expect(el('article-reset-button').isDisabled).toBe(false)
		expect(el('article-dirty-notice').exists).toBe(true)
	})

	test('removing a tag updates the tag list', () => {
		el('remove-tag-React').click()

		waitFor(() => !el('tag-badge-React').exists)
		expect(el('tag-badge-JavaScript').exists).toBe(true)
		expect(el('tags-dirty-notice').exists).toBe(true)
	})

	test('adding a tag shows it in the list', () => {
		el('article-add-tag-select').select('TypeScript')

		waitFor(() => el('tag-badge-TypeScript').exists)
	})

	test('reset reverts all changes', () => {
		el('article-reset-button').click()

		waitFor(() => el('article-save-button').isDisabled)
		expect(el('article-reset-button').isDisabled).toBe(true)
		expect(el('article-dirty-notice').exists).toBe(false)
		expect(el('tag-badge-React').exists).toBe(true)
		expect(el('tag-badge-TypeScript').exists).toBe(false)
	})
})
