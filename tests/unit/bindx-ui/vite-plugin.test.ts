import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { bindxUI } from '../../../packages/bindx-ui/src/vite-plugin.js'
import type { Plugin, ResolvedConfig } from 'vite'

describe('Vite Plugin', () => {
	let targetDir: string
	let plugin: Plugin

	beforeEach(() => {
		targetDir = mkdtempSync(join(tmpdir(), 'bindx-ui-vite-test-'))
		plugin = bindxUI({ dir: targetDir })

		// Simulate Vite's configResolved hook
		const configResolved = plugin.configResolved as (config: ResolvedConfig) => void
		configResolved({ root: '/' } as ResolvedConfig)
	})

	afterEach(() => {
		rmSync(targetDir, { recursive: true, force: true })
	})

	test('ignores non-#bindx-ui imports', () => {
		const resolveId = plugin.resolveId as (source: string) => string | null
		expect(resolveId('react')).toBeNull()
		expect(resolveId('@contember/bindx')).toBeNull()
		expect(resolveId('./relative/path')).toBeNull()
	})

	test('resolves to local file when override exists', () => {
		// Create a local override
		mkdirSync(join(targetDir, 'ui'), { recursive: true })
		writeFileSync(join(targetDir, 'ui/button.tsx'), 'export const Button = () => null')

		const resolveId = plugin.resolveId as (source: string) => string | null
		const result = resolveId('#bindx-ui/ui/button')

		expect(result).toBe(join(targetDir, 'ui/button.tsx'))
	})

	test('resolves to package fallback when no local override', () => {
		const resolveId = plugin.resolveId as (source: string) => string | null
		const result = resolveId('#bindx-ui/ui/button')

		// Plugin resolves directly to package source file
		expect(result).toMatch(/packages\/bindx-ui\/src\/ui\/button\.tsx$/)
	})

	test('checks multiple extensions', () => {
		mkdirSync(join(targetDir, 'form'), { recursive: true })
		writeFileSync(join(targetDir, 'form/container.ts'), 'export {}')

		const resolveId = plugin.resolveId as (source: string) => string | null
		const result = resolveId('#bindx-ui/form/container')

		expect(result).toBe(join(targetDir, 'form/container.ts'))
	})

	test('handles nested paths like datagrid/filters/text', () => {
		mkdirSync(join(targetDir, 'datagrid/filters'), { recursive: true })
		writeFileSync(join(targetDir, 'datagrid/filters/text.tsx'), 'export {}')

		const resolveId = plugin.resolveId as (source: string) => string | null
		const result = resolveId('#bindx-ui/datagrid/filters/text')

		expect(result).toBe(join(targetDir, 'datagrid/filters/text.tsx'))
	})

	test('plugin has enforce: pre', () => {
		expect(plugin.enforce).toBe('pre')
	})

	test('plugin name is bindx-ui-override', () => {
		expect(plugin.name).toBe('bindx-ui-override')
	})
})
