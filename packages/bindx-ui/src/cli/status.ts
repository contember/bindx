import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { loadMetadata } from './metadata.js'
import { discoverComponents } from './registry.js'
import { getPackageVersion } from './paths.js'

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

		const currentSource = readFileSync(packageComponent.sourcePath, 'utf-8')
		const currentHash = hashContent(currentSource)

		if (entry.version !== version) {
			console.log(`  ⚠ ${path} (ejected from v${entry.version}, current v${version})`)
		} else if (currentHash !== entry.originalHash) {
			console.log(`  ⚠ ${path} (package source changed since eject)`)
		} else {
			console.log(`  ✓ ${path} (up to date with v${entry.version})`)
		}
	}

	console.log(`\nPackage components: ${components.length}`)
}

function hashContent(content: string): string {
	return createHash('sha256').update(content).digest('hex').slice(0, 16)
}
