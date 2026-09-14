/**
 * Full-body analysis of a render/condition function. Walks every branch and nested
 * function (union is sound) recording entity field access into the selection tree,
 * and bails on anything unclassifiable (default deny). Mirrors the runtime collector.
 */
import * as t from '@babel/types'
import type { SelNode } from './selectionTree.js'
import type { ImportBindings } from './imports.js'
import {
	BailError, type Scope, childScope, consumeLeaf, consumeMany, consumeRelation,
	paramNamesOf, referencesRoot, resolve, type RootRef,
} from './resolve.js'
import { JsxAnalyzer } from './jsx.js'
import type { ContractLookup } from './contracts.js'
import type { TargetKindLookup } from './targetKind.js'
import type { AnalyzedHole } from './types.js'

export class BodyAnalyzer {
	private readonly jsx: JsxAnalyzer
	/** Nested-component holes collected across the render + condition functions (phase 2). */
	readonly holes: AnalyzedHole[] = []

	constructor(
		private readonly bindings: ImportBindings,
		private readonly moduleBindings: ReadonlySet<string>,
		contracts: ContractLookup,
		targetKinds: TargetKindLookup,
	) {
		this.jsx = new JsxAnalyzer(this, bindings, moduleBindings, contracts, targetKinds)
	}

	/** Public so JsxAnalyzer can register a hole it discovered. */
	addHole(hole: AnalyzedHole): void {
		this.holes.push(hole)
	}

	/** Register a function's params against the shared prop roots, then walk its body. */
	analyzeFunction(fn: t.ArrowFunctionExpression | t.FunctionExpression, propRoots: ReadonlyMap<string, SelNode>): void {
		const scope: Scope = { roots: new Map(), propsParams: new Set(), propRoots, scalarParams: new Set(), locals: new Set() }
		const param = fn.params[0]
		if (param) {
			this.registerTopParam(param, scope)
		}
		if (t.isBlockStatement(fn.body)) {
			this.walkStatements(fn.body.body, scope)
		} else {
			this.walkValue(fn.body, scope)
		}
	}

	/**
	 * Analyze a `<Entity>` children closure (phase 3). Unlike a `.render()` body — whose
	 * param is the props object and entity props are its members — the closure's FIRST param
	 * IS the root entity accessor itself, exactly like a `<HasOne>` children callback. So it
	 * binds directly at `rootNode` (source `sourceKey`); all downstream machinery (paths,
	 * holes, contracts, cond-in-props) applies unchanged.
	 */
	analyzeRootChildren(fn: t.ArrowFunctionExpression | t.FunctionExpression, rootNode: SelNode, sourceKey: string): void {
		const scope: Scope = { roots: new Map(), propsParams: new Set(), propRoots: new Map([[sourceKey, rootNode]]), scalarParams: new Set(), locals: new Set() }
		this.walkCallbackWithItem(fn, { node: rootNode, path: [], source: sourceKey, absPath: [] }, scope)
	}

	private registerTopParam(param: t.Node, scope: Scope): void {
		const p = t.isAssignmentPattern(param) ? param.left : param
		if (t.isIdentifier(p)) {
			scope.propsParams.add(p.name)
			return
		}
		if (t.isObjectPattern(p)) {
			for (const prop of p.properties) {
				if (t.isRestElement(prop)) {
					continue // rest captures scalar props only (proxy exposes none enumerably)
				}
				if (!t.isObjectProperty(prop) || prop.computed || !t.isIdentifier(prop.key)) {
					continue
				}
				const propRoot = scope.propRoots.get(prop.key.name)
				if (!propRoot) {
					// Non-entity render prop (scalar / .use() value) — an inert scalar mock at
					// oracle collection, so it is safe to drop when used as a hole prop.
					for (const name of paramNamesOf(prop.value)) {
						scope.scalarParams.add(name)
					}
					continue
				}
				this.bindPattern(prop.value, { node: propRoot, path: [], source: prop.key.name, absPath: [] }, scope)
			}
		}
	}

	/** Bind a (possibly nested) destructuring pattern of an entity value to roots. */
	private bindPattern(target: t.Node, ref: RootRef, scope: Scope): void {
		if (t.isIdentifier(target)) {
			scope.roots.set(target.name, ref)
			return
		}
		if (t.isObjectPattern(target)) {
			const node = consumeRelation(ref)
			for (const prop of target.properties) {
				if (t.isRestElement(prop)) {
					throw new BailError({ code: 'UNCLASSIFIED', message: 'rest element in entity destructuring' })
				}
				if (!t.isObjectProperty(prop) || prop.computed || !t.isIdentifier(prop.key)) {
					throw new BailError({ code: 'UNCLASSIFIED', message: 'unsupported entity destructuring' })
				}
				this.bindPattern(
					prop.value,
					{ node, path: [prop.key.name], source: ref.source, absPath: [...ref.absPath, prop.key.name] },
					scope,
				)
			}
			return
		}
		throw new BailError({ code: 'UNCLASSIFIED', message: 'unsupported entity binding pattern' })
	}

	// ── Statements ──────────────────────────────────────────────────────────

	private walkStatements(stmts: t.Statement[], scope: Scope): void {
		for (const stmt of stmts) {
			this.walkStatement(stmt, scope)
		}
	}

	private walkStatement(stmt: t.Statement, scope: Scope): void {
		if (t.isVariableDeclaration(stmt)) {
			for (const decl of stmt.declarations) {
				this.walkDeclarator(stmt.kind, decl, scope)
			}
			return
		}
		if (t.isExpressionStatement(stmt)) {
			this.walkValue(stmt.expression, scope)
			return
		}
		if (t.isReturnStatement(stmt)) {
			if (stmt.argument) {
				this.walkValue(stmt.argument, scope)
			}
			return
		}
		if (t.isIfStatement(stmt)) {
			this.walkValue(stmt.test, scope)
			this.walkStatement(stmt.consequent, scope)
			if (stmt.alternate) {
				this.walkStatement(stmt.alternate, scope)
			}
			return
		}
		if (t.isBlockStatement(stmt)) {
			this.walkStatements(stmt.body, scope)
			return
		}
		if (t.isEmptyStatement(stmt)) {
			return
		}
		// Loops, switch, try, etc.: sound only if no root escapes into them.
		if (referencesRoot(stmt, scope)) {
			throw new BailError({ code: 'UNCLASSIFIED', message: `unsupported statement referencing an entity: ${stmt.type}` })
		}
	}

	private walkDeclarator(kind: string, decl: t.VariableDeclarator, scope: Scope): void {
		if (!decl.init) {
			return
		}
		const res = resolve(decl.init, scope)
		if (res.kind === 'ref') {
			if (kind !== 'const') {
				throw new BailError({ code: 'ENTITY_REASSIGNMENT', message: 'entity alias must be a const binding' })
			}
			this.bindPattern(decl.id, res.ref, scope)
			return
		}
		// Render-local binding — not liftable if later used as a hole prop (default deny).
		for (const name of Object.keys(t.getBindingIdentifiers(decl.id))) {
			scope.locals.add(name)
		}
		if (res.kind === 'opaque') {
			return
		}
		// Non-entity initializer: may still contain JSX/roots to analyze.
		this.walkValue(decl.init, scope)
	}

	// ── Expressions ─────────────────────────────────────────────────────────

	/** Public so JsxAnalyzer (JsxHost) can defer value/JSX-child slots back here. */
	walkValue(node: t.Node, scope: Scope): void {
		if (t.isJSXElement(node) || t.isJSXFragment(node)) {
			this.jsx.walk(node, scope)
			return
		}
		if (t.isCallExpression(node) || t.isOptionalCallExpression(node)) {
			this.walkCall(node, scope)
			return
		}
		if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
			this.walkNestedFunction(node, scope)
			return
		}
		if (t.isConditionalExpression(node)) {
			this.walkValue(node.test, scope)
			this.walkValue(node.consequent, scope) // union of both branches
			this.walkValue(node.alternate, scope)
			return
		}
		if (t.isLogicalExpression(node) || t.isBinaryExpression(node)) {
			if (t.isExpression(node.left)) {
				this.walkValue(node.left, scope)
			}
			this.walkValue(node.right, scope)
			return
		}
		if (t.isUnaryExpression(node)) {
			this.walkValue(node.argument, scope)
			return
		}
		if (t.isSequenceExpression(node)) {
			for (const e of node.expressions) {
				this.walkValue(e, scope)
			}
			return
		}
		if (t.isTemplateLiteral(node)) {
			for (const e of node.expressions) {
				if (t.isExpression(e)) {
					this.walkValue(e, scope)
				}
			}
			return
		}
		if (t.isArrayExpression(node)) {
			for (const el of node.elements) {
				if (el === null) {
					continue
				}
				this.walkSpreadable(el, scope)
			}
			return
		}
		if (t.isObjectExpression(node)) {
			this.walkObjectExpression(node, scope)
			return
		}
		if (t.isAssignmentExpression(node)) {
			if (referencesRoot(node, scope)) {
				throw new BailError({ code: 'ENTITY_REASSIGNMENT', message: 'assignment involving an entity value' })
			}
			this.walkValue(node.right, scope)
			return
		}
		if (t.isNewExpression(node)) {
			if (referencesRoot(node, scope)) {
				throw new BailError({ code: 'ENTITY_ESCAPES_TO_CALL', message: 'entity value passed to a constructor' })
			}
			return
		}
		if (t.isTaggedTemplateExpression(node)) {
			if (referencesRoot(node, scope)) {
				throw new BailError({ code: 'ENTITY_ESCAPES_TO_CALL', message: 'entity value in a tagged template' })
			}
			return
		}
		if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node) || t.isIdentifier(node)
			|| t.isParenthesizedExpression(node) || t.isTSNonNullExpression(node) || t.isTSAsExpression(node)) {
			const res = resolve(node, scope)
			if (res.kind === 'ref') {
				consumeLeaf(res.ref)
			}
			return
		}
		// Literals and other leaves: only a problem if they smuggle a root.
		if (referencesRoot(node, scope)) {
			throw new BailError({ code: 'UNCLASSIFIED', message: `unclassifiable expression referencing an entity: ${node.type}` })
		}
	}

	private walkSpreadable(node: t.Node, scope: Scope): void {
		if (t.isSpreadElement(node)) {
			if (referencesRoot(node.argument, scope)) {
				throw new BailError({ code: 'ENTITY_SPREAD', message: 'spread of an entity value' })
			}
			this.walkValue(node.argument, scope)
			return
		}
		this.walkValue(node, scope)
	}

	private walkObjectExpression(node: t.ObjectExpression, scope: Scope): void {
		for (const prop of node.properties) {
			if (t.isSpreadElement(prop)) {
				if (referencesRoot(prop.argument, scope)) {
					throw new BailError({ code: 'ENTITY_SPREAD', message: 'spread of an entity value into an object' })
				}
				this.walkValue(prop.argument, scope)
				continue
			}
			if (t.isObjectMethod(prop)) {
				this.walkNestedFunction(prop, scope)
				continue
			}
			if (prop.computed && t.isExpression(prop.key)) {
				this.walkValue(prop.key, scope)
			}
			if (t.isExpression(prop.value)) {
				this.walkValue(prop.value, scope)
			}
		}
	}

	private walkNestedFunction(fn: t.ArrowFunctionExpression | t.FunctionExpression | t.ObjectMethod, scope: Scope): void {
		const child = childScope(scope)
		for (const param of fn.params) {
			const p = t.isAssignmentPattern(param) ? param.left : param
			this.shadowBindings(p, child)
		}
		if (t.isBlockStatement(fn.body)) {
			this.walkStatements(fn.body.body, child)
		} else {
			this.walkValue(fn.body, child)
		}
	}

	private shadowBindings(pattern: t.Node, scope: Scope): void {
		// A generic nested-fn param shadows any outer binding and is render-local (bail if
		// used as a hole prop): it is neither module-scope nor a proven-inert render prop.
		for (const name of paramNamesOf(pattern)) {
			scope.roots.delete(name)
			scope.propsParams.delete(name)
			scope.scalarParams.delete(name)
			scope.locals.add(name)
		}
	}

	private walkCall(node: t.CallExpression | t.OptionalCallExpression, scope: Scope): void {
		const callee = node.callee
		// `X.map(cb)` — has-many iteration
		if ((t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) && !callee.computed
			&& t.isIdentifier(callee.property) && callee.property.name === 'map') {
			const objRes = resolve(callee.object, scope)
			if (objRes.kind === 'ref') {
				this.walkMap(node, objRes.ref, scope)
				return
			}
		}
		// `cond.method(...)` — condition DSL, args are field reads
		if (t.isMemberExpression(callee) && !callee.computed && t.isIdentifier(callee.object)
			&& this.bindings.cond.has(callee.object.name)) {
			for (const arg of node.arguments) {
				if (t.isExpression(arg)) {
					this.walkValue(arg, scope)
				}
			}
			return
		}
		// Any other call that receives/targets an entity value executes opaque code → bail.
		if (t.isExpression(callee) && resolve(callee, scope).kind === 'ref') {
			throw new BailError({ code: 'ENTITY_ESCAPES_TO_CALL', message: 'method call on an entity value' })
		}
		for (const arg of node.arguments) {
			if (t.isSpreadElement(arg)) {
				if (referencesRoot(arg.argument, scope)) {
					throw new BailError({ code: 'ENTITY_SPREAD', message: 'spread of an entity value into a call' })
				}
				this.walkValue(arg.argument, scope)
				continue
			}
			if (t.isJSXElement(arg) || t.isJSXFragment(arg) || t.isArrowFunctionExpression(arg) || t.isFunctionExpression(arg)) {
				this.walkValue(arg, scope) // safe: analyzed, not executed with an entity value
				continue
			}
			if (t.isExpression(arg) && resolve(arg, scope).kind === 'ref') {
				throw new BailError({ code: 'ENTITY_ESCAPES_TO_CALL', message: 'entity value passed to an unrecognized call' })
			}
			if (t.isExpression(arg)) {
				this.walkValue(arg, scope)
			}
		}
	}

	private walkMap(node: t.CallExpression | t.OptionalCallExpression, ref: RootRef, scope: Scope): void {
		const item = consumeMany(ref)
		const cb = node.arguments[0]
		if (cb && (t.isArrowFunctionExpression(cb) || t.isFunctionExpression(cb))) {
			this.walkCallbackWithItem(cb, { node: item, path: [], source: ref.source, absPath: ref.absPath }, scope)
			return
		}
		// Non-inline map callback: its field access is invisible → bail.
		throw new BailError({ code: 'UNCLASSIFIED', message: '.map() callback is not an inline function' })
	}

	/** Public so JsxAnalyzer can drive HasOne/HasMany children callbacks; itemRef carries the item's origin. */
	walkCallbackWithItem(fn: t.ArrowFunctionExpression | t.FunctionExpression, itemRef: RootRef, scope: Scope): void {
		const child = childScope(scope)
		const param = fn.params[0]
		if (param) {
			const p = t.isAssignmentPattern(param) ? param.left : param
			this.bindPattern(p, itemRef, child)
		}
		// Secondary callback params (index, methods) are inert non-entity values — safe to drop.
		for (const extra of fn.params.slice(1)) {
			const p = t.isAssignmentPattern(extra) ? extra.left : extra
			for (const name of paramNamesOf(p)) {
				child.scalarParams.add(name)
			}
		}
		if (t.isBlockStatement(fn.body)) {
			this.walkStatements(fn.body.body, child)
		} else {
			this.walkValue(fn.body, child)
		}
	}
}
