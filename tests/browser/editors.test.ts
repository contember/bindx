import { test, expect } from 'bun:test'
import { browserTest, el } from './browser.js'

browserTest('Editors', () => {
	test('Rich Text Editor renders with toolbar', () => {
		expect(el('rich-text-editor').exists).toBe(true)
		expect(el('rte-bold-button').exists).toBe(true)
		expect(el('rte-italic-button').exists).toBe(true)
		expect(el('rte-underline-button').exists).toBe(true)
		expect(el('rte-content').exists).toBe(true)
	})

	test('Block Editor renders with toolbar', () => {
		expect(el('block-editor').exists).toBe(true)
		expect(el('block-bold-button').exists).toBe(true)
		expect(el('block-italic-button').exists).toBe(true)
		expect(el('insert-image-button').exists).toBe(true)
		expect(el('block-editor-content').exists).toBe(true)
	})

	test('Simple Block Editor renders', () => {
		expect(el('simple-block-editor').exists).toBe(true)
	})
})
