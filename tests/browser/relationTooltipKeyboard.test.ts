import { expect, test } from 'bun:test'
import { browserTest, el, evalJs, press, tid, waitFor } from './browser.js'

const cell = `${tid('datagrid-example')} ${tid('datagrid-row-0')} ${tid('datagrid-cell-author')}`
const label = `${cell} [aria-keyshortcuts="ArrowDown"]`
const panel = '[data-bindx-tooltip-panel]'

function activeMatches(selector: string): boolean {
	return evalJs(`document.activeElement?.matches(${JSON.stringify(selector)})`) === 'true'
}

function focusLabel(): void {
	evalJs(`document.querySelector(${JSON.stringify(label)}).focus()`)
	waitFor(() => el(panel).exists)
	expect(activeMatches(label)).toBe(true)
}

browserTest('relation tooltip keyboard navigation', () => {
	test('keeps cell links in native tab order and follows them with Enter', () => {
		waitFor(() => el(label).exists)
		focusLabel()
		press('Tab')
		expect(activeMatches(`${cell} a`)).toBe(true)
		press('Shift+Tab')
		expect(activeMatches(label)).toBe(true)
		press('Tab')
		press('Enter')
		waitFor(() => evalJs('location.hash') === '"#entity-lists"')
		evalJs('location.hash = "datagrid"')
		waitFor(() => el(label).exists)
	})

	test('ArrowDown enters actions; Escape restores focus without reopening', () => {
		focusLabel()
		press('ArrowDown')
		expect(activeMatches(`${panel} button:first-child`)).toBe(true)
		press('Escape')
		waitFor(() => !el(panel).exists)
		expect(activeMatches(label)).toBe(true)
		press('ArrowDown')
		waitFor(() => activeMatches(`${panel} button:first-child`))
		press('Escape')
		waitFor(() => !el(panel).exists)
		press('Tab')
		expect(activeMatches(`${cell} a`)).toBe(true)
	})

	test('Tab traverses both actions then continues at the cell link', () => {
		focusLabel()
		press('ArrowDown')
		press('Tab')
		expect(activeMatches(`${panel} button:last-child`)).toBe(true)
		press('Tab')
		expect(activeMatches(`${cell} a`)).toBe(true)
		press('Tab')
		expect(activeMatches(`${panel} *`)).toBe(false)
		expect(activeMatches(`${cell} *`)).toBe(false)
		expect(activeMatches('body')).toBe(false)
	})

	test('Shift+Tab at the first action leaves the panel backwards', () => {
		focusLabel()
		press('ArrowDown')
		press('Shift+Tab')
		expect(activeMatches(`${panel} *`)).toBe(false)
		expect(activeMatches('body')).toBe(false)
		press('Tab')
		expect(activeMatches(label)).toBe(true)
	})

	test('Escape restores the cell after entering a hover-opened panel', () => {
		press('Escape')
		waitFor(() => !el(panel).exists)
		evalJs('document.activeElement.blur()')
		el(label).hover()
		waitFor(() => el(panel).exists)
		evalJs(`document.querySelector('${panel} button').focus()`)
		press('Escape')
		waitFor(() => !el(panel).exists)
		expect(activeMatches(label)).toBe(true)
	})
}, 'datagrid')
