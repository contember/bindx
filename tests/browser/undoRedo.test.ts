import { test, expect } from 'bun:test'
import { browserTest, el } from './browser.js'

browserTest('Undo/Redo Demo', () => {
	test('section renders', () => {
		expect(el('undo-demo').exists).toBe(true)
	})

	test('undo and redo buttons are initially disabled', () => {
		expect(el('undo-button').isDisabled).toBe(true)
		expect(el('redo-button').isDisabled).toBe(true)
	})

	test('undo count starts at 0', () => {
		expect(el('undo-button').text).toContain('Undo (0)')
	})

	test('editing title enables undo', () => {
		el('undo-title-input').fill('Test Title Change')

		expect(el('undo-button').isDisabled).toBe(false)
		expect(el('undo-button').text).toContain('Undo (1)')
	})

	test('undo reverts the change', () => {
		el('undo-button').click()

		expect(el('undo-button').isDisabled).toBe(true)
		expect(el('redo-button').isDisabled).toBe(false)
		expect(el('redo-button').text).toContain('Redo (1)')
	})

	test('redo re-applies the change', () => {
		el('redo-button').click()

		expect(el('undo-button').isDisabled).toBe(false)
		expect(el('redo-button').isDisabled).toBe(true)
	})

	test('bulk update creates a single undo entry', () => {
		el('undo-button').click()

		el('bulk-update-button').click()

		expect(el('undo-button').text).toContain('Undo (1)')
		expect(el('undo-title-input').value).toContain('Bulk Updated Title')

		el('undo-button').click()
	})
})
