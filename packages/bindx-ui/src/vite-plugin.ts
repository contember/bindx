import { existsSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, ResolvedConfig } from 'vite'

const BINDX_UI_PREFIX = '#bindx-ui/'
const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js']

const packageSrcDir = resolve(dirname(fileURLToPath(import.meta.url)))

export interface BindxUIPluginOptions {
	/** Directory where local component overrides live. Default: './src/ui' */
	dir?: string
}

export function bindxUI(options: BindxUIPluginOptions = {}): Plugin {
	let resolvedDir: string

	return {
		name: 'bindx-ui-override',
		enforce: 'pre',

		configResolved(resolvedConfig: ResolvedConfig): void {
			resolvedDir = resolve(resolvedConfig.root, options.dir ?? './src/ui')
		},

		resolveId(source: string): string | null {
			if (!source.startsWith(BINDX_UI_PREFIX)) {
				return null
			}

			const componentPath = source.slice(BINDX_UI_PREFIX.length)

			// Check for local override first
			for (const ext of EXTENSIONS) {
				const localPath = join(resolvedDir, componentPath + ext)
				if (existsSync(localPath)) {
					return localPath
				}
			}

			// Fallback: resolve directly to the source file in the package
			for (const ext of EXTENSIONS) {
				const packagePath = join(packageSrcDir, componentPath + ext)
				if (existsSync(packagePath)) {
					return packagePath
				}
			}

			return null
		},
	}
}
