import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { loadMetadata, saveMetadata, type BindxUIMetadata } from './metadata.js'
import { discoverComponents } from './registry.js'
import { getPackageVersion } from './paths.js'
import { getGitRef, getGitPath, getOriginalSource } from './git.js'
import { threeWayMerge } from './merge.js'
import { generateAgentPrompt } from './agent-prompt.js'

interface BackportOptions {
	agent?: boolean
	dryRun?: boolean
}

export function backport(componentPath: string, targetDir: string, options: BackportOptions): void {
	const metadata = loadMetadata(targetDir)
	const entry = metadata.ejected[componentPath]

	if (!entry) {
		console.error(`Component ${componentPath} is not ejected.`)
		process.exit(1)
	}

	if (!entry.gitRef || !entry.gitPath) {
		console.error(`Git ref not available for ${componentPath}. Re-eject the component or use --agent for AI-assisted merge.`)
		process.exit(1)
	}

	const baseSource = retrieveBaseSource(entry.gitRef, entry.gitPath)
	const component = findUpstreamComponent(componentPath)
	const upstreamSource = readFileSync(component.sourcePath, 'utf-8')

	const localPath = resolve(targetDir, componentPath + '.tsx')
	const localRaw = readFileSync(localPath, 'utf-8')
	const localSource = stripHeader(localRaw)

	const baseHash = hashContent(baseSource)
	const upstreamHash = hashContent(upstreamSource)
	const localHash = hashContent(localSource)

	const version = getPackageVersion()

	if (baseHash === upstreamHash) {
		console.log(`  ✓ ${componentPath} — already up to date`)
		return
	}

	if (baseHash === localHash) {
		if (options.dryRun) {
			console.log(`  → ${componentPath} — would auto-update (no local changes)`)
			return
		}
		const header = createHeader(version, componentPath)
		writeFileSync(localPath, header + upstreamSource, 'utf-8')
		updateMetadata(metadata, componentPath, targetDir, component.sourcePath, version, upstreamSource)
		console.log(`  ✓ ${componentPath} — auto-updated (no local changes)`)
		return
	}

	if (localHash === upstreamHash) {
		if (options.dryRun) {
			console.log(`  ✓ ${componentPath} — local matches upstream, would update metadata`)
			return
		}
		updateMetadata(metadata, componentPath, targetDir, component.sourcePath, version, upstreamSource)
		console.log(`  ✓ ${componentPath} — local matches upstream, metadata updated`)
		return
	}

	if (options.agent) {
		const diffs = computeDiffs(baseSource, localSource, upstreamSource)
		const prompt = generateAgentPrompt({
			componentPath,
			ejectVersion: entry.version,
			currentVersion: version,
			localDiff: diffs.localDiff,
			upstreamDiff: diffs.upstreamDiff,
			localContent: localRaw,
			upstreamContent: upstreamSource,
			localFilePath: localPath,
		})
		console.log(prompt)
		return
	}

	if (options.dryRun) {
		console.log(`  ⚠ ${componentPath} — both changed, merge needed`)
		return
	}

	const result = threeWayMerge(localSource, baseSource, upstreamSource)

	if (result.status === 'clean') {
		const header = createHeader(version, componentPath)
		writeFileSync(localPath, header + result.content, 'utf-8')
		updateMetadata(metadata, componentPath, targetDir, component.sourcePath, version, upstreamSource)
		console.log(`  ✓ ${componentPath} — merged cleanly`)
		return
	}

	if (result.status === 'conflict') {
		const header = createHeader(version, componentPath)
		writeFileSync(localPath, header + result.content, 'utf-8')
		console.log(`  ⚠ ${componentPath} — ${result.conflictCount} conflict(s), resolve manually or use --agent`)
		return
	}

	console.error(`  ✗ ${componentPath} — merge failed, use --agent for AI-assisted merge`)
}

export function backportAll(targetDir: string, options: BackportOptions): void {
	const metadata = loadMetadata(targetDir)
	const paths = Object.keys(metadata.ejected).sort()

	if (paths.length === 0) {
		console.log('No ejected components.')
		return
	}

	for (const componentPath of paths) {
		backport(componentPath, targetDir, options)
	}
}

export function syncMetadata(componentPath: string, targetDir: string): void {
	const metadata = loadMetadata(targetDir)
	const entry = metadata.ejected[componentPath]

	if (!entry) {
		console.error(`Component ${componentPath} is not ejected.`)
		process.exit(1)
	}

	const component = findUpstreamComponent(componentPath)
	const upstreamSource = readFileSync(component.sourcePath, 'utf-8')
	const version = getPackageVersion()

	updateMetadata(metadata, componentPath, targetDir, component.sourcePath, version, upstreamSource)
	console.log(`  ✓ ${componentPath} — metadata synced to v${version}`)
}

function retrieveBaseSource(gitRef: string, gitPath: string): string {
	try {
		return getOriginalSource(gitRef, gitPath)
	} catch {
		throw new Error(`Cannot retrieve base version at ${gitRef}:${gitPath}. The git history may have been rewritten.`)
	}
}

function findUpstreamComponent(componentPath: string): { path: string; sourcePath: string } {
	const components = discoverComponents()
	const component = components.find(c => c.path === componentPath)

	if (!component) {
		console.error(`Component ${componentPath} not found in package.`)
		process.exit(1)
	}

	return component
}

function updateMetadata(
	metadata: BindxUIMetadata,
	componentPath: string,
	targetDir: string,
	sourcePath: string,
	version: string,
	upstreamSource: string,
): void {
	metadata.ejected[componentPath] = {
		path: componentPath,
		version,
		originalHash: hashContent(upstreamSource),
		gitRef: getGitRef(),
		gitPath: getGitPath(sourcePath),
	}
	saveMetadata(targetDir, metadata)
}

function computeDiffs(base: string, local: string, upstream: string): { localDiff: string; upstreamDiff: string } {
	const tempDir = mkdtempSync(join(tmpdir(), 'bindx-diff-'))
	const baseFile = join(tempDir, 'base')
	const localFile = join(tempDir, 'local')
	const upstreamFile = join(tempDir, 'upstream')

	try {
		writeFileSync(baseFile, base, 'utf-8')
		writeFileSync(localFile, local, 'utf-8')
		writeFileSync(upstreamFile, upstream, 'utf-8')

		return {
			localDiff: runDiff(baseFile, localFile),
			upstreamDiff: runDiff(baseFile, upstreamFile),
		}
	} finally {
		rmSync(tempDir, { recursive: true, force: true })
	}
}

function runDiff(fileA: string, fileB: string): string {
	try {
		return execSync(`diff -u "${fileA}" "${fileB}"`, { encoding: 'utf-8' })
	} catch (error: unknown) {
		if (isExecError(error)) {
			return error.stdout
		}
		return ''
	}
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

function createHeader(version: string, path: string): string {
	return `// Ejected from @contember/bindx-ui@${version} — ${path}\n`
}

function isExecError(error: unknown): error is { stdout: string } {
	return (
		typeof error === 'object'
		&& error !== null
		&& 'stdout' in error
		&& typeof (error as { stdout: unknown }).stdout === 'string'
	)
}

function hashContent(content: string): string {
	return createHash('sha256').update(content).digest('hex').slice(0, 16)
}
