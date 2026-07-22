/**
 * Babel plugin: injects the emitted StaticSelection as the 2nd argument of each
 * proven chain's `.render(...)` call. Bailed chains are left untouched, so the
 * runtime proxy pass remains the fallback (progressive enhancement).
 *
 * The runtime side of `.render(fn, static)` is deliverable A — this plugin only
 * emits the argument and never imports anything from bindx-react.
 */
import type { PluginObj, PluginPass } from '@babel/core'
import { analyzeEntityRootsInProgram, analyzeProgram } from './analyze.js'
import { entitySelectionAttr, selectionToAst } from './emit.js'
import { ENTITY_ROOT_KEY, hasCompiledSelectionAttr } from './entityRoots.js'
import { isBailed, isEntityRootBailed } from './types.js'

/**
 * Plugin options:
 * - `alias` maps non-relative import prefixes to paths for cross-file contract/target discovery.
 * - `entityLike` lists forwarding-wrapper component names treated as `<Entity>` for root scanning
 *   (phase 3.1). The injected `compiledSelection` reaches the inner `<Entity>` via the wrapper's
 *   `{...props}` spread — that forwarding is the opt-in requirement (no runtime change).
 */
export interface BindxCompilerOptions {
	readonly alias?: Record<string, string>
	readonly entityLike?: readonly string[]
	/** Reports each cross-file module consulted during analysis (see AnalyzeOptions.onDependency). */
	readonly onDependency?: (absPath: string) => void
}

export function bindxCompilerPlugin(_api?: unknown, options?: BindxCompilerOptions): PluginObj {
	const alias = options?.alias ?? {}
	const entityLike = options?.entityLike
	const onDependency = options?.onDependency
	return {
		name: 'bindx-selection-compiler',
		manipulateOptions(_opts, parserOpts: { plugins: unknown[] }): void {
			parserOpts.plugins.push('jsx', 'typescript')
		},
		visitor: {
			Program(path, state: PluginPass): void {
				const filename = state.file.opts.filename ?? undefined
				// Analyze both surfaces before mutating: chain injection and Entity-attribute
				// injection are independent, but reading the whole AST first keeps them so.
				const chainResults = analyzeProgram(path.node, { filename, alias, onDependency })
				const entityResults = analyzeEntityRootsInProgram(path.node, { filename, alias, entityLike, onDependency })

				for (const { chain, result } of chainResults) {
					if (isBailed(result)) {
						continue
					}
					// Presence of a 2nd argument means already-compiled — never double-inject.
					if (chain.renderCall.arguments.length >= 2) {
						continue
					}
					chain.renderCall.arguments.push(selectionToAst(result.selection, result.holes))
				}

				for (const { element, result } of entityResults) {
					if (isEntityRootBailed(result)) {
						continue
					}
					// Idempotence: skip elements already carrying a compiledSelection attribute.
					if (hasCompiledSelectionAttr(element)) {
						continue
					}
					element.openingElement.attributes.push(entitySelectionAttr(ENTITY_ROOT_KEY, result.selection, result.holes))
				}
				path.skip()
			},
		},
	}
}

export default bindxCompilerPlugin
