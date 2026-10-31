/**
 * Shared binding resolution — the bounded exception to the purely-local principle used by
 * both collector-contract discovery (contracts.ts) and hole-target-kind classification
 * (targetKind.ts). Given a component tag it locates the binding's initializer expression and
 * the module view it lives in, following LOCAL top-level declarations and RELATIVE imports
 * (plus an optional `alias` map). Re-export chains through a `from` source — `export { X } from`,
 * `export { X as Y } from`, `export * from` (barrel index files) — are followed too, depth-limited
 * and cycle-guarded. Parse-only, no execution, no type checker; cached per path+mtime so sibling
 * modules are read at most once per run.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import * as t from '@babel/types'
import { parseProgram } from './parse.js'
import { unwrap } from './resolve.js'

/** Local binding names for the bindx symbols a module needs for contract/target extraction. */
export interface ModuleView {
	readonly program: t.Program
	readonly withCollector: ReadonlySet<string>
	readonly itemOf: ReadonlySet<string>
	readonly entityOf: ReadonlySet<string>
	readonly createComponent: ReadonlySet<string>
}

function isBindxSource(source: string): boolean {
	return source === '@contember/bindx' || source.startsWith('@contember/bindx-') || source.startsWith('@contember/bindx/')
}

/** Collect local binding names for the bindx symbols imported into `program`. */
export function makeModuleView(program: t.Program): ModuleView {
	const withCollector = new Set<string>()
	const itemOf = new Set<string>()
	const entityOf = new Set<string>()
	const createComponent = new Set<string>()
	for (const node of program.body) {
		if (!t.isImportDeclaration(node) || !isBindxSource(node.source.value)) {
			continue
		}
		for (const spec of node.specifiers) {
			if (!t.isImportSpecifier(spec)) {
				continue
			}
			const imported = t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value
			if (imported === 'withCollector') {
				withCollector.add(spec.local.name)
			} else if (imported === 'itemOf') {
				itemOf.add(spec.local.name)
			} else if (imported === 'entityOf') {
				entityOf.add(spec.local.name)
			} else if (imported === 'createComponent') {
				createComponent.add(spec.local.name)
			}
		}
	}
	return { program, withCollector, itemOf, entityOf, createComponent }
}

/** mtime-keyed cache of parsed sibling modules — shared across analyzeProgram / plugin runs. */
export class ModuleCache {
	private readonly cache = new Map<string, { mtime: number; view: ModuleView }>()

	get(path: string): ModuleView | null {
		let mtime: number
		try {
			mtime = statSync(path).mtimeMs
		} catch {
			return null
		}
		const cached = this.cache.get(path)
		if (cached && cached.mtime === mtime) {
			return cached.view
		}
		let view: ModuleView
		try {
			view = makeModuleView(parseProgram(readFileSync(path, 'utf8'), path))
		} catch {
			return null // unreadable/unparseable → no resolution, caller's fallback rules apply
		}
		this.cache.set(path, { mtime, view })
		return view
	}
}

export interface BindingResolverOptions {
	readonly filename?: string
	readonly alias: Record<string, string>
	readonly cache: ModuleCache
	/**
	 * Called with the absolute path of every sibling module consulted during resolution — including
	 * re-export hops and files that fail to parse. Lets a bundler register cross-file watch
	 * dependencies so editing a contract/target module re-transforms the files that depend on it.
	 */
	readonly onDependency?: (absPath: string) => void
}

/**
 * A resolved binding: its declaration node and the module view it lives in. `init` is the
 * (unwrapped) `const` initializer expression, or a `function`/`class` declaration node — callers
 * narrow (a plain function component vs a `withCollector(...)`/chain call expression).
 */
export interface ResolvedBinding {
	readonly init: t.Node
	readonly view: ModuleView
}

/**
 * Resolves a component tag to its initializer expression + owning module view, memoized per tag.
 * Local top-level `const/function` first, then a relative (or alias-mapped) import's export.
 */
export class BindingResolver {
	/** Max re-export follows after the entry import — guards runaway/pathological barrel graphs. */
	private static readonly MAX_HOPS = 5
	private readonly self: ModuleView
	private readonly memo = new Map<string, ResolvedBinding | null>()

	constructor(program: t.Program, private readonly options: BindingResolverOptions) {
		this.self = makeModuleView(program)
	}

	resolve(tag: string): ResolvedBinding | null {
		const cached = this.memo.get(tag)
		if (cached !== undefined) {
			return cached
		}
		const resolved = this.compute(tag)
		this.memo.set(tag, resolved)
		return resolved
	}

	private compute(tag: string): ResolvedBinding | null {
		const local = findTopLevelBinding(this.self.program, tag)
		if (local) {
			return { init: local, view: this.self }
		}
		const imp = findImport(this.self.program, tag)
		if (!imp) {
			return null
		}
		const path = this.resolveModulePath(imp.source, this.options.filename)
		if (!path) {
			return null
		}
		this.options.onDependency?.(path) // cross-file read → a watch dependency of the entry file
		const view = this.options.cache.get(path)
		if (!view) {
			return null
		}
		return this.chaseExport(view, path, imp.importedName, new Set([path]), BindingResolver.MAX_HOPS)
	}

	/**
	 * Resolve `importedName` within `view` (living at `fromFile`), following `from`-source re-exports.
	 * `visited` (module paths) breaks cycles and, for `export *`, dedupes diamond re-exports so a single
	 * leaf reached twice is not mistaken for an ambiguity. Returns null on depth/cycle limit → the
	 * caller's conservative fallback stands.
	 */
	private chaseExport(view: ModuleView, fromFile: string, importedName: string, visited: Set<string>, depth: number): ResolvedBinding | null {
		const lookup = lookupExport(view.program, importedName)
		if (!lookup) {
			return null
		}
		if (lookup.kind === 'local') {
			return { init: lookup.node, view }
		}
		if (depth <= 0) {
			return null // depth limit → unfollowable
		}
		if (lookup.kind === 'reexport') {
			return this.followSource(lookup.source, fromFile, lookup.importedName, visited, depth)
		}
		// `export *`: search each target; first match wins, a second distinct match → ambiguous → unfollowable.
		let found: ResolvedBinding | null = null
		for (const source of lookup.sources) {
			const hit = this.followSource(source, fromFile, importedName, visited, depth)
			if (hit) {
				if (found) {
					return null
				}
				found = hit
			}
		}
		return found
	}

	/** Load the module `source` resolves to (relative to `fromFile`) and continue the chase there. */
	private followSource(source: string, fromFile: string | undefined, importedName: string, visited: Set<string>, depth: number): ResolvedBinding | null {
		const path = this.resolveModulePath(source, fromFile)
		if (!path) {
			return null // unresolvable specifier → stop
		}
		this.options.onDependency?.(path) // consulted during the re-export chase → a watch dependency
		if (visited.has(path)) {
			return null // a cycle → stop
		}
		const view = this.options.cache.get(path)
		if (!view) {
			return null
		}
		visited.add(path)
		return this.chaseExport(view, path, importedName, visited, depth - 1)
	}

	/** Resolve an import/re-export specifier to an existing absolute file (relative or alias-mapped only). */
	private resolveModulePath(source: string, fromFile: string | undefined): string | null {
		const base = this.toAbsoluteBase(source, fromFile)
		return base ? firstExisting(base) : null
	}

	private toAbsoluteBase(source: string, fromFile: string | undefined): string | null {
		if (source.startsWith('.')) {
			return fromFile ? resolvePath(dirname(fromFile), source) : null
		}
		for (const [prefix, target] of Object.entries(this.options.alias)) {
			if (source === prefix || source.startsWith(`${prefix}/`)) {
				return resolvePath(target + source.slice(prefix.length))
			}
		}
		return null // non-relative, unaliased → bounded exception does not apply
	}
}

/** First existing file for an absolute base: `x.tsx/.ts/.jsx/.js` or `x/index.*`; `.js`→TS source. */
function firstExisting(abs: string): string | null {
	const base = abs.endsWith('.js') ? abs.slice(0, -3) : abs
	const exts = abs.endsWith('.js') ? ['.tsx', '.ts', '.jsx'] : ['.tsx', '.ts', '.jsx', '.js']
	const candidates = [...exts.map(ext => base + ext), ...['tsx', 'ts', 'jsx', 'js'].map(ext => `${base}/index.${ext}`)]
	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate
		}
	}
	return null
}

export interface ImportRef {
	readonly source: string
	readonly importedName: string
}

/** Find where `local` is imported from and under which imported name (`default` for default). */
export function findImport(program: t.Program, local: string): ImportRef | null {
	for (const node of program.body) {
		if (!t.isImportDeclaration(node)) {
			continue
		}
		for (const spec of node.specifiers) {
			if (t.isImportSpecifier(spec) && spec.local.name === local) {
				const imported = t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value
				return { source: node.source.value, importedName: imported }
			}
			if (t.isImportDefaultSpecifier(spec) && spec.local.name === local) {
				return { source: node.source.value, importedName: 'default' }
			}
		}
	}
	return null
}

/**
 * A module-level binding for `name`: the unwrapped `const` initializer, or a `function`/`class`
 * declaration node (searching plain + `export` decls). Used by binding resolution to reach plain
 * function components as well as `const X = withCollector(...)` / chain expressions.
 */
export function findTopLevelBinding(program: t.Program, name: string): t.Node | null {
	for (const node of program.body) {
		const decl = t.isExportNamedDeclaration(node) ? node.declaration : node
		if (decl && t.isVariableDeclaration(decl)) {
			const init = varInit(decl, name)
			if (init) {
				return init
			}
		}
		if (decl && (t.isFunctionDeclaration(decl) || t.isClassDeclaration(decl)) && decl.id?.name === name) {
			return decl
		}
	}
	return null
}

/**
 * How `program` provides `importedName`, for the binding-resolution chase:
 * - `local`  — a declaration in this module (the resolved node).
 * - `reexport` — `export { orig as importedName } from source`, or a passthrough of an import
 *   (`import { orig } from source; export { orig }`); follow `orig` in `source`.
 * - `star` — the `export * from` sources to search (used only when no explicit export matches).
 */
export type ExportLookup =
	| { readonly kind: 'local'; readonly node: t.Node }
	| { readonly kind: 'reexport'; readonly source: string; readonly importedName: string }
	| { readonly kind: 'star'; readonly sources: readonly string[] }

/** Classify how `importedName` is exported from `program`; null when it is not exported here at all. */
export function lookupExport(program: t.Program, importedName: string): ExportLookup | null {
	if (importedName === 'default') {
		for (const node of program.body) {
			if (t.isExportDefaultDeclaration(node)) {
				const d = node.declaration
				if (t.isFunctionDeclaration(d) || t.isClassDeclaration(d)) {
					return { kind: 'local', node: d }
				}
				if (t.isExpression(d)) {
					return { kind: 'local', node: unwrap(d) }
				}
			}
		}
		return null
	}
	const starSources: string[] = []
	for (const node of program.body) {
		// `export * from` — a namespace re-export (`export * as ns from`) parses as a named export
		// with an ExportNamespaceSpecifier, so a bare ExportAllDeclaration is always the star form.
		if (t.isExportAllDeclaration(node)) {
			starSources.push(node.source.value)
			continue
		}
		if (!t.isExportNamedDeclaration(node)) {
			continue
		}
		if (node.declaration) {
			const local = localFromDeclaration(node.declaration, importedName)
			if (local) {
				return { kind: 'local', node: local }
			}
			continue
		}
		const reexport = namedReexport(program, node, importedName)
		if (reexport) {
			return reexport
		}
	}
	// Explicit exports take precedence over star re-exports (ES semantics); star is the fallback.
	return starSources.length > 0 ? { kind: 'star', sources: starSources } : null
}

/** A `export const/function/class name` declaration node, or null. */
function localFromDeclaration(declaration: t.Declaration, name: string): t.Node | null {
	if (t.isVariableDeclaration(declaration)) {
		return varInit(declaration, name)
	}
	if ((t.isFunctionDeclaration(declaration) || t.isClassDeclaration(declaration)) && declaration.id?.name === name) {
		return declaration
	}
	return null
}

/** Resolve `export { ... }` specifiers (with or without a `from` source) for `importedName`. */
function namedReexport(program: t.Program, node: t.ExportNamedDeclaration, importedName: string): ExportLookup | null {
	for (const spec of node.specifiers) {
		if (!t.isExportSpecifier(spec)) {
			continue
		}
		const exported = t.isIdentifier(spec.exported) ? spec.exported.name : spec.exported.value
		if (exported !== importedName) {
			continue
		}
		const orig = spec.local.name
		if (node.source) {
			return { kind: 'reexport', source: node.source.value, importedName: orig }
		}
		// No source: a local declaration, or a passthrough of an import (`import { orig }; export { orig }`).
		const local = findTopLevelBinding(program, orig)
		if (local) {
			return { kind: 'local', node: local }
		}
		const imp = findImport(program, orig)
		return imp ? { kind: 'reexport', source: imp.source, importedName: imp.importedName } : null
	}
	return null
}

/** Initializer of a module-level `const name = <init>` (unwrapped), searching plain + `export` decls. */
export function findTopLevelVarInit(program: t.Program, name: string): t.Expression | null {
	for (const node of program.body) {
		const decl = t.isExportNamedDeclaration(node) ? node.declaration : node
		if (decl && t.isVariableDeclaration(decl)) {
			const init = varInit(decl, name)
			if (init) {
				return init
			}
		}
	}
	return null
}

function varInit(decl: t.VariableDeclaration, name: string): t.Expression | null {
	for (const d of decl.declarations) {
		if (t.isIdentifier(d.id) && d.id.name === name && d.init) {
			const inner = unwrap(d.init)
			return t.isExpression(inner) ? inner : null
		}
	}
	return null
}
