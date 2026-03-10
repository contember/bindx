import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { open, close, wait, query, action } from './browser.js'

const URL = process.env['PLAYGROUND_URL'] ?? 'http://localhost:5180'

describe('Article Editor', () => {
	beforeAll(() => {
		open(URL)
	})

	afterAll(() => {
		close()
	})

	test('section renders with all sub-components', () => {
		expect(query.exists('article-editor')).toBe(true)
		expect(query.exists('article-title-input')).toBe(true)
		expect(query.exists('article-content-input')).toBe(true)
		expect(query.exists('article-author-select')).toBe(true)
		expect(query.exists('author-editor')).toBe(true)
		expect(query.exists('author-name-input')).toBe(true)
		expect(query.exists('author-email-input')).toBe(true)
		expect(query.exists('article-location')).toBe(true)
		expect(query.exists('article-tags')).toBe(true)
		expect(query.exists('article-add-tag-select')).toBe(true)
	})

	test('save and reset are initially disabled', () => {
		expect(query.isDisabled('article-save-button')).toBe(true)
		expect(query.isDisabled('article-reset-button')).toBe(true)
	})

	test('changing author enables save/reset and shows dirty notice', () => {
		action.select('article-author-select', 'Jane Smith')
		wait(300)

		expect(query.isDisabled('article-save-button')).toBe(false)
		expect(query.isDisabled('article-reset-button')).toBe(false)
		expect(query.exists('article-dirty-notice')).toBe(true)
	})

	test('removing a tag updates the tag list', () => {
		action.click('remove-tag-React')

		expect(query.exists('tag-badge-React')).toBe(false)
		expect(query.exists('tag-badge-JavaScript')).toBe(true)
		expect(query.exists('tags-dirty-notice')).toBe(true)
	})

	test('adding a tag shows it in the list', () => {
		action.select('article-add-tag-select', 'TypeScript')

		expect(query.exists('tag-badge-TypeScript')).toBe(true)
	})

	test('reset reverts all changes', () => {
		action.click('article-reset-button')
		wait(300)

		expect(query.isDisabled('article-save-button')).toBe(true)
		expect(query.isDisabled('article-reset-button')).toBe(true)
		expect(query.exists('article-dirty-notice')).toBe(false)
		expect(query.exists('tag-badge-React')).toBe(true)
		expect(query.exists('tag-badge-TypeScript')).toBe(false)
	})
})
