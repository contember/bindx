/**
 * Root tracking, member-chain resolution and consumption. A "root" is a binding
 * that points at an entity level in the selection tree (an entity prop, a relation
 * callback param, or a const alias). Resolution mirrors the collector proxy's
 * skip-list (see packages/bindx-react/src/jsx/proxyShared.ts + collectorProxy.ts).
 */
import * as t from '@babel/types'
import { SelNode } from './selectionTree.js'
import type { Bailout, StaticHasManyParams } from './types.js'

export class BailError extends Error {
	constructor(public readonly bailout: Bailout) {
		super(bailout.message)
	}
}

/**
 * A binding that resolves to `node` reached via `path` of not-yet-materialized segments.
 * `source`/`absPath` track the origin entity prop and the absolute path from it — needed to
 * build phase-2 holes (they survive relation-callback roots, where `node`/`path` reset).
 */
export interface RootRef {
	readonly node: SelNode
	readonly path: readonly string[]
	readonly source: string
	readonly absPath: readonly string[]
}

export interface Scope {
	readonly roots: Map<string, RootRef>
	readonly propsParams: Set<string>
	/** entity prop name → its root SelNode (shared across render + condition fns). */
	readonly propRoots: ReadonlyMap<string, SelNode>
	/**
	 * Non-entity param bindings (top render props / callback indices). At oracle
	 * collection these are inert scalar mocks, so an identifier resolving here is
	 * SAFE to drop from a hole (invoking it cannot reach a selection scope).
	 */
	readonly scalarParams: Set<string>
	/**
	 * Render-scope local bindings (const/let in the body, generic nested-fn params).
	 * An identifier resolving here is render-local — NOT liftable (no module-scope
	 * emit site) and NOT a proven-inert mock — so a hole prop referencing it bails.
	 */
	readonly locals: Set<string>
}

export function childScope(scope: Scope): Scope {
	return {
		roots: new Map(scope.roots),
		propsParams: new Set(scope.propsParams),
		propRoots: scope.propRoots,
		scalarParams: new Set(scope.scalarParams),
		locals: new Set(scope.locals),
	}
}

/** Names bound by a function-parameter pattern (public wrapper over collectParamNames). */
export function paramNamesOf(param: t.Node): Set<string> {
	const out = new Set<string>()
	collectParamNames(param, out)
	return out
}

export type Resolution =
	| { kind: 'ref'; ref: RootRef }
	| { kind: 'opaque' }
	| { kind: 'none' }

/** Strip parentheses and TS type wrappers (`x as T`, `x!`, `x satisfies T`). */
export function unwrap(node: t.Node): t.Node {
	if (t.isParenthesizedExpression(node) || t.isTSNonNullExpression(node) || t.isTSAsExpression(node) || t.isTSSatisfiesExpression(node)) {
		return unwrap(node.expression)
	}
	return node
}

/**
 * Classify an expression relative to the current roots. `opaque` = resolves to a
 * meta/non-entity value (e.g. `entity.$data`, `entity.id`). Throws BailError on
 * computed access off a root.
 */
export function resolve(nodeIn: t.Node, scope: Scope): Resolution {
	const node = unwrap(nodeIn)

	if (t.isIdentifier(node)) {
		const ref = scope.roots.get(node.name)
		return ref ? { kind: 'ref', ref } : { kind: 'none' }
	}

	if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) {
		if (node.computed) {
			// `entity[x]` off a root cannot be statically classified.
			if (referencesRoot(node.object, scope)) {
				throw new BailError({ code: 'COMPUTED_MEMBER', message: 'computed member access on an entity value' })
			}
			return { kind: 'none' }
		}
		if (!t.isIdentifier(node.property)) {
			return { kind: 'none' }
		}
		const propName = node.property.name

		// props identifier param: `props.article`
		if (t.isIdentifier(node.object) && scope.propsParams.has(node.object.name)) {
			const propRoot = scope.propRoots.get(propName)
			return propRoot ? { kind: 'ref', ref: { node: propRoot, path: [], source: propName, absPath: [] } } : { kind: 'none' }
		}

		const objRes = resolve(node.object, scope)
		if (objRes.kind !== 'ref') {
			return objRes.kind === 'opaque' ? { kind: 'opaque' } : { kind: 'none' }
		}
		// `$fields`/`$entity` are transparent passthroughs to the same entity.
		if (propName === '$fields' || propName === '$entity') {
			return objRes
		}
		// `id`, `$*`, `__*` are accessor/meta props — never recorded as fields.
		if (propName === 'id' || propName.startsWith('$') || propName.startsWith('__')) {
			return { kind: 'opaque' }
		}
		return {
			kind: 'ref',
			ref: {
				node: objRes.ref.node,
				path: [...objRes.ref.path, propName],
				source: objRes.ref.source,
				absPath: [...objRes.ref.absPath, propName],
			},
		}
	}

	return { kind: 'none' }
}

/** Record a member chain terminal as a scalar leaf (intermediate segments → relations). */
export function consumeLeaf(ref: RootRef): void {
	if (ref.path.length === 0) {
		return
	}
	let node = ref.node
	for (let i = 0; i < ref.path.length - 1; i++) {
		node = node.child(ref.path[i]!)
	}
	node.addScalar(ref.path[ref.path.length - 1]!)
}

/** Materialize a chain fully as relations; returns the entity node it points at. */
export function consumeRelation(ref: RootRef): SelNode {
	let node = ref.node
	for (const seg of ref.path) {
		node = node.child(seg)
	}
	return node
}

/** Materialize a has-many relation; marks the field array + params, returns the item node. */
export function consumeMany(ref: RootRef, params?: StaticHasManyParams): SelNode {
	if (ref.path.length === 0) {
		return ref.node
	}
	let parent = ref.node
	for (let i = 0; i < ref.path.length - 1; i++) {
		parent = parent.child(ref.path[i]!)
	}
	const field = ref.path[ref.path.length - 1]!
	const item = parent.child(field)
	parent.markMany(field)
	if (params && Object.keys(params).length > 0) {
		parent.setParams(field, params)
	}
	return item
}

/** True if any identifier in the subtree satisfies `pred`. Over-approximates (visits member
 *  property names / object keys too) — sound for default-deny bail decisions. */
function anyIdentifier(node: t.Node, pred: (name: string) => boolean): boolean {
	let found = false
	const visit = (n: t.Node): void => {
		if (found) {
			return
		}
		if (t.isIdentifier(n) && pred(n.name)) {
			found = true
			return
		}
		for (const key of t.VISITOR_KEYS[n.type] ?? []) {
			const child: unknown = (n as unknown as Record<string, unknown>)[key]
			if (Array.isArray(child)) {
				for (const item of child) {
					if (item && typeof item === 'object' && typeof (item as { type?: unknown }).type === 'string') {
						visit(item as t.Node)
					}
				}
			} else if (child && typeof child === 'object' && typeof (child as { type?: unknown }).type === 'string') {
				visit(child as t.Node)
			}
		}
	}
	visit(node)
	return found
}

/** Conservative check: does the subtree textually reference any root binding? */
export function referencesRoot(node: t.Node, scope: Scope): boolean {
	return anyIdentifier(node, name => scope.roots.has(name) || scope.propsParams.has(name))
}

/** Names bound by a function-parameter pattern (identifier / default / rest / object / array). */
function collectParamNames(node: t.Node, out: Set<string>): void {
	if (t.isIdentifier(node)) {
		out.add(node.name)
		return
	}
	if (t.isAssignmentPattern(node)) {
		collectParamNames(node.left, out)
		return
	}
	if (t.isRestElement(node)) {
		collectParamNames(node.argument, out)
		return
	}
	if (t.isObjectPattern(node)) {
		for (const prop of node.properties) {
			collectParamNames(t.isRestElement(prop) ? prop.argument : prop.value, out)
		}
		return
	}
	if (t.isArrayPattern(node)) {
		for (const el of node.elements) {
			if (el) {
				collectParamNames(el, out)
			}
		}
	}
}

/**
 * How to treat an inline closure (function prop / render-prop child) of a phase-2 hole.
 * The hole target's `staticRender` may INVOKE it with a collector proxy during collection.
 *
 * - `drop`: invoking it cannot reach a selection scope — no reference to its OWN parameters
 *   (a proxy would flow in there) and no captured entity roots. Safe to omit (`() => save()`).
 * - `lift`: it uses its own params (so dropping would under-fetch) but captures NOTHING from
 *   render scope — only its params, module-scope bindings, and globals. Emitted verbatim into
 *   `extraProps`; replayed into the target so collection proceeds (`it => <Field field={it.name}/>`).
 * - `bail`: captures an entity root, or captures a render-scope binding (`.use()` value, local)
 *   that cannot be reproduced at the module-scope emit site. Default deny.
 *
 * Nested inner functions' own params are theirs, not ours (see docs/compiler-plan.md, Phase 2/2.1).
 */
export type HoleClosureClass = 'drop' | 'lift' | 'bail'

export function classifyHoleClosure(fn: t.ArrowFunctionExpression | t.FunctionExpression, scope: Scope): HoleClosureClass {
	if (referencesRoot(fn, scope)) {
		return 'bail' // captured entity root reachable when invoked
	}
	const ownParams = new Set<string>()
	for (const param of fn.params) {
		collectParamNames(param, ownParams)
	}
	if (!anyIdentifier(fn.body, name => ownParams.has(name))) {
		return 'drop' // no proxy gateway — invoking it collects nothing
	}
	// Uses own params → must be preserved; liftable only if it captures no render binding
	// (roots already excluded above). Over-approximates via property names → default deny.
	const capturesRender = anyIdentifier(fn, name =>
		!ownParams.has(name) && (scope.scalarParams.has(name) || scope.locals.has(name) || scope.propsParams.has(name)),
	)
	return capturesRender ? 'bail' : 'lift'
}

/**
 * Classify a JSX prop value against the roots for phase-2 hole building:
 * `path` = a clean entity-rooted identifier/member chain (empty path = the root itself);
 * `expr` = references a root but is not a plain path (e.g. `fn(article)`); `none` = no root.
 * Throws COMPUTED_MEMBER on `article[x]`. Member segments are recorded literally so the
 * runtime's property-get replay reproduces the exact value (id/meta segments included).
 */
export type EntityPath =
	| { kind: 'path'; source: string; path: readonly string[] }
	| { kind: 'expr' }
	| { kind: 'none' }

export function entityPathOf(nodeIn: t.Node, scope: Scope): EntityPath {
	const node = unwrap(nodeIn)

	if (t.isIdentifier(node)) {
		const ref = scope.roots.get(node.name)
		if (ref) {
			return { kind: 'path', source: ref.source, path: [...ref.absPath] }
		}
		return scope.propsParams.has(node.name) ? { kind: 'expr' } : { kind: 'none' }
	}

	if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) {
		if (node.computed) {
			if (referencesRoot(node.object, scope)) {
				throw new BailError({ code: 'COMPUTED_MEMBER', message: 'computed member access on an entity value' })
			}
			return { kind: 'none' }
		}
		if (!t.isIdentifier(node.property)) {
			return { kind: 'none' }
		}
		const propName = node.property.name
		if (t.isIdentifier(node.object) && scope.propsParams.has(node.object.name)) {
			return scope.propRoots.has(propName) ? { kind: 'path', source: propName, path: [] } : { kind: 'none' }
		}
		const objPath = entityPathOf(node.object, scope)
		if (objPath.kind !== 'path') {
			return objPath
		}
		return { kind: 'path', source: objPath.source, path: [...objPath.path, propName] }
	}

	return { kind: 'none' }
}

export type LiteralResult = { ok: true; value: unknown } | { ok: false }

/** Evaluate an expression to a static literal value, or fail. Used for HasMany params. */
export function evaluateLiteral(node: t.Node): LiteralResult {
	if (t.isStringLiteral(node) || t.isNumericLiteral(node) || t.isBooleanLiteral(node)) {
		return { ok: true, value: node.value }
	}
	if (t.isNullLiteral(node)) {
		return { ok: true, value: null }
	}
	if (t.isUnaryExpression(node) && node.operator === '-' && t.isNumericLiteral(node.argument)) {
		return { ok: true, value: -node.argument.value }
	}
	if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
		return { ok: true, value: node.quasis.map(q => q.value.cooked ?? '').join('') }
	}
	if (t.isArrayExpression(node)) {
		const out: unknown[] = []
		for (const el of node.elements) {
			if (el === null || t.isSpreadElement(el)) {
				return { ok: false }
			}
			const r = evaluateLiteral(el)
			if (!r.ok) {
				return { ok: false }
			}
			out.push(r.value)
		}
		return { ok: true, value: out }
	}
	if (t.isObjectExpression(node)) {
		const out: Record<string, unknown> = {}
		for (const prop of node.properties) {
			if (!t.isObjectProperty(prop) || prop.computed) {
				return { ok: false }
			}
			const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null
			if (key === null || !t.isExpression(prop.value)) {
				return { ok: false }
			}
			const r = evaluateLiteral(prop.value)
			if (!r.ok) {
				return { ok: false }
			}
			out[key] = r.value
		}
		return { ok: true, value: out }
	}
	return { ok: false }
}
