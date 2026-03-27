import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { threeWayMerge } from '../../../packages/bindx-ui/src/cli/merge.js'
import { generateAgentPrompt } from '../../../packages/bindx-ui/src/cli/agent-prompt.js'
import { loadMetadata, saveMetadata, type EjectedEntry } from '../../../packages/bindx-ui/src/cli/metadata.js'
import { getGitRef, getGitPath } from '../../../packages/bindx-ui/src/cli/git.js'

describe('Three-Way Merge', () => {
	test('clean merge — upstream adds line, local adds different line', () => {
		const base = 'line 1\nline 2\nline 3\n'
		const local = 'line 1\nlocal addition\nline 2\nline 3\n'
		const upstream = 'line 1\nline 2\nline 3\nupstream addition\n'

		const result = threeWayMerge(local, base, upstream)
		expect(result.status).toBe('clean')
		expect(result.content).toContain('local addition')
		expect(result.content).toContain('upstream addition')
		expect(result.conflictCount).toBe(0)
	})

	test('conflict — both modify same line', () => {
		const base = 'line 1\noriginal line\nline 3\n'
		const local = 'line 1\nlocal change\nline 3\n'
		const upstream = 'line 1\nupstream change\nline 3\n'

		const result = threeWayMerge(local, base, upstream)
		expect(result.status).toBe('conflict')
		expect(result.conflictCount).toBeGreaterThan(0)
		expect(result.content).toContain('<<<<<<<')
	})

	test('no changes — all identical', () => {
		const content = 'same content\n'
		const result = threeWayMerge(content, content, content)
		expect(result.status).toBe('clean')
		expect(result.content).toBe(content)
	})

	test('only upstream changed', () => {
		const base = 'original\n'
		const local = 'original\n'
		const upstream = 'updated\n'

		const result = threeWayMerge(local, base, upstream)
		expect(result.status).toBe('clean')
		expect(result.content).toBe('updated\n')
	})

	test('only local changed', () => {
		const base = 'original\n'
		const local = 'modified locally\n'
		const upstream = 'original\n'

		const result = threeWayMerge(local, base, upstream)
		expect(result.status).toBe('clean')
		expect(result.content).toBe('modified locally\n')
	})
})

describe('Agent Prompt', () => {
	test('generates prompt with all fields', () => {
		const prompt = generateAgentPrompt({
			componentPath: 'form/text-input',
			ejectVersion: '0.1.0',
			currentVersion: '0.2.0',
			localDiff: '-original\n+modified',
			upstreamDiff: '-original\n+updated',
			localContent: 'const TextInput = () => <input />',
			upstreamContent: 'const TextInput = () => <input type="text" />',
			localFilePath: '/project/src/ui/form/text-input.tsx',
		})

		expect(prompt).toContain('form/text-input')
		expect(prompt).toContain('@contember/bindx-ui@0.1.0')
		expect(prompt).toContain('@0.2.0')
		expect(prompt).toContain('-original\n+modified')
		expect(prompt).toContain('-original\n+updated')
		expect(prompt).toContain('const TextInput')
		expect(prompt).toContain('bindx-ui backport --sync form/text-input')
	})
})

describe('Git Helpers', () => {
	test('getGitRef returns a valid commit hash', () => {
		const ref = getGitRef()
		expect(ref).toMatch(/^[0-9a-f]{40}$/)
	})

	test('getGitPath resolves package file to git-relative path', () => {
		const absolutePath = join(process.cwd(), 'packages/bindx-ui/src/cli/git.ts')
		const gitPath = getGitPath(absolutePath)
		expect(gitPath).toBe('packages/bindx-ui/src/cli/git.ts')
	})
})

describe('Metadata with git fields', () => {
	let targetDir: string

	beforeEach(() => {
		targetDir = mkdtempSync(join(tmpdir(), 'bindx-meta-test-'))
	})

	afterEach(() => {
		rmSync(targetDir, { recursive: true, force: true })
	})

	test('saves and loads gitRef and gitPath', () => {
		const entry: EjectedEntry = {
			path: 'ui/button',
			version: '0.1.0',
			originalHash: 'abc123',
			gitRef: 'deadbeef1234567890abcdef1234567890abcdef',
			gitPath: 'packages/bindx-ui/src/ui/button.tsx',
		}

		saveMetadata(targetDir, { ejected: { 'ui/button': entry } })
		const loaded = loadMetadata(targetDir)

		expect(loaded.ejected['ui/button']?.gitRef).toBe(entry.gitRef)
		expect(loaded.ejected['ui/button']?.gitPath).toBe(entry.gitPath)
	})

	test('handles legacy metadata without git fields', () => {
		const legacyJson = JSON.stringify({
			ejected: {
				'ui/button': {
					path: 'ui/button',
					version: '0.1.0',
					originalHash: 'abc123',
				},
			},
		})
		writeFileSync(join(targetDir, '.bindx-ui.json'), legacyJson, 'utf-8')

		const loaded = loadMetadata(targetDir)
		expect(loaded.ejected['ui/button']?.gitRef).toBeUndefined()
		expect(loaded.ejected['ui/button']?.gitPath).toBeUndefined()
		expect(loaded.ejected['ui/button']?.path).toBe('ui/button')
	})
})
