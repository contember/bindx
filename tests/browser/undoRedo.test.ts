import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { open, close, wait, query, action } from './browser.js'

const URL = process.env.PLAYGROUND_URL ?? 'http://localhost:5180'

describe('Undo/Redo Demo', () => {
	beforeAll(() => {
		open(URL)
	})

	afterAll(() => {
		close()
	})

	test('section renders', () => {
		expect(query.exists('undo-demo')).toBe(true)
	})

	test('undo and redo buttons are initially disabled', () => {
		expect(query.isDisabled('undo-button')).toBe(true)
		expect(query.isDisabled('redo-button')).toBe(true)
	})

	test('undo count starts at 0', () => {
		expect(query.text('undo-button')).toContain('Undo (0)')
	})

	test('editing title enables undo', () => {
		action.fill('undo-title-input', 'Test Title Change')
		wait(300)

		expect(query.isDisabled('undo-button')).toBe(false)
		expect(query.text('undo-button')).toContain('Undo (1)')
	})

	test('undo reverts the change', () => {
		action.click('undo-button')

		expect(query.isDisabled('undo-button')).toBe(true)
		expect(query.isDisabled('redo-button')).toBe(false)
		expect(query.text('redo-button')).toContain('Redo (1)')
	})

	test('redo re-applies the change', () => {
		action.click('redo-button')

		expect(query.isDisabled('undo-button')).toBe(false)
		expect(query.isDisabled('redo-button')).toBe(true)
	})

	test('bulk update creates a single undo entry', () => {
		// undo back to clean state
		action.click('undo-button')

		action.click('bulk-update-button')
		wait(300)

		expect(query.text('undo-button')).toContain('Undo (1)')
		expect(query.value('undo-title-input')).toContain('Bulk Updated Title')

		// clean up
		action.click('undo-button')
	})
})
