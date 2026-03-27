import { test, expect, describe } from 'bun:test'
import { browserTest, el, tid, waitFor, wait } from './browser.js'

const headless = tid('headless-block-repeater')

browserTest('Block Repeater', () => {
	describe('initial state', () => {
		test('headless repeater renders empty state', () => {
			waitFor(() => el(`${headless}`).exists)
			expect(el(`${headless}`).text).toContain('No blocks yet')
		})

		test('add block buttons are visible', () => {
			expect(el('add-block-text').exists).toBe(true)
			expect(el('add-block-image').exists).toBe(true)
		})
	})

	describe('adding blocks', () => {
		test('add text block', () => {
			el('add-block-text').click()
			waitFor(() => el('block-item-text').exists)
			expect(el('block-item-text').exists).toBe(true)
			expect(el('block-item-text').text).toContain('text')
			expect(el('block-item-text').text).toContain('Content')
		})

		test('add image block', () => {
			el('add-block-image').click()
			waitFor(() => el('block-item-image').exists)
			expect(el('block-item-image').exists).toBe(true)
			expect(el('block-item-image').text).toContain('image')
			expect(el('block-item-image').text).toContain('Image URL')
		})

		test('blocks have correct order indicators', () => {
			expect(el('block-item-text').text).toContain('#0')
			expect(el('block-item-image').text).toContain('#1')
		})
	})

	describe('move operations', () => {
		test('first block has move-up disabled', () => {
			expect(el(`${tid('block-item-text')} ${tid('move-up')}`).isDisabled).toBe(true)
		})

		test('last block has move-down disabled', () => {
			expect(el(`${tid('block-item-image')} ${tid('move-down')}`).isDisabled).toBe(true)
		})

		test('move image block up', () => {
			el(`${tid('block-item-image')} ${tid('move-up')}`).click()
			waitFor(() => {
				const first = el(`${headless} [data-testid^="block-item-"]:first-child`)
				return first.text.includes('#0') && first.text.includes('image')
			})
			// After move, image should be first (#0), text should be second (#1)
			const firstBlock = el(`${headless} [data-testid^="block-item-"]:first-child`)
			expect(firstBlock.text).toContain('image')
		})
	})

	describe('removing blocks', () => {
		test('remove a block', () => {
			const initialCount = el(`${headless} [data-testid^="block-item-"]`).count()
			// Remove the first block
			el(`${headless} [data-testid^="block-item-"]:first-child ${tid('remove-block')}`).click()
			waitFor(() => el(`${headless} [data-testid^="block-item-"]`).count() === initialCount - 1)
			expect(el(`${headless} [data-testid^="block-item-"]`).count()).toBe(initialCount - 1)
		})

		test('remove all blocks shows empty state', () => {
			// Remove remaining blocks
			while (el(`${headless} [data-testid^="block-item-"]`).count() > 0) {
				el(`${headless} [data-testid^="block-item-"]:first-child ${tid('remove-block')}`).click()
				wait(500)
			}
			waitFor(() => el(`${headless}`).text.includes('No blocks yet'))
			expect(el(`${headless}`).text).toContain('No blocks yet')
		})
	})

	describe('styled block repeater', () => {
		test('styled repeater renders', () => {
			expect(el(`${tid('section-block-repeater')}`).text).toContain('Inline mode')
			expect(el(`${tid('section-block-repeater')}`).text).toContain('Dual mode')
		})
	})
}, 'block-repeater')
