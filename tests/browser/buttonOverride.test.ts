import { test, expect } from 'bun:test'
import { browserTest, el, waitFor, evalJs } from './browser.js'

browserTest('Button Override via Vite Plugin', () => {
	test('page loads with article editor', () => {
		waitFor(() => el('article-editor').exists)
		expect(el('article-save-button').exists).toBe(true)
	})

	test('save button uses overridden Button with border-red-500', () => {
		// PersistButton (from @contember/bindx-ui) imports Button via #bindx-ui/ui/button
		// The Vite plugin resolves this to our local override with border-red-500
		const className = evalJs(`document.querySelector('[data-testid="article-save-button"]')?.className`)
		expect(className).toContain('border-red-500')
		expect(className).toContain('border-4')
	})
}, 'article-editor')
