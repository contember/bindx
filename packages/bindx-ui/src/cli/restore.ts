import { existsSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadMetadata, saveMetadata } from './metadata.js'

export function restore(componentPath: string, targetDir: string): void {
	const metadata = loadMetadata(targetDir)

	if (!metadata.ejected[componentPath]) {
		console.error(`Component ${componentPath} is not ejected.`)
		process.exit(1)
	}

	const targetPath = resolve(targetDir, componentPath + '.tsx')

	if (existsSync(targetPath)) {
		unlinkSync(targetPath)
		console.log(`  ✓ Removed ${targetPath}`)
	}

	delete metadata.ejected[componentPath]
	saveMetadata(targetDir, metadata)

	console.log(`  ✓ Restored ${componentPath} to package default`)
}
