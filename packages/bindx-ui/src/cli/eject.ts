import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { discoverComponents } from './registry.js'
import { loadMetadata, saveMetadata, type EjectedEntry } from './metadata.js'
import { getPackageVersion } from './paths.js'

export function eject(componentPath: string, targetDir: string): void {
	const components = discoverComponents()

	const isGlob = componentPath.endsWith('/*')
	const folder = isGlob ? componentPath.slice(0, -2) : null

	const toEject = folder
		? components.filter(c => c.path.startsWith(folder + '/'))
		: components.filter(c => c.path === componentPath)

	if (toEject.length === 0) {
		console.error(`Component not found: ${componentPath}`)
		console.error(`Available components:`)
		for (const c of components) {
			console.error(`  ${c.path}`)
		}
		process.exit(1)
	}

	const version = getPackageVersion()
	const metadata = loadMetadata(targetDir)

	for (const component of toEject) {
		const targetPath = resolve(targetDir, component.path + '.tsx')

		if (existsSync(targetPath)) {
			console.log(`  ⚠ Skipping ${component.path} (already exists locally)`)
			continue
		}

		const source = readFileSync(component.sourcePath, 'utf-8')
		const header = `// Ejected from @contember/bindx-ui@${version} — ${component.path}\n`

		mkdirSync(dirname(targetPath), { recursive: true })
		writeFileSync(targetPath, header + source, 'utf-8')

		const entry: EjectedEntry = {
			path: component.path,
			version,
			originalHash: hashContent(source),
		}
		metadata.ejected[component.path] = entry

		console.log(`  ✓ Ejected ${component.path} → ${targetPath}`)
	}

	saveMetadata(targetDir, metadata)

	const dependents = findDependents(componentPath, components)
	if (dependents.length > 0) {
		console.log(`\n  Used by: ${dependents.map(d => d.path).join(', ')}`)
		console.log(`  (these will auto-resolve your version via Vite plugin)`)
	}
}

function hashContent(content: string): string {
	return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

function findDependents(
	componentPath: string,
	components: { path: string; sourcePath: string }[],
): { path: string }[] {
	const importPattern = `#bindx-ui/${componentPath}`
	return components.filter(c => {
		if (c.path === componentPath) return false
		const content = readFileSync(c.sourcePath, 'utf-8')
		return content.includes(importPattern)
	})
}
