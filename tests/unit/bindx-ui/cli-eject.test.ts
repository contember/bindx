import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { eject } from '../../../packages/bindx-ui/src/cli/eject.js'
import { restore } from '../../../packages/bindx-ui/src/cli/restore.js'
import { loadMetadata } from '../../../packages/bindx-ui/src/cli/metadata.js'

describe('CLI Eject/Restore', () => {
	let targetDir: string

	beforeEach(() => {
		targetDir = mkdtempSync(join(tmpdir(), 'bindx-ui-test-'))
	})

	afterEach(() => {
		rmSync(targetDir, { recursive: true, force: true })
	})

	test('ejects a component to target directory', () => {
		eject('ui/button', targetDir)

		const ejectedPath = join(targetDir, 'ui/button.tsx')
		expect(existsSync(ejectedPath)).toBe(true)

		const content = readFileSync(ejectedPath, 'utf-8')
		expect(content).toContain('// Ejected from @contember/bindx-ui@')
		expect(content).toContain('ui/button')
	})

	test('creates metadata after eject', () => {
		eject('ui/button', targetDir)

		const metadata = loadMetadata(targetDir)
		expect(metadata.ejected['ui/button']).toBeDefined()
		expect(metadata.ejected['ui/button']?.path).toBe('ui/button')
		expect(metadata.ejected['ui/button']?.version).toBeDefined()
		expect(metadata.ejected['ui/button']?.originalHash).toBeDefined()
	})

	test('skips already ejected component', () => {
		eject('ui/button', targetDir)
		const firstContent = readFileSync(join(targetDir, 'ui/button.tsx'), 'utf-8')

		// Second eject should skip
		eject('ui/button', targetDir)
		const secondContent = readFileSync(join(targetDir, 'ui/button.tsx'), 'utf-8')
		expect(secondContent).toBe(firstContent)
	})

	test('ejects folder glob', () => {
		eject('ui/*', targetDir)

		// Should have ejected multiple ui components
		const metadata = loadMetadata(targetDir)
		const uiComponents = Object.keys(metadata.ejected).filter(k => k.startsWith('ui/'))
		expect(uiComponents.length).toBeGreaterThan(1)
	})

	test('restore removes ejected component', () => {
		eject('ui/button', targetDir)
		expect(existsSync(join(targetDir, 'ui/button.tsx'))).toBe(true)

		restore('ui/button', targetDir)
		expect(existsSync(join(targetDir, 'ui/button.tsx'))).toBe(false)

		const metadata = loadMetadata(targetDir)
		expect(metadata.ejected['ui/button']).toBeUndefined()
	})
})
