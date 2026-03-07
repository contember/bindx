import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { open, close, query } from './browser.js'

const URL = process.env.PLAYGROUND_URL ?? 'http://localhost:5180'

describe('Editors', () => {
	beforeAll(() => {
		open(URL)
	})

	afterAll(() => {
		close()
	})

	describe('Rich Text Editor', () => {
		test('section renders', () => {
			expect(query.exists('rich-text-editor')).toBe(true)
		})

		test('toolbar buttons exist', () => {
			expect(query.exists('rte-bold-button')).toBe(true)
			expect(query.exists('rte-italic-button')).toBe(true)
			expect(query.exists('rte-underline-button')).toBe(true)
		})

		test('content area exists', () => {
			expect(query.exists('rte-content')).toBe(true)
		})
	})

	describe('Block Editor (with references)', () => {
		test('section renders', () => {
			expect(query.exists('block-editor')).toBe(true)
		})

		test('toolbar buttons exist', () => {
			expect(query.exists('block-bold-button')).toBe(true)
			expect(query.exists('block-italic-button')).toBe(true)
			expect(query.exists('insert-image-button')).toBe(true)
		})

		test('content area exists', () => {
			expect(query.exists('block-editor-content')).toBe(true)
		})
	})

	describe('Block Editor (simple)', () => {
		test('section renders', () => {
			expect(query.exists('simple-block-editor')).toBe(true)
		})
	})
})
