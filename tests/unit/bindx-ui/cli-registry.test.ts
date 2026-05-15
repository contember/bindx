import { describe, test, expect } from 'bun:test'
import { discoverComponents } from '../../../packages/bindx-ui/src/cli/registry.js'

describe('CLI Registry', () => {
	test('discovers components from all component folders', () => {
		const components = discoverComponents()

		expect(components.length).toBeGreaterThan(0)

		// Verify components come from expected folders
		const folders = new Set(components.map(c => c.path.split('/')[0]))
		expect(folders.has('ui')).toBe(true)
		expect(folders.has('form')).toBe(true)
		expect(folders.has('datagrid')).toBe(true)
		expect(folders.has('select')).toBe(true)

		// Should NOT include cli, utils, defaults
		expect(folders.has('cli')).toBe(false)
		expect(folders.has('utils')).toBe(false)
		expect(folders.has('defaults')).toBe(false)
	})

	test('does not include index files', () => {
		const components = discoverComponents()
		const indexComponents = components.filter(c => c.path.endsWith('/index'))
		expect(indexComponents).toHaveLength(0)
	})

	test('component paths match expected format', () => {
		const components = discoverComponents()

		for (const component of components) {
			// Path should be like 'ui/button', 'form/container', 'datagrid/filters/text'
			expect(component.path).toMatch(/^[a-z]+\/[a-z]/)
			// No file extensions in path
			expect(component.path).not.toMatch(/\.(tsx?|jsx?)$/)
			// Source path should be absolute and exist
			expect(component.sourcePath).toMatch(/^\//)
		}
	})

	test('includes specific known components', () => {
		const components = discoverComponents()
		const paths = components.map(c => c.path)

		expect(paths).toContain('ui/button')
		expect(paths).toContain('form/container')
		expect(paths).toContain('form/input-field')
		expect(paths).toContain('datagrid/columns/text-column')
		expect(paths).toContain('select/select-field')
	})

	test('components are sorted alphabetically', () => {
		const components = discoverComponents()
		const paths = components.map(c => c.path)
		const sorted = [...paths].sort()
		expect(paths).toEqual(sorted)
	})
})
