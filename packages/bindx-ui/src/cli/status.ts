import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadMetadata } from './metadata.js'
import { discoverComponents } from './registry.js'
import { getPackageVersion } from './paths.js'
import { getOriginalSource } from './git.js'

export function status(targetDir: string): void {
	const metadata = loadMetadata(targetDir)
	const ejectedPaths = Object.keys(metadata.ejected)

	if (ejectedPaths.length === 0) {
		console.log('No ejected components.')
		return
	}

	const version = getPackageVersion()
	const components = discoverComponents()
	const componentMap = new Map(components.map(c => [c.path, c]))

	console.log('Ejected components:\n')

	for (const path of ejectedPaths.sort()) {
		const entry = metadata.ejected[path]
		if (!entry) continue

		const packageComponent = componentMap.get(path)
		if (!packageComponent) {
			console.log(`  ✗ ${path} (removed from package)`)
			continue
		}

		const statusLabel = resolveStatusLabel(entry, packageComponent, version, targetDir)
		console.log(`  ${statusLabel}`)
	}

	console.log(`\nPackage components: ${components.length}`)
}

function resolveStatusLabel(
	entry: { path: string; version: string; originalHash: string; gitRef?: string; gitPath?: string },
	packageComponent: { path: string; sourcePath: string },
	currentVersion: string,
	targetDir: string,
): string {
	const upstreamSource = readFileSync(packageComponent.sourcePath, 'utf-8')
	const upstreamHash = hashContent(upstreamSource)

	if (!entry.gitRef || !entry.gitPath) {
		if (entry.version !== currentVersion || upstreamHash !== entry.originalHash) {
			return `⚠ ${entry.path} (ejected from v${entry.version}, current v${currentVersion}, no git ref for merge)`
		}
		return `✓ ${entry.path} (up to date with v${entry.version})`
	}

	const localPath = resolve(targetDir, entry.path + '.tsx')
	if (!existsSync(localPath)) {
		return `✗ ${entry.path} (local file missing)`
	}

	const localRaw = readFileSync(localPath, 'utf-8')
	const localSource = stripHeader(localRaw)
	const localHash = hashContent(localSource)

	let baseSource: string | undefined
	try {
		baseSource = getOriginalSource(entry.gitRef, entry.gitPath)
	} catch {
		if (entry.version !== currentVersion || upstreamHash !== entry.originalHash) {
			return `⚠ ${entry.path} (ejected from v${entry.version}, git ref unavailable)`
		}
		return `✓ ${entry.path} (up to date with v${entry.version})`
	}

	const baseHash = hashContent(baseSource)
	const upstreamChanged = baseHash !== upstreamHash
	const localChanged = baseHash !== localHash

	if (upstreamChanged && localChanged) {
		return `⚠ ${entry.path} (both changed — merge needed)`
	}

	if (upstreamChanged) {
		return `⚠ ${entry.path} (upstream changed — auto-update available)`
	}

	if (localChanged) {
		return `✓ ${entry.path} (locally modified, upstream unchanged)`
	}

	return `✓ ${entry.path} (up to date with v${entry.version})`
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

function hashContent(content: string): string {
	return createHash('sha256').update(content).digest('hex').slice(0, 16)
}
