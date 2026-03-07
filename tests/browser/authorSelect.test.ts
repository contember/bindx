import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { open, close, wait, query, action } from './browser.js'

const URL = process.env.PLAYGROUND_URL ?? 'http://localhost:5180'

describe('Article with Author Select', () => {
	beforeAll(() => {
		open(URL)
	})

	afterAll(() => {
		close()
	})

	test('section renders', () => {
		expect(query.exists('article-with-author-select')).toBe(true)
		expect(query.exists('author-select-dropdown')).toBe(true)
		expect(query.exists('current-author-display')).toBe(true)
	})

	test('shows current author', () => {
		expect(query.text('current-author-display')).toContain('Current author:')
	})

	test('save is initially disabled', () => {
		expect(query.isDisabled('author-select-save-button')).toBe(true)
	})

	test('changing author enables save and updates display', () => {
		action.select('author-select-dropdown', 'Bob Wilson')
		wait(300)

		expect(query.isDisabled('author-select-save-button')).toBe(false)
		expect(query.text('current-author-display')).toContain('Bob Wilson')
		expect(query.text('current-author-display')).toContain('Changes will be applied on save')
	})

	test('reset reverts author change', () => {
		action.click('author-select-reset-button')
		wait(300)

		expect(query.isDisabled('author-select-save-button')).toBe(true)
	})
})
