import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

const BINDX_UI_PREFIX = '#bindx-ui/'
const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js']

export interface BindxUIPluginOptions {
	/** Directory where local component overrides live. Default: './src/ui' */
	dir?: string
}

export function bindxUI(options: BindxUIPluginOptions = {}): Plugin {
	let resolvedDir: string
	let config: ResolvedConfig

	return {
		name: 'bindx-ui-override',
		enforce: 'pre',

		configResolved(resolvedConfig: ResolvedConfig): void {
			config = resolvedConfig
			resolvedDir = resolve(config.root, options.dir ?? './src/ui')
		},

		resolveId(source: string): string | null {
			if (!source.startsWith(BINDX_UI_PREFIX)) {
				return null
			}

			const componentPath = source.slice(BINDX_UI_PREFIX.length)

			for (const ext of EXTENSIONS) {
				const localPath = join(resolvedDir, componentPath + ext)
				if (existsSync(localPath)) {
					return localPath
				}
			}

			// Fallback to package default
			return `@contember/bindx-ui/_internal/${componentPath}`
		},
	}
}
