import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

export function getPackageRoot(): string {
	return resolve(dirname(new URL(import.meta.url).pathname), '../..')
}

const COMPONENT_FOLDERS = ['ui', 'form', 'datagrid', 'select', 'upload', 'repeater', 'persist', 'labels', 'errors']

export function getComponentFolders(): readonly string[] {
	return COMPONENT_FOLDERS
}

export function getPackageSrcDir(): string {
	return resolve(getPackageRoot(), 'src')
}

export function getPackageVersion(): string {
	const packageJsonPath = resolve(getPackageRoot(), 'package.json')
	const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version: string }
	return packageJson.version
}
