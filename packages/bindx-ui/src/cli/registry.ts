import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { getComponentFolders, getPackageSrcDir } from './paths.js'

export interface ComponentEntry {
	/** e.g. 'form/container' */
	path: string
	/** Absolute path to source file in package */
	sourcePath: string
}

export function discoverComponents(): ComponentEntry[] {
	const srcDir = getPackageSrcDir()
	const entries: ComponentEntry[] = []

	for (const folder of getComponentFolders()) {
		const folderPath = join(srcDir, folder)
		if (!existsSync(folderPath)) {
			continue
		}
		walkDir(folderPath, srcDir, entries)
	}

	return entries.sort((a, b) => a.path.localeCompare(b.path))
}

function walkDir(dir: string, root: string, entries: ComponentEntry[]): void {
	for (const entry of readdirSync(dir)) {
		const fullPath = join(dir, entry)
		const stat = statSync(fullPath)

		if (stat.isDirectory()) {
			walkDir(fullPath, root, entries)
			continue
		}

		if (!isComponentFile(entry)) {
			continue
		}

		const relPath = relative(root, fullPath)
		const componentPath = relPath.replace(/\.(tsx?|jsx?)$/, '').replaceAll('\\', '/')
		entries.push({ path: componentPath, sourcePath: fullPath })
	}
}

function isComponentFile(filename: string): boolean {
	return /\.(tsx?|jsx?)$/.test(filename) && !filename.startsWith('index.')
}
