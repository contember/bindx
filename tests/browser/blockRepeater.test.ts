import { test, expect, describe } from 'bun:test'
import { browserTest, el, tid, waitFor, evalJs } from './browser.js'

const headless = '[data-testid="headless-block-repeater"]'
const itemSel = `${headless} [data-testid^="block-item-"]`

function blockCount(): number {
	return parseInt(evalJs(`document.querySelectorAll('${itemSel}').length`), 10) || 0
}

function firstBlockMoveUpDisabled(): boolean {
	return evalJs(`document.querySelector('${itemSel} [data-testid="move-up"]')?.disabled`) === 'true'
}

browserTest('Block Repeater', () => {
	describe('initial state', () => {
		test('headless repeater loads', () => {
			waitFor(() => el(`${tid('headless-block-repeater')}`).exists, { timeout: 15_000 })
			expect(el(`${tid('headless-block-repeater')}`).exists).toBe(true)
		}, 20_000)

		test('add block buttons are visible', () => {
			expect(el('add-block-text').exists).toBe(true)
			expect(el('add-block-image').exists).toBe(true)
		})
	})

	describe('adding blocks', () => {
		test('add text block increases count', () => {
			waitFor(() => el('add-block-text').exists)
			const initial = blockCount()
			el('add-block-text').click()
			waitFor(() => blockCount() > initial)
			expect(blockCount()).toBe(initial + 1)
		})

		test('add image block increases count', () => {
			const initial = blockCount()
			el('add-block-image').click()
			waitFor(() => blockCount() > initial)
			expect(blockCount()).toBe(initial + 1)
		})
	})

	describe('block operations', () => {
		test('first block has move-up disabled', () => {
			waitFor(() => blockCount() >= 2)
			expect(firstBlockMoveUpDisabled()).toBe(true)
		})

		test('remove a block decreases count', () => {
			const initial = blockCount()
			// Click first remove button via JS to avoid strict-mode multi-match
			evalJs(`document.querySelector('${itemSel} [data-testid="remove-block"]').click()`)
			waitFor(() => blockCount() === initial - 1)
			expect(blockCount()).toBe(initial - 1)
		})
	})

	describe('styled block repeater', () => {
		test('styled repeater renders', () => {
			expect(el(`${tid('section-block-repeater')}`).text).toContain('Inline mode')
			expect(el(`${tid('section-block-repeater')}`).text).toContain('Dual mode')
		})
	})
}, 'block-repeater')
