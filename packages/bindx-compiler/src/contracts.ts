/**
 * Collector-contract discovery (Phase 2.2). A `withCollector(_, contract)` component
 * declares how its callback props are invoked; the analyzer treats such a callback
 * exactly like a `<HasMany>`/`<HasOne>` child (param → root, host captures → paths),
 * so no hole and no lift is needed.
 *
 * This is a bounded exception to the purely-local principle: to read a contract declared
 * in another module we resolve RELATIVE specifiers only (plus an optional `alias` map),
 * PARSE the target (no execution, no type checker), and cache per path+mtime.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import * as t from '@babel/types'
import { parseProgram } from './parse.js'
import { unwrap } from './resolve.js'

export interface CallbackContract {
	readonly kind: 'itemOf' | 'entityOf'
	readonly field: string
}

/** Key = callback prop name (`children` included) → the relation it is invoked over. */
export type CollectorContract = Record<string, CallbackContract>

/** Resolves a component tag to its declared contract, or null (→ existing hole/bail rules). */
export type ContractLookup = (tag: string) => CollectorContract | null

/** Local names of the bindx symbols a module needs for contract extraction. */
interface ModuleView {
	readonly program: t.Program
	readonly withCollector: ReadonlySet<string>
	readonly itemOf: ReadonlySet<string>
	readonly entityOf: ReadonlySet<string>
}

function isBindxSource(source: string): boolean {
	return source === '@contember/bindx' || source.startsWith('@contember/bindx-') || source.startsWith('@contember/bindx/')
}

/** Collect local binding names for `withCollector`/`itemOf`/`entityOf` imported from bindx. */
function makeModuleView(program: t.Program): ModuleView {
	const withCollector = new Set<string>()
	const itemOf = new Set<string>()
	const entityOf = new Set<string>()
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
			}
		}
	}
	return { program, withCollector, itemOf, entityOf }
}

/** mtime-keyed cache of parsed sibling modules — shared across analyzeProgram / plugin runs. */
export class ContractFileCache {
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
			return null // unreadable/unparseable → no contract, existing rules apply
		}
		this.cache.set(path, { mtime, view })
		return view
	}
}

export interface ContractResolverOptions {
	readonly filename?: string
	readonly alias: Record<string, string>
	readonly cache: ContractFileCache
}

export class ContractResolver {
	private readonly self: ModuleView
	private readonly memo = new Map<string, CollectorContract | null>()

	constructor(program: t.Program, private readonly options: ContractResolverOptions) {
		this.self = makeModuleView(program)
	}

	resolve(tag: string): CollectorContract | null {
		const cached = this.memo.get(tag)
		if (cached !== undefined) {
			return cached
		}
		const contract = this.compute(tag)
		this.memo.set(tag, contract)
		return contract
	}

	private compute(tag: string): CollectorContract | null {
		// 1. Local `const tag = withCollector(_, contract)` in this module.
		const localInit = findTopLevelVarInit(this.self.program, tag)
		if (localInit) {
			return this.contractFromInit(localInit, this.self)
		}
		// 2. Imported binding — relative specifier (or alias-mapped) only.
		const imp = findImport(this.self.program, tag)
		if (!imp) {
			return null
		}
		const path = this.resolveModulePath(imp.source)
		if (!path) {
			return null
		}
		const view = this.options.cache.get(path)
		if (!view) {
			return null
		}
		const init = resolveExportedInit(view.program, imp.importedName)
		return init ? this.contractFromInit(init, view) : null
	}

	/** Contract from a binding initializer, iff it is `withCollector(_, <contract>)` in `view`. */
	private contractFromInit(init: t.Expression, view: ModuleView): CollectorContract | null {
		const call = unwrap(init)
		if (!t.isCallExpression(call) || !t.isIdentifier(call.callee) || !view.withCollector.has(call.callee.name)) {
			return null
		}
		const arg = call.arguments[1]
		return arg && t.isExpression(arg) ? contractFromExpr(arg, view) : null
	}

	/** Resolve an import specifier to an existing absolute file (relative or alias-mapped only). */
	private resolveModulePath(source: string): string | null {
		const base = this.toAbsoluteBase(source)
		return base ? firstExisting(base) : null
	}

	/** Absolute base path (no extension resolution) for a relative or alias-mapped specifier. */
	private toAbsoluteBase(source: string): string | null {
		if (source.startsWith('.')) {
			return this.options.filename ? resolvePath(dirname(this.options.filename), source) : null
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

/** Follow an identifier / object literal to a validated contract, or null. */
function contractFromExpr(exprIn: t.Expression, view: ModuleView): CollectorContract | null {
	const expr = unwrap(exprIn)
	if (t.isIdentifier(expr)) {
		const init = findTopLevelVarInit(view.program, expr.name)
		return init ? contractFromExpr(init, view) : null
	}
	if (t.isObjectExpression(expr)) {
		return contractFromObject(expr, view)
	}
	return null
}

function contractFromObject(obj: t.ObjectExpression, view: ModuleView): CollectorContract | null {
	const contract: CollectorContract = {}
	for (const prop of obj.properties) {
		if (!t.isObjectProperty(prop) || prop.computed) {
			return null // spread / method / computed key → not a static contract
		}
		const key = propKeyName(prop.key)
		if (key === null || !t.isExpression(prop.value)) {
			return null
		}
		const entry = callbackContract(prop.value, view)
		if (!entry) {
			return null
		}
		contract[key] = entry
	}
	return contract
}

/** `itemOf('field')` / `entityOf('field')` (combinators imported from bindx, string-literal arg). */
function callbackContract(valueIn: t.Expression, view: ModuleView): CallbackContract | null {
	const value = unwrap(valueIn)
	if (!t.isCallExpression(value) || !t.isIdentifier(value.callee)) {
		return null
	}
	const kind = view.itemOf.has(value.callee.name) ? 'itemOf' : view.entityOf.has(value.callee.name) ? 'entityOf' : null
	if (!kind || value.arguments.length !== 1) {
		return null
	}
	const arg = value.arguments[0]
	return arg && t.isStringLiteral(arg) ? { kind, field: arg.value } : null
}

function propKeyName(key: t.Node): string | null {
	if (t.isIdentifier(key)) {
		return key.name
	}
	return t.isStringLiteral(key) ? key.value : null
}

interface ImportRef {
	readonly source: string
	readonly importedName: string
}

/** Find where `local` is imported from and under which imported name (`default` for default). */
function findImport(program: t.Program, local: string): ImportRef | null {
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

/** Initializer of a module-level `const name = <init>` (unwrapped), searching plain + `export` decls. */
function findTopLevelVarInit(program: t.Program, name: string): t.Expression | null {
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

/** Initializer exported under `importedName`: `export const X`, `export { local as X }`, `export default`. */
function resolveExportedInit(program: t.Program, importedName: string): t.Expression | null {
	if (importedName === 'default') {
		for (const node of program.body) {
			if (t.isExportDefaultDeclaration(node) && t.isExpression(node.declaration)) {
				const inner = unwrap(node.declaration)
				return t.isExpression(inner) ? inner : null
			}
		}
		return null
	}
	for (const node of program.body) {
		if (!t.isExportNamedDeclaration(node)) {
			continue
		}
		if (node.declaration && t.isVariableDeclaration(node.declaration)) {
			const init = varInit(node.declaration, importedName)
			if (init) {
				return init
			}
		}
		if (!node.source) {
			// `export { local as X }` — follow to the local declaration (re-exports with a source are unfollowable).
			for (const spec of node.specifiers) {
				if (t.isExportSpecifier(spec)) {
					const exported = t.isIdentifier(spec.exported) ? spec.exported.name : spec.exported.value
					if (exported === importedName) {
						return findTopLevelVarInit(program, spec.local.name)
					}
				}
			}
		}
	}
	return null
}
