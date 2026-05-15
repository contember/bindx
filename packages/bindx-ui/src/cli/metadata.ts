import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

export interface EjectedEntry {
	path: string
	version: string
	originalHash: string
	gitRef?: string
	gitPath?: string
}

export interface BindxUIMetadata {
	ejected: Record<string, EjectedEntry>
}

const METADATA_FILE = '.bindx-ui.json'
const VALID_COMPONENT_PATH = /^[a-zA-Z0-9_][a-zA-Z0-9_./-]*$/

export function assertSafeComponentPath(componentPath: string): void {
	if (
		!componentPath
		|| isAbsolute(componentPath)
		|| componentPath.includes('..')
		|| componentPath.includes('\\')
		|| componentPath.startsWith('/')
		|| !VALID_COMPONENT_PATH.test(componentPath)
	) {
		throw new Error(
			`Invalid component path: ${JSON.stringify(componentPath)}. `
			+ `Must be a relative slash-separated path without "..".`,
		)
	}
}

export function loadMetadata(targetDir: string): BindxUIMetadata {
	const filePath = join(targetDir, METADATA_FILE)

	if (!existsSync(filePath)) {
		return { ejected: {} }
	}

	const content = readFileSync(filePath, 'utf-8')
	const parsed = JSON.parse(content) as BindxUIMetadata

	for (const key of Object.keys(parsed.ejected ?? {})) {
		assertSafeComponentPath(key)
		const entryPath = parsed.ejected[key]?.path
		if (entryPath !== undefined) {
			assertSafeComponentPath(entryPath)
		}
	}

	return parsed
}

export function saveMetadata(targetDir: string, metadata: BindxUIMetadata): void {
	for (const key of Object.keys(metadata.ejected)) {
		assertSafeComponentPath(key)
	}
	mkdirSync(targetDir, { recursive: true })
	const filePath = join(targetDir, METADATA_FILE)
	writeFileSync(filePath, JSON.stringify(metadata, null, '\t') + '\n', 'utf-8')
}
