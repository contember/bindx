import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { loadMetadata, saveMetadata, type BindxUIMetadata, type EjectedEntry } from './metadata.js'
import { discoverComponents, type ComponentEntry } from './registry.js'
import { getPackageVersion } from './paths.js'
import { getGitRef, getGitPath, getOriginalSource } from './git.js'
import { threeWayMerge } from './merge.js'
import { generateAgentPrompt, generateAgentBatchPrompt, type AgentBatchSummaryItem } from './agent-prompt.js'

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

	const components = discoverComponents()
	const component = components.find(c => c.path === componentPath)
	const localPath = resolve(targetDir, componentPath + '.tsx')

	// Edge case: upstream removed
	if (!component) {
		console.log(`  ✗ ${componentPath} — removed from upstream package. Your local file is preserved.`)
		return
	}

	// Edge case: local file missing
	if (!existsSync(localPath)) {
		console.log(`  ✗ ${componentPath} — local file missing. Run 'bindx-ui eject ${componentPath}' to re-eject.`)
		return
	}

	// Edge case: no git ref
	if (!entry.gitRef || !entry.gitPath) {
		if (options.agent) {
			console.error(`Git ref not available for ${componentPath}. Cannot generate diffs. Re-eject the component to enable backporting.`)
		} else {
			console.error(`Git ref not available for ${componentPath}. Re-eject the component or use --agent for AI-assisted merge.`)
		}
		process.exit(1)
	}

	// Edge case: git history unavailable (shallow clone, rewritten history)
	let baseSource: string
	try {
		baseSource = getOriginalSource(entry.gitRef, entry.gitPath)
	} catch {
		console.error(`Cannot retrieve base version at ${entry.gitRef}:${entry.gitPath}.`)
		console.error(`The git history may be shallow or rewritten. Try: git fetch --unshallow`)
		process.exit(1)
	}

	const upstreamSource = readFileSync(component.sourcePath, 'utf-8')
	const localRaw = readFileSync(localPath, 'utf-8')
	const localSource = stripHeader(localRaw)

	const baseHash = hashContent(baseSource)
	const upstreamHash = hashContent(upstreamSource)
	const localHash = hashContent(localSource)
	const version = getPackageVersion()

	// Fast path: upstream unchanged
	if (baseHash === upstreamHash) {
		console.log(`  ✓ ${componentPath} — already up to date`)
		return
	}

	// Fast path: user hasn't modified → auto-update
	if (baseHash === localHash) {
		if (options.dryRun) {
			console.log(`  → ${componentPath} — would auto-update (no local changes)`)
			return
		}
		const header = createHeader(version, componentPath)
		writeFileSync(localPath, header + upstreamSource, 'utf-8')
		updateMetadata(metadata, componentPath, component.sourcePath, version, upstreamSource)
		saveMetadata(targetDir, metadata)
		console.log(`  ✓ ${componentPath} — auto-updated (no local changes)`)
		return
	}

	// Fast path: local already matches upstream
	if (localHash === upstreamHash) {
		if (options.dryRun) {
			console.log(`  ✓ ${componentPath} — local matches upstream, would update metadata`)
			return
		}
		updateMetadata(metadata, componentPath, component.sourcePath, version, upstreamSource)
		saveMetadata(targetDir, metadata)
		console.log(`  ✓ ${componentPath} — local matches upstream, metadata updated`)
		return
	}

	// Agent mode: print prompt
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

	// Three-way merge
	const result = threeWayMerge(localSource, baseSource, upstreamSource)

	if (result.status === 'clean') {
		const header = createHeader(version, componentPath)
		writeFileSync(localPath, header + result.content, 'utf-8')
		updateMetadata(metadata, componentPath, component.sourcePath, version, upstreamSource)
		saveMetadata(targetDir, metadata)
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

	// In non-agent mode, just iterate
	if (!options.agent) {
		for (const componentPath of paths) {
			backport(componentPath, targetDir, options)
		}
		return
	}

	// Agent mode: collect status for all components, auto-update what we can, then generate batch prompt
	const components = discoverComponents()
	const componentMap = new Map(components.map(c => [c.path, c]))
	const version = getPackageVersion()
	const batchItems: AgentBatchSummaryItem[] = []
	const autoUpdated: string[] = []
	const upToDate: string[] = []

	for (const componentPath of paths) {
		const entry = metadata.ejected[componentPath]
		if (!entry) continue

		const component = componentMap.get(componentPath)
		const localPath = resolve(targetDir, componentPath + '.tsx')

		// Edge case: upstream removed
		if (!component) {
			batchItems.push({ componentPath, ejectVersion: entry.version, status: 'upstream-removed', localFilePath: localPath })
			continue
		}

		// Edge case: local file missing
		if (!existsSync(localPath)) {
			batchItems.push({ componentPath, ejectVersion: entry.version, status: 'local-missing', localFilePath: localPath })
			continue
		}

		// Edge case: no git ref
		if (!entry.gitRef || !entry.gitPath) {
			batchItems.push({ componentPath, ejectVersion: entry.version, status: 'no-git-ref', localFilePath: localPath })
			continue
		}

		// Edge case: git history unavailable
		let baseSource: string
		try {
			baseSource = getOriginalSource(entry.gitRef, entry.gitPath)
		} catch {
			batchItems.push({ componentPath, ejectVersion: entry.version, status: 'no-git-ref', localFilePath: localPath })
			continue
		}

		const upstreamSource = readFileSync(component.sourcePath, 'utf-8')
		const localRaw = readFileSync(localPath, 'utf-8')
		const localSource = stripHeader(localRaw)

		const baseHash = hashContent(baseSource)
		const upstreamHash = hashContent(upstreamSource)
		const localHash = hashContent(localSource)

		// Already up to date
		if (baseHash === upstreamHash) {
			upToDate.push(componentPath)
			continue
		}

		// Auto-update: user hasn't modified
		if (baseHash === localHash) {
			if (!options.dryRun) {
				const header = createHeader(version, componentPath)
				writeFileSync(localPath, header + upstreamSource, 'utf-8')
				updateMetadata(metadata, componentPath, component.sourcePath, version, upstreamSource)
			}
			autoUpdated.push(componentPath)
			continue
		}

		// Local matches upstream already
		if (localHash === upstreamHash) {
			if (!options.dryRun) {
				updateMetadata(metadata, componentPath, component.sourcePath, version, upstreamSource)
			}
			upToDate.push(componentPath)
			continue
		}

		// Both changed — needs merge
		batchItems.push({ componentPath, ejectVersion: entry.version, status: 'merge-needed', localFilePath: localPath })
	}

	// Save metadata for auto-updated components
	if (!options.dryRun && autoUpdated.length > 0) {
		saveMetadata(targetDir, metadata)
	}

	// Generate batch prompt
	const prompt = generateAgentBatchPrompt(batchItems, version, autoUpdated, upToDate)
	console.log(prompt)
}

export function syncMetadata(componentPath: string, targetDir: string): void {
	const metadata = loadMetadata(targetDir)
	const entry = metadata.ejected[componentPath]

	if (!entry) {
		console.error(`Component ${componentPath} is not ejected.`)
		process.exit(1)
	}

	const components = discoverComponents()
	const component = components.find(c => c.path === componentPath)

	if (!component) {
		console.error(`Component ${componentPath} not found in package.`)
		process.exit(1)
	}

	const upstreamSource = readFileSync(component.sourcePath, 'utf-8')
	const version = getPackageVersion()

	updateMetadata(metadata, componentPath, component.sourcePath, version, upstreamSource)
	saveMetadata(targetDir, metadata)
	console.log(`  ✓ ${componentPath} — metadata synced to v${version}`)
}

export function skipComponent(componentPath: string, targetDir: string): void {
	const metadata = loadMetadata(targetDir)
	const entry = metadata.ejected[componentPath]

	if (!entry) {
		console.error(`Component ${componentPath} is not ejected.`)
		process.exit(1)
	}

	const components = discoverComponents()
	const component = components.find(c => c.path === componentPath)

	if (!component) {
		// Upstream removed — just update version to mark as acknowledged
		entry.version = getPackageVersion()
		saveMetadata(targetDir, metadata)
		console.log(`  ✓ ${componentPath} — skipped (upstream removed, acknowledged)`)
		return
	}

	// Update git ref to current HEAD so future backports use this as base
	// This means: "I've seen the upstream changes and chose to keep my version"
	const upstreamSource = readFileSync(component.sourcePath, 'utf-8')
	const version = getPackageVersion()

	updateMetadata(metadata, componentPath, component.sourcePath, version, upstreamSource)
	saveMetadata(targetDir, metadata)
	console.log(`  ✓ ${componentPath} — skipped (upstream changes acknowledged, base updated)`)
}

function updateMetadata(
	metadata: BindxUIMetadata,
	componentPath: string,
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
