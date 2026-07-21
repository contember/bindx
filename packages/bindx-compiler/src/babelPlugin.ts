/**
 * Babel plugin: injects the emitted StaticSelection as the 2nd argument of each
 * proven chain's `.render(...)` call. Bailed chains are left untouched, so the
 * runtime proxy pass remains the fallback (progressive enhancement).
 *
 * The runtime side of `.render(fn, static)` is deliverable A — this plugin only
 * emits the argument and never imports anything from bindx-react.
 */
import type { PluginObj } from '@babel/core'
import { analyzeProgram } from './analyze.js'
import { selectionToAst } from './emit.js'
import { isBailed } from './types.js'

export function bindxCompilerPlugin(): PluginObj {
	return {
		name: 'bindx-selection-compiler',
		manipulateOptions(_opts, parserOpts: { plugins: unknown[] }): void {
			parserOpts.plugins.push('jsx', 'typescript')
		},
		visitor: {
			Program(path): void {
				for (const { chain, result } of analyzeProgram(path.node)) {
					if (isBailed(result)) {
						continue
					}
					// Presence of a 2nd argument means already-compiled — never double-inject.
					if (chain.renderCall.arguments.length >= 2) {
						continue
					}
					chain.renderCall.arguments.push(selectionToAst(result.selection, result.holes))
				}
				path.skip()
			},
		},
	}
}

export default bindxCompilerPlugin
