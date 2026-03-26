import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { discoverComponents } from './registry.js'



export function diff(componentPath: string, targetDir: string): void {
	const components = discoverComponents()
	const component = components.find(c => c.path === componentPath)

	if (!component) {
		console.error(`Component not found in package: ${componentPath}`)
		process.exit(1)
	}

	const localPath = resolve(targetDir, componentPath + '.tsx')

	if (!existsSync(localPath)) {
		console.error(`No local override found: ${localPath}`)
		process.exit(1)
	}

	try {
		const output = execSync(`diff -u "${component.sourcePath}" "${localPath}"`, {
			encoding: 'utf-8',
		})
		if (output.length === 0) {
			console.log(`No differences for ${componentPath}`)
		} else {
			console.log(output)
		}
	} catch (error: unknown) {
		if (error && typeof error === 'object' && 'stdout' in error) {
			// diff exits with 1 when files differ — that's expected
			console.log((error as { stdout: string }).stdout)
		} else {
			throw error
		}
	}
}
