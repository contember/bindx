import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { discoverComponents } from './registry.js'
import { loadMetadata } from './metadata.js'
import { getOriginalSource } from './git.js'

export function diff(componentPath: string, targetDir: string, mode?: 'upstream' | 'local'): void {
	if (mode === 'upstream') {
		diffUpstream(componentPath, targetDir)
		return
	}

	if (mode === 'local') {
		diffLocal(componentPath, targetDir)
		return
	}

	diffDefault(componentPath, targetDir)
}

function diffDefault(componentPath: string, targetDir: string): void {
	const component = findComponent(componentPath)
	const localPath = resolve(targetDir, componentPath + '.tsx')

	if (!existsSync(localPath)) {
		console.error(`No local override found: ${localPath}`)
		process.exit(1)
	}

	printDiff(component.sourcePath, localPath)
}

function diffUpstream(componentPath: string, targetDir: string): void {
	const metadata = loadMetadata(targetDir)
	const entry = metadata.ejected[componentPath]

	if (!entry) {
		console.error(`Component ${componentPath} is not ejected.`)
		process.exit(1)
	}

	if (!entry.gitRef || !entry.gitPath) {
		console.error(`Git ref not available for ${componentPath}. Re-eject to enable this feature.`)
		process.exit(1)
	}

	const baseSource = getOriginalSource(entry.gitRef, entry.gitPath)
	const component = findComponent(componentPath)
	const upstreamSource = readFileSync(component.sourcePath, 'utf-8')

	printDiffFromStrings(baseSource, upstreamSource, 'base', 'upstream')
}

function diffLocal(componentPath: string, targetDir: string): void {
	const metadata = loadMetadata(targetDir)
	const entry = metadata.ejected[componentPath]

	if (!entry) {
		console.error(`Component ${componentPath} is not ejected.`)
		process.exit(1)
	}

	if (!entry.gitRef || !entry.gitPath) {
		console.error(`Git ref not available for ${componentPath}. Re-eject to enable this feature.`)
		process.exit(1)
	}

	const baseSource = getOriginalSource(entry.gitRef, entry.gitPath)
	const localPath = resolve(targetDir, componentPath + '.tsx')

	if (!existsSync(localPath)) {
		console.error(`No local override found: ${localPath}`)
		process.exit(1)
	}

	const localRaw = readFileSync(localPath, 'utf-8')
	const localSource = stripHeader(localRaw)

	printDiffFromStrings(baseSource, localSource, 'base', 'local')
}

function findComponent(componentPath: string): { path: string; sourcePath: string } {
	const components = discoverComponents()
	const component = components.find(c => c.path === componentPath)

	if (!component) {
		console.error(`Component not found in package: ${componentPath}`)
		process.exit(1)
	}

	return component
}

function printDiff(fileA: string, fileB: string): void {
	try {
		const output = execSync(`diff -u "${fileA}" "${fileB}"`, { encoding: 'utf-8' })
		if (output.length === 0) {
			console.log('No differences.')
		} else {
			console.log(output)
		}
	} catch (error: unknown) {
		if (isExecError(error)) {
			console.log(error.stdout)
		} else {
			throw error
		}
	}
}

function printDiffFromStrings(contentA: string, contentB: string, labelA: string, labelB: string): void {
	const tempDir = mkdtempSync(join(tmpdir(), 'bindx-diff-'))
	const fileA = join(tempDir, labelA)
	const fileB = join(tempDir, labelB)

	try {
		writeFileSync(fileA, contentA, 'utf-8')
		writeFileSync(fileB, contentB, 'utf-8')

		printDiff(fileA, fileB)
	} finally {
		rmSync(tempDir, { recursive: true, force: true })
	}
}

function isExecError(error: unknown): error is { stdout: string } {
	return (
		typeof error === 'object'
		&& error !== null
		&& 'stdout' in error
		&& typeof (error as { stdout: unknown }).stdout === 'string'
	)
}

function stripHeader(content: string): string {
	const firstNewline = content.indexOf('\n')
	if (firstNewline === -1) {
		return content
	}
	const firstLine = content.slice(0, firstNewline)
	if (firstLine.startsWith('// Ejected from')) {
		return content.slice(firstNewline + 1)
	}
	return content
}
