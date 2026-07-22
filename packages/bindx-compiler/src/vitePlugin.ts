/**
 * First-class Vite plugin for the bindx selection compiler.
 *
 * Runs the babel plugin with `enforce: 'pre'` so the static selection literal is injected BEFORE
 * @vitejs/plugin-react performs the JSX transform (this pass only injects; it never transforms JSX).
 *
 * Cross-module correctness: the analyzer reads OTHER files (collector contracts, hole target-kind,
 * re-export barrels) to decide what to emit for file A. Each such read is reported via `onDependency`
 * and registered with Vite through `this.addWatchFile`, so editing a contract/target module
 * re-transforms A — its injected literal never keeps a stale decision (a stale literal could
 * otherwise flip a correct emit into an under-fetch, violating the soundness invariant).
 *
 * The return type is structural (not `import('vite').Plugin`) so the package keeps vite as an
 * OPTIONAL peer and the transform's `this` is a minimal, mockable surface; the shape is still
 * assignable to Vite's `Plugin`, so `plugins: [bindxCompiler()]` type-checks.
 */
import { transformAsync, type BabelFileResult } from '@babel/core'
import { bindxCompilerPlugin } from './babelPlugin.js'
import { reportTotals, type DiagnosticsMode, type DiagnosticTotals } from './diagnostics.js'

/** Config for {@link bindxCompiler}; mirrors the babel plugin options plus file filtering. */
export interface BindxCompilerViteOptions {
	/** Non-relative import prefix → path map for cross-file contract/target discovery. */
	readonly alias?: Record<string, string>
	/** Forwarding-wrapper component names treated as `<Entity>` roots (phase 3.1). */
	readonly entityLike?: readonly string[]
	/** Only transform ids matching one of these (substring or regex). Default: every `.tsx`/`.jsx`. */
	readonly include?: readonly (string | RegExp)[]
	/** Skip ids matching one of these (substring or regex). Applied after `include`. */
	readonly exclude?: readonly (string | RegExp)[]
	/** Per-file console reporting verbosity; also prints a grand total in `buildEnd`. Default 'off'. */
	readonly diagnostics?: DiagnosticsMode
}

/** Minimal Vite/Rollup transform-context surface this plugin needs (kept tiny so tests can mock it). */
export interface BindxTransformContext {
	addWatchFile(id: string): void
}

/** Transform output; `map` reuses Babel's source-map shape (assignable to Rollup's `SourceMapInput`). */
export interface BindxTransformResult {
	readonly code: string
	readonly map: BabelFileResult['map']
}

/** Structural Vite plugin shape; assignable to `import('vite').Plugin`. */
export interface BindxCompilerVitePlugin {
	readonly name: string
	readonly enforce: 'pre'
	transform(this: BindxTransformContext, code: string, id: string): Promise<BindxTransformResult | null>
	buildEnd(): void
}

const JSX_FILE = /\.[jt]sx$/

function matchesAny(id: string, patterns: readonly (string | RegExp)[]): boolean {
	return patterns.some(pattern => (typeof pattern === 'string' ? id.includes(pattern) : pattern.test(id)))
}

/** Cheap gate: only these markers can produce an emit — skip everything else without parsing. */
function mayCompile(code: string): boolean {
	return code.includes('createComponent') || code.includes('<Entity')
}

/**
 * Vite plugin that statically compiles bindx implicit selections. Place it before `react()`; the
 * `enforce: 'pre'` ordering is what guarantees it runs first regardless of array position.
 */
export function bindxCompiler(options: BindxCompilerViteOptions = {}): BindxCompilerVitePlugin {
	const { alias, entityLike, include, exclude, diagnostics = 'off' } = options
	// Per-instance accumulator (no module-level state) for the buildEnd grand total.
	const totals: { compiled: number; bailed: number } = { compiled: 0, bailed: 0 }
	const accumulate = (t: DiagnosticTotals): void => {
		totals.compiled += t.compiled
		totals.bailed += t.bailed
	}
	return {
		name: 'bindx-compiler',
		enforce: 'pre',
		async transform(code: string, id: string): Promise<BindxTransformResult | null> {
			const file = id.split('?', 1)[0] ?? id // drop Vite's `?query` suffix before extension checks
			if (id.includes('/node_modules/') || !JSX_FILE.test(file)) {
				return null
			}
			if (include && !matchesAny(file, include)) {
				return null
			}
			if (exclude && matchesAny(file, exclude)) {
				return null
			}
			if (!mayCompile(code)) {
				return null // no createComponent/<Entity → nothing to compile; return source untouched
			}
			const deps = new Set<string>()
			const result = await transformAsync(code, {
				filename: id,
				configFile: false,
				babelrc: false,
				sourceMaps: true,
				parserOpts: { plugins: ['typescript', 'jsx'] },
				plugins: [[bindxCompilerPlugin, { alias, entityLike, diagnostics, onReport: accumulate, onDependency: (dep: string) => deps.add(dep) }]],
			})
			if (!result?.code) {
				return null
			}
			// Register every cross-file read so a later edit to a contract/target module re-transforms this file.
			for (const dep of deps) {
				this.addWatchFile(dep)
			}
			return { code: result.code, map: result.map }
		},
		buildEnd(): void {
			if (diagnostics !== 'off') {
				reportTotals(totals)
			}
		},
	}
}
