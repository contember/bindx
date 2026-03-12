import { test, expect } from 'bun:test'
import { browserTest, el } from './browser.js'

browserTest('Article Editor', () => {
	test('section renders with all sub-components', () => {
		expect(el('article-editor').exists).toBe(true)
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

		expect(el('article-save-button').isDisabled).toBe(false)
		expect(el('article-reset-button').isDisabled).toBe(false)
		expect(el('article-dirty-notice').exists).toBe(true)
	})

	test('removing a tag updates the tag list', () => {
		el('remove-tag-React').click()

		expect(el('tag-badge-React').exists).toBe(false)
		expect(el('tag-badge-JavaScript').exists).toBe(true)
		expect(el('tags-dirty-notice').exists).toBe(true)
	})

	test('adding a tag shows it in the list', () => {
		el('article-add-tag-select').select('TypeScript')

		expect(el('tag-badge-TypeScript').exists).toBe(true)
	})

	test('reset reverts all changes', () => {
		el('article-reset-button').click()

		expect(el('article-save-button').isDisabled).toBe(true)
		expect(el('article-reset-button').isDisabled).toBe(true)
		expect(el('article-dirty-notice').exists).toBe(false)
		expect(el('tag-badge-React').exists).toBe(true)
		expect(el('tag-badge-TypeScript').exists).toBe(false)
	})
})
