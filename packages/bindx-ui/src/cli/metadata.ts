import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

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

export function loadMetadata(targetDir: string): BindxUIMetadata {
	const filePath = join(targetDir, METADATA_FILE)

	if (!existsSync(filePath)) {
		return { ejected: {} }
	}

	const content = readFileSync(filePath, 'utf-8')
	return JSON.parse(content) as BindxUIMetadata
}

export function saveMetadata(targetDir: string, metadata: BindxUIMetadata): void {
	mkdirSync(targetDir, { recursive: true })
	const filePath = join(targetDir, METADATA_FILE)
	writeFileSync(filePath, JSON.stringify(metadata, null, '\t') + '\n', 'utf-8')
}
