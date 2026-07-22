/**
 * Hole-target-kind classification (Phase 3.1). Generalizes contract discovery: given a
 * hole-candidate component tag (local or relative import, same resolution + parse cache as
 * contracts), classify the target so the taint lattice can drop provably-inert props without
 * bailing. Collector-CONTRACT targets are handled separately by ContractResolver (checked
 * first in jsx.ts); this covers the remaining kinds.
 *
 * Default deny: any uncertainty → 'unknown' (the existing conservative hole rules stand).
 */
import * as t from '@babel/types'
import { walkAst } from './astWalk.js'
import {
	BindingResolver, type BindingResolverOptions, type ModuleView,
} from './moduleResolve.js'
import { unwrap } from './resolve.js'

/**
 * - `createComponent`: a `createComponent()....render()` chain. Its getSelection never reads
 *   scalar props and never invokes function slots (analyzeJsx ignores functions), so non-entity
 *   props and function props/children are droppable with NO bail. `slots` = the walked slot
 *   props (`.slots([...])`, default `['children']`); a slot passed a bare identifier still needs
 *   the lattice ('unknown' when `.slots()` is not a static string array → conservative).
 * - `plain`: a plain function/arrow component (no selection surface) → everything non-entity
 *   droppable; the hole is still emitted (validate-mode blind-spot warn depends on it).
 * - `collectorStatic`: `withCollector(runtime, staticRenderFn)` → the set of prop names the
 *   staticRender REFERENCES (or `'all'` when it spreads/aliases the props object). A dropped
 *   prop not in the set is safe; referenced ones keep the existing bails.
 * - `unknown`: unresolvable or unclassifiable → existing conservative rules.
 */
export type TargetKind =
	| { readonly kind: 'createComponent'; readonly slots: ReadonlySet<string> | 'unknown' }
	| { readonly kind: 'plain' }
	| { readonly kind: 'collectorStatic'; readonly referenced: ReadonlySet<string> | 'all' }
	| { readonly kind: 'unknown' }

export type TargetKindLookup = (tag: string) => TargetKind

const UNKNOWN: TargetKind = { kind: 'unknown' }

export class TargetKindResolver {
	private readonly binding: BindingResolver
	private readonly memo = new Map<string, TargetKind>()

	constructor(program: t.Program, options: BindingResolverOptions) {
		this.binding = new BindingResolver(program, options)
	}

	resolve(tag: string): TargetKind {
		const cached = this.memo.get(tag)
		if (cached !== undefined) {
			return cached
		}
		const resolved = this.binding.resolve(tag)
		const kind = resolved ? classifyInit(resolved.init, resolved.view) : UNKNOWN
		this.memo.set(tag, kind)
		return kind
	}
}

/** Classify a resolved binding node within its owning module view. */
function classifyInit(init: t.Node, view: ModuleView): TargetKind {
	// A plain `function X() {}` / `class X {}` component has no selection surface.
	if (t.isFunctionDeclaration(init) || t.isClassDeclaration(init)) {
		return { kind: 'plain' }
	}
	const expr = unwrap(init)
	if (!t.isExpression(expr)) {
		return UNKNOWN
	}

	const chain = createComponentChain(expr, view)
	if (chain) {
		return chain
	}

	// withCollector(runtime, staticRenderFn) → collectorStatic. A non-function 2nd arg is a
	// (possibly broken) contract; contracts are resolved before us, so anything reaching here
	// is unknown (keeps the conservative hole/bail rules — e.g. the unparseable-contract case).
	if (t.isCallExpression(expr) && t.isIdentifier(expr.callee) && view.withCollector.has(expr.callee.name)) {
		const staticArg = expr.arguments[1]
		if (staticArg && (t.isArrowFunctionExpression(staticArg) || t.isFunctionExpression(staticArg))) {
			return { kind: 'collectorStatic', referenced: collectReferencedProps(staticArg) }
		}
		return UNKNOWN
	}

	// A plain function/arrow component (not wrapped) has no selection surface.
	if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) {
		return { kind: 'plain' }
	}

	return UNKNOWN
}

/** A `createComponent()....render()` fluent chain: extract slot names (or 'unknown'). */
function createComponentChain(expr: t.Expression, view: ModuleView): TargetKind | null {
	if (!isRenderChainTail(expr)) {
		return null
	}
	let slots: ReadonlySet<string> | 'unknown' = new Set(['children'])
	let node: t.Node = expr
	while (t.isCallExpression(node) && t.isMemberExpression(node.callee) && !node.callee.computed && t.isIdentifier(node.callee.property)) {
		if (node.callee.property.name === 'slots') {
			slots = slotNames(node.arguments[0])
		}
		node = node.callee.object
	}
	// Chain must bottom out at a `createComponent(...)` call whose callee is a bindx binding.
	if (t.isCallExpression(node) && t.isIdentifier(node.callee) && view.createComponent.has(node.callee.name)) {
		return { kind: 'createComponent', slots }
	}
	return null
}

/** True when `expr` is a `....render(...)` call (the chain tail this compiler recognizes). */
function isRenderChainTail(expr: t.Expression): boolean {
	return t.isCallExpression(expr) && t.isMemberExpression(expr.callee) && !expr.callee.computed
		&& t.isIdentifier(expr.callee.property) && expr.callee.property.name === 'render'
}

/** Slot names from a `.slots([...])` argument; 'unknown' when not a static string-literal array. */
function slotNames(arg: t.Node | undefined): ReadonlySet<string> | 'unknown' {
	if (!arg || !t.isArrayExpression(arg)) {
		return 'unknown'
	}
	const names = new Set<string>()
	for (const el of arg.elements) {
		if (!el || !t.isStringLiteral(el)) {
			return 'unknown'
		}
		names.add(el.value)
	}
	return names
}

/**
 * The set of prop names a `staticRender` references, or `'all'` (conservative sentinel). An
 * object-pattern param's destructured keys are the referenced props (rest → all). An identifier
 * param `p` is referenced as `p.x` (record `x`); any other use — `p[x]`, spread `{...p}`, passing
 * `p` onward, aliasing — cannot be followed → 'all'. Shadowing is ignored (over-counts → sound).
 */
export function collectReferencedProps(fn: t.ArrowFunctionExpression | t.FunctionExpression): ReadonlySet<string> | 'all' {
	const param = fn.params[0]
	if (!param) {
		return new Set() // no props param → references nothing → all props safe to drop
	}
	const p = t.isAssignmentPattern(param) ? param.left : param

	if (t.isObjectPattern(p)) {
		const names = new Set<string>()
		for (const prop of p.properties) {
			if (t.isRestElement(prop) || !t.isObjectProperty(prop) || prop.computed) {
				return 'all'
			}
			const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null
			if (key === null) {
				return 'all'
			}
			names.add(key)
		}
		return names
	}

	if (t.isIdentifier(p)) {
		return referencedMembersOf(fn.body, p.name)
	}
	return 'all' // array pattern / other → cannot map to prop names
}

/** Walk `root` collecting `<paramName>.x` member accesses; any other use of `paramName` → 'all'. */
function referencedMembersOf(root: t.Node, paramName: string): ReadonlySet<string> | 'all' {
	const names = new Set<string>()
	let escaped = false

	walkAst(root, node => {
		if ((t.isMemberExpression(node) || t.isOptionalMemberExpression(node))
			&& t.isIdentifier(node.object) && node.object.name === paramName) {
			if (!node.computed && t.isIdentifier(node.property)) {
				names.add(node.property.name) // `p.x` — a clean referenced prop
				return 'skip' // handled `p.x` wholesale; don't descend into the `p` object identifier
			}
			escaped = true // `p[x]` — cannot know which prop
			return 'stop'
		}
		if (t.isIdentifier(node) && node.name === paramName) {
			escaped = true // a bare reference to props not used as a clean `.x` access
			return 'stop'
		}
	})

	return escaped ? 'all' : names
}
