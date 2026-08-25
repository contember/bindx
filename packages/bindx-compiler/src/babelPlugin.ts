/**
 * Babel plugin: injects the emitted StaticSelection as the 2nd argument of each proven chain's
 * `.render(...)` call, and a hoisted `compiledSelection={…}` attribute on each proven `<Entity>`.
 * Bailed units are left untouched, so the runtime proxy pass remains the fallback (progressive
 * enhancement). The runtime side of `.render(fn, static)` is deliverable A — this plugin only
 * emits and never imports anything from bindx-react.
 *
 * Crash containment: analysis contains unexpected bugs per unit (INTERNAL_ERROR bail in analyze.ts /
 * entityRoots.ts); this plugin additionally wraps discovery and each emit so one internal failure
 * degrades to "no injection for that unit" (proxy fallback is sound) instead of failing the build.
 */
import type { NodePath, PluginObj, PluginPass } from '@babel/core'
import * as t from '@babel/types'
import { analyzeEntityRootsInProgram, analyzeProgram } from './analyze.js'
import type { ModuleCache } from './moduleResolve.js'
import { compiledSelectionAttr, entitySelectionObject, selectionToAst } from './emit.js'
import { ENTITY_ROOT_KEY, hasCompiledSelectionAttr } from './entityRoots.js'
import { messageOf } from './resolve.js'
import { isBailed, isEntityRootBailed } from './types.js'
import { reportFile, type DiagnosticEntry, type DiagnosticsMode, type DiagnosticTotals } from './diagnostics.js'

/**
 * Plugin options:
 * - `alias` maps non-relative import prefixes to paths for cross-file contract/target discovery.
 * - `entityLike` lists forwarding-wrapper component names treated as `<Entity>` for root scanning
 *   (phase 3.1). The injected `compiledSelection` reaches the inner `<Entity>` via the wrapper's
 *   `{...props}` spread — that forwarding is the opt-in requirement (no runtime change).
 * - `diagnostics` controls per-file console reporting (default 'off'). INTERNAL_ERROR always warns.
 * - `onReport` receives per-file totals so a bundler layer can print a grand total.
 */
export interface BindxCompilerOptions {
	readonly alias?: Record<string, string>
	readonly entityLike?: readonly string[]
	/** Reports each cross-file module consulted during analysis (see AnalyzeOptions.onDependency). */
	readonly onDependency?: (absPath: string) => void
	/** Per-file console reporting verbosity. Default 'off'. */
	readonly diagnostics?: DiagnosticsMode
	/** Called once per transformed file with its compile/bail totals. */
	readonly onReport?: (totals: DiagnosticTotals) => void
	/**
	 * Shared parsed-sibling-module cache. The Vite plugin injects ONE per instance so dev-server
	 * memory stays bounded per build; bare babel-plugin usage falls back to the module-level default.
	 */
	readonly cache?: ModuleCache
}

export function bindxCompilerPlugin(_api?: unknown, options?: BindxCompilerOptions): PluginObj {
	const alias = options?.alias ?? {}
	const entityLike = options?.entityLike
	const onDependency = options?.onDependency
	const diagnostics = options?.diagnostics ?? 'off'
	const onReport = options?.onReport
	const cache = options?.cache
	return {
		name: 'bindx-selection-compiler',
		manipulateOptions(_opts, parserOpts: { plugins: unknown[] }): void {
			parserOpts.plugins.push('jsx', 'typescript')
		},
		visitor: {
			Program(path, state: PluginPass): void {
				const filename = state.file.opts.filename ?? undefined
				const entries: DiagnosticEntry[] = []

				// Discovery is wrapped: reading the whole AST first keeps chain and Entity injection
				// independent, and a crash here degrades the file to the proxy fallback (never fatal).
				const chainResults = discover(() => analyzeProgram(path.node, { filename, alias, onDependency, cache }), entries)
				const entityResults = discover(() => analyzeEntityRootsInProgram(path.node, { filename, alias, entityLike, onDependency, cache }), entries)

				for (const { chain, result } of chainResults) {
					if (isBailed(result)) {
						entries.push(bailEntry(result.loc.line, result.bailout.code, result.bailout.message))
						continue
					}
					// Presence of a 2nd argument means already-compiled — never double-inject.
					if (chain.renderCall.arguments.length >= 2) {
						continue
					}
					tryEmit(entries, result.loc.line, () => {
						chain.renderCall.arguments.push(selectionToAst(result.selection, result.holes))
					})
				}

				const hoisted: t.Statement[] = []
				for (const { element, result } of entityResults) {
					if (isEntityRootBailed(result)) {
						entries.push(bailEntry(result.loc.line, result.bailout.code, result.bailout.message))
						continue
					}
					// Idempotence: skip elements already carrying a compiledSelection attribute
					// (an identifier-valued attribute from a prior hoist also triggers this skip).
					if (hasCompiledSelectionAttr(element)) {
						continue
					}
					tryEmit(entries, result.loc.line, () => {
						hoistEntitySelection(path, element, result.selection, result.holes, hoisted)
					})
				}
				insertAfterImports(path.node, hoisted)

				const totals = reportFile(filename, entries, diagnostics)
				onReport?.(totals)
				path.skip()
			},
		},
	}
}

/** Run discovery, containing an unexpected crash as a file-level INTERNAL_ERROR entry (empty result). */
function discover<T>(fn: () => T[], entries: DiagnosticEntry[]): T[] {
	try {
		return fn()
	} catch (error) {
		entries.push(bailEntry(0, 'INTERNAL_ERROR', messageOf(error)))
		return []
	}
}

/** Run one emit, containing an unexpected crash so only that unit loses its injection. */
function tryEmit(entries: DiagnosticEntry[], line: number, emit: () => void): void {
	try {
		emit()
		entries.push({ compiled: true, line })
	} catch (error) {
		entries.push(bailEntry(line, 'INTERNAL_ERROR', messageOf(error)))
	}
}

function bailEntry(line: number, code: DiagnosticEntry['code'], message: string): DiagnosticEntry {
	return { compiled: false, line, code, message }
}

/**
 * Hoist a proven `<Entity>` root's CompiledSelection to a module-scope const and reference it from the
 * attribute — stable identity across parent renders (an inline literal re-resolves every render, so
 * `useRootSelection`'s memo would re-resolve all holes and validate-mode would re-warn each time).
 */
function hoistEntitySelection(
	path: NodePath<t.Program>,
	element: t.JSXElement,
	selection: Parameters<typeof entitySelectionObject>[1],
	holes: Parameters<typeof entitySelectionObject>[2],
	hoisted: t.Statement[],
): void {
	const obj = entitySelectionObject(ENTITY_ROOT_KEY, selection, holes)
	const id = path.scope.generateUidIdentifier('bindxCompiledSelection')
	hoisted.push(t.variableDeclaration('const', [t.variableDeclarator(id, obj)]))
	// Fresh identifier for the reference — never share the binding-site node with the use site.
	element.openingElement.attributes.push(compiledSelectionAttr(t.identifier(id.name)))
}

/** Insert hoisted declarations after the last import (so module-scope refs stay above first use). */
function insertAfterImports(program: t.Program, decls: readonly t.Statement[]): void {
	if (decls.length === 0) {
		return
	}
	let index = 0
	for (let i = 0; i < program.body.length; i++) {
		if (t.isImportDeclaration(program.body[i])) {
			index = i + 1
		}
	}
	program.body.splice(index, 0, ...decls)
}

export default bindxCompilerPlugin
