/**
 * Full-body analysis of a render/condition function. Walks every branch and nested
 * function (union is sound) recording entity field access into the selection tree,
 * and bails on anything unclassifiable (default deny). Mirrors the runtime collector.
 */
import * as t from '@babel/types'
import type { SelNode } from './selectionTree.js'
import type { ImportBindings } from './imports.js'
import { readsInvocationContext, type ModuleScope } from './bindings.js'
import {
	BailError, type Scope, childScope, consumeMany, consumePlainRead, consumeRelation, consumeResolution,
	itemRefOf, memberOf, paramNamesOf, plainReadIndex, referencesRoot, resolve, unwrap, type RootRef,
} from './resolve.js'
import { JsxAnalyzer, type ValueUse } from './jsx.js'
import type { ContractLookup } from './contracts.js'
import type { TargetKindLookup } from './targetKind.js'
import type { AnalyzedHole } from './types.js'

/** Field-ref methods that act on the ref and return no entity; called during render they only touch the field. */
const REF_ACTION_METHODS: ReadonlySet<string> = new Set([
	'setValue', 'touch', 'addError', 'clearErrors', 'connect', 'disconnect', 'delete', 'reset', 'remove', 'move',
	'add', 'onChange', 'onChanging', 'onItemConnected', 'onItemDisconnected', 'interceptItemConnecting',
	'interceptItemDisconnecting',
])

export class BodyAnalyzer {
	private readonly jsx: JsxAnalyzer
	/** Nested-component holes collected across the render + condition functions (phase 2). */
	readonly holes: AnalyzedHole[] = []

	constructor(
		private readonly bindings: ImportBindings,
		moduleScope: ModuleScope,
		contracts: ContractLookup,
		targetKinds: TargetKindLookup,
	) {
		this.jsx = new JsxAnalyzer(this, bindings, moduleScope, contracts, targetKinds)
	}

	/** Public so JsxAnalyzer can register a hole it discovered. */
	addHole(hole: AnalyzedHole): void {
		this.holes.push(hole)
	}

	/** Register a function's params against the shared prop roots, then walk its body. */
	analyzeFunction(fn: t.ArrowFunctionExpression | t.FunctionExpression, propRoots: ReadonlyMap<string, SelNode>): void {
		const scope: Scope = { roots: new Map(), propsParams: new Set(), propRoots, scalarParams: new Set(), locals: new Set() }
		guardInvocationContext(fn)
		const param = fn.params[0]
		if (param) {
			this.registerTopParam(param, scope)
		}
		this.walkBody(fn, scope)
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
		if (!t.isObjectPattern(p)) {
			throw new BailError({ code: 'UNCLASSIFIED', message: 'unsupported props parameter pattern' })
		}
		this.bindPropsPattern(p, scope)
	}

	/** Bind a destructuring of the props object (render param or `const {…} = props`). */
	private bindPropsPattern(pattern: t.ObjectPattern, scope: Scope): void {
		const defaults: t.Expression[] = []
		for (const prop of pattern.properties) {
			if (t.isRestElement(prop)) {
				if (!t.isIdentifier(prop.argument)) {
					throw new BailError({ code: 'UNCLASSIFIED', message: 'unsupported rest pattern of the props object' })
				}
				scope.propsParams.add(prop.argument.name) // the rest still carries entity props
				continue
			}
			const key = staticKeyName(prop)
			if (key === null || !t.isObjectProperty(prop)) {
				throw new BailError({ code: 'UNCLASSIFIED', message: 'unsupported key in the props destructuring' })
			}
			const propRoot = scope.propRoots.get(key)
			if (!propRoot) {
				// Non-entity render prop (scalar / .use() value) — an inert scalar mock at
				// oracle collection, so it is safe to drop when used as a hole prop.
				for (const name of paramNamesOf(prop.value)) {
					scope.scalarParams.add(name)
				}
				collectDefaults(prop.value, defaults)
				continue
			}
			this.bindPattern(prop.value, { node: propRoot, path: [], source: key, absPath: [] }, scope)
		}
		// Default values run during render and are bound to a name (kept).
		for (const value of defaults) {
			this.walkValue(value, scope, 'kept')
		}
	}

	/** Bind a (possibly nested) destructuring pattern of an entity value to roots. */
	private bindPattern(target: t.Node, ref: RootRef, scope: Scope): void {
		if (t.isIdentifier(target)) {
			scope.roots.set(target.name, ref)
			return
		}
		if (t.isObjectPattern(target)) {
			for (const prop of target.properties) {
				if (t.isRestElement(prop)) {
					throw new BailError({ code: 'UNCLASSIFIED', message: 'rest element in entity destructuring' })
				}
				if (!t.isObjectProperty(prop) || prop.computed || !t.isIdentifier(prop.key)) {
					throw new BailError({ code: 'UNCLASSIFIED', message: 'unsupported entity destructuring' })
				}
				// `const { x } = ref` reads `ref.x`: same rules as the member read (ref API, meta keys).
				const member = memberOf(ref, prop.key.name)
				if (member.kind === 'ref') {
					this.bindPattern(prop.value, member.ref, scope)
					continue
				}
				consumeResolution(member)
				if (!t.isIdentifier(prop.value)) {
					throw new BailError({ code: 'UNCLASSIFIED', message: 'nested destructuring of an entity meta value' })
				}
				scope.locals.add(prop.value.name)
			}
			return
		}
		throw new BailError({ code: 'UNCLASSIFIED', message: 'unsupported entity binding pattern' })
	}

	// ── Statements ──────────────────────────────────────────────────────────

	private walkStatements(stmts: t.Statement[], scope: Scope): void {
		// Hoisted declarations are render-local from the start of the block.
		for (const stmt of stmts) {
			if ((t.isFunctionDeclaration(stmt) || t.isClassDeclaration(stmt)) && stmt.id) {
				scope.locals.add(stmt.id.name)
			}
		}
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
				this.walkValue(stmt.argument, scope, 'kept') // the caller receives it
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
		if (t.isFunctionDeclaration(stmt)) {
			this.walkNestedFunction(stmt, scope) // may be called during render: its reads count
			return
		}
		// Loops, switch, try, etc.: sound only if no root escapes into them.
		if (referencesRoot(stmt, scope)) {
			throw new BailError({ code: 'UNCLASSIFIED', message: `unsupported statement referencing an entity: ${stmt.type}` })
		}
	}

	private walkDeclarator(kind: string, decl: t.VariableDeclarator, scope: Scope): void {
		if (!decl.init) {
			this.addLocals(decl.id, scope)
			return
		}
		const init = unwrap(decl.init)
		if (t.isIdentifier(init) && scope.propsParams.has(init.name)) {
			this.bindPropsAlias(kind, decl.id, scope)
			return
		}
		const res = resolve(decl.init, scope)
		if (res.kind === 'ref' && kind !== 'const' && plainReadIndex(res.ref) !== -1) {
			consumePlainRead(res.ref, plainReadIndex(res.ref)) // `let v = article.title.value`: plain data, not an alias
			this.addLocals(decl.id, scope)
			return
		}
		if (res.kind === 'ref') {
			if (kind !== 'const') {
				throw new BailError({ code: 'ENTITY_REASSIGNMENT', message: 'entity alias must be a const binding' })
			}
			this.bindPattern(decl.id, res.ref, scope)
			return
		}
		// Render-local binding — not liftable if later used as a hole prop (default deny).
		this.addLocals(decl.id, scope)
		if (res.kind === 'opaque') {
			consumeResolution(res)
			return
		}
		// Non-entity initializer: may still contain JSX/roots to analyze; the binding keeps its value.
		this.walkValue(decl.init, scope, 'kept')
	}

	/** `const p = props` / `const { article } = props`: the binding stays a view of the props object. */
	private bindPropsAlias(kind: string, target: t.VariableDeclarator['id'], scope: Scope): void {
		if (kind !== 'const') {
			throw new BailError({ code: 'ENTITY_REASSIGNMENT', message: 'props alias must be a const binding' })
		}
		if (t.isIdentifier(target)) {
			scope.propsParams.add(target.name)
			return
		}
		if (t.isObjectPattern(target)) {
			this.bindPropsPattern(target, scope)
			return
		}
		throw new BailError({ code: 'UNCLASSIFIED', message: 'unsupported destructuring of the props object' })
	}

	private addLocals(target: t.Node, scope: Scope): void {
		for (const name of Object.keys(t.getBindingIdentifiers(target))) {
			scope.locals.add(name)
		}
	}

	// ── Expressions ─────────────────────────────────────────────────────────

	/** Public so JsxAnalyzer (JsxHost) can defer value/JSX-child slots back here. */
	walkValue(node: t.Node, scope: Scope, use: ValueUse = 'read'): void {
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
			this.walkValue(node.consequent, scope, use) // union of both branches; either is the value
			this.walkValue(node.alternate, scope, use)
			return
		}
		if (t.isLogicalExpression(node)) {
			this.walkValue(node.left, scope, use) // `a ?? b`, `a || b`: either operand is the value
			this.walkValue(node.right, scope, use)
			return
		}
		if (t.isBinaryExpression(node)) {
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
			node.expressions.forEach((e, i) => this.walkValue(e, scope, i === node.expressions.length - 1 ? use : 'read'))
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
			this.walkValue(node.right, scope, 'kept')
			return
		}
		if (t.isNewExpression(node)) {
			if (t.isExpression(node.callee) && resolve(node.callee, scope).kind === 'ref') {
				throw new BailError({ code: 'ENTITY_ESCAPES_TO_CALL', message: 'entity value used as a constructor' })
			}
			if (t.isExpression(node.callee)) {
				this.walkValue(node.callee, scope)
			}
			this.walkArguments(node.arguments, scope)
			return
		}
		if (t.isTaggedTemplateExpression(node)) {
			if (referencesRoot(node, scope)) {
				throw new BailError({ code: 'ENTITY_ESCAPES_TO_CALL', message: 'entity value in a tagged template' })
			}
			return
		}
		if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node) || t.isIdentifier(node)
			|| t.isParenthesizedExpression(node) || t.isTSNonNullExpression(node) || t.isTSAsExpression(node)
			|| t.isTSSatisfiesExpression(node)) {
			const res = resolve(node, scope)
			if (res.kind === 'none') {
				this.walkUnresolved(node, scope, use)
				return
			}
			if (use === 'kept' && res.kind === 'ref') {
				this.consumeKeptRef(res.ref)
				return
			}
			consumeResolution(res)
			return
		}
		// Literals and other leaves: only a problem if they smuggle a root.
		if (referencesRoot(node, scope)) {
			throw new BailError({ code: 'UNCLASSIFIED', message: `unclassifiable expression referencing an entity: ${node.type}` })
		}
	}

	/**
	 * A value read that is not an entity path. Every part evaluated during render still counts:
	 * the props object as a value and member access on a computed entity value bail.
	 */
	private walkUnresolved(nodeIn: t.Node, scope: Scope, use: ValueUse): void {
		const node = unwrap(nodeIn)
		if (t.isIdentifier(node)) {
			if (scope.propsParams.has(node.name)) {
				throw new BailError({ code: 'UNCLASSIFIED', message: 'the props object is used as a value' })
			}
			return
		}
		if (!t.isMemberExpression(node) && !t.isOptionalMemberExpression(node)) {
			this.walkValue(node, scope, use)
			return
		}
		if (node.computed) {
			this.walkValue(node.object, scope, 'kept') // `xs[i]` hands out an element of `xs`
			this.walkValue(node.property, scope)
			return
		}
		const object = unwrap(node.object)
		if (t.isIdentifier(object)) {
			return // a scalar prop (`props.label`) or a non-entity binding
		}
		if (t.isMemberExpression(object) || t.isOptionalMemberExpression(object)) {
			this.walkUnresolved(object, scope, 'kept')
			return
		}
		if (!t.isCallExpression(object) && !t.isOptionalCallExpression(object) && referencesRoot(object, scope)) {
			throw new BailError({ code: 'UNCLASSIFIED', message: `member access on a computed entity value: ${object.type}` })
		}
		this.walkValue(object, scope, 'kept')
	}

	/** A ref whose value leaves the walk: only plain data may (assuming its field is not a has-one). */
	private consumeKeptRef(ref: RootRef): void {
		const index = plainReadIndex(ref)
		if (index === -1) {
			throw new BailError({ code: 'ENTITY_ESCAPES_TO_VALUE', message: 'entity value is stored, passed on or returned' })
		}
		consumePlainRead(ref, index)
	}

	private walkSpreadable(node: t.Node, scope: Scope): void {
		if (t.isSpreadElement(node)) {
			if (referencesRoot(node.argument, scope)) {
				throw new BailError({ code: 'ENTITY_SPREAD', message: 'spread of an entity value' })
			}
			this.walkValue(node.argument, scope)
			return
		}
		this.walkValue(node, scope, 'kept') // an element of the array
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
				this.walkValue(prop.value, scope, 'kept') // a property of the object
			}
		}
	}

	private walkNestedFunction(fn: t.ArrowFunctionExpression | t.FunctionExpression | t.FunctionDeclaration | t.ObjectMethod, scope: Scope): void {
		const child = childScope(scope)
		for (const param of fn.params) {
			const p = t.isAssignmentPattern(param) ? param.left : param
			this.shadowBindings(p, child)
		}
		this.walkParamDefaults(fn.params, child)
		this.walkBody(fn, child)
	}

	/** Parameter default values run when the function is called and are bound to the param (kept). */
	private walkParamDefaults(params: ReadonlyArray<t.Node>, scope: Scope): void {
		const defaults: t.Expression[] = []
		for (const param of params) {
			collectDefaults(param, defaults)
		}
		for (const value of defaults) {
			this.walkValue(value, scope, 'kept')
		}
	}

	/** A function body; an expression body is its return value (kept). */
	private walkBody(fn: t.Function, scope: Scope): void {
		if (t.isBlockStatement(fn.body)) {
			this.walkStatements(fn.body.body, scope)
		} else {
			this.walkValue(fn.body, scope, 'kept')
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
		const calleeRes = t.isExpression(callee) ? resolve(callee, scope) : { kind: 'none' as const }
		if (calleeRes.kind === 'ref') {
			this.consumeMethodCall(calleeRes.ref)
		} else if (t.isExpression(callee)) {
			this.walkValue(callee, scope) // the callee is evaluated too (an IIFE runs its body)
		}
		this.walkArguments(node.arguments, scope)
	}

	/**
	 * A method called on a ref: a method of plain data (`title.value.trim()`) or a ref action
	 * (`title.setValue(x)`) only touches the field; anything else runs opaque code on an entity → bail.
	 */
	private consumeMethodCall(ref: RootRef): void {
		const plainIndex = plainReadIndex(ref)
		if (plainIndex !== -1 && plainIndex < ref.path.length - 1) {
			consumePlainRead(ref, plainIndex)
			return
		}
		const method = ref.path[ref.path.length - 1]
		if (ref.path.length >= 2 && method !== undefined && REF_ACTION_METHODS.has(method)) {
			consumePlainRead(ref, ref.path.length - 1) // a has-one would read `method` as a field instead
			return
		}
		throw new BailError({ code: 'ENTITY_ESCAPES_TO_CALL', message: 'method call on an entity value' })
	}

	/** Call/constructor arguments: the callee keeps them. */
	private walkArguments(args: ReadonlyArray<t.Node>, scope: Scope): void {
		for (const arg of args) {
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
			if (t.isExpression(arg)) {
				const res = resolve(arg, scope)
				if (res.kind === 'ref' && plainReadIndex(res.ref) === -1) {
					throw new BailError({ code: 'ENTITY_ESCAPES_TO_CALL', message: 'entity value passed to an unrecognized call' })
				}
				this.walkValue(arg, scope, 'kept') // the callee receives it
			}
		}
	}

	private walkMap(node: t.CallExpression | t.OptionalCallExpression, ref: RootRef, scope: Scope): void {
		const item = consumeMany(ref)
		const cb = node.arguments[0]
		if (cb && (t.isArrowFunctionExpression(cb) || t.isFunctionExpression(cb))) {
			this.walkCallbackWithItem(cb, itemRefOf(ref, item), scope)
			return
		}
		// Non-inline map callback: its field access is invisible → bail.
		throw new BailError({ code: 'UNCLASSIFIED', message: '.map() callback is not an inline function' })
	}

	/** Public so JsxAnalyzer can drive HasOne/HasMany children callbacks; itemRef carries the item's origin. */
	walkCallbackWithItem(fn: t.ArrowFunctionExpression | t.FunctionExpression, itemRef: RootRef, scope: Scope): void {
		guardInvocationContext(fn)
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
		this.walkParamDefaults(fn.params, child)
		this.walkBody(fn, child)
	}
}

/** A `function` reading `arguments`/`this` gets values the analyzer cannot bind to roots. */
function guardInvocationContext(fn: t.ArrowFunctionExpression | t.FunctionExpression): void {
	if (t.isFunctionExpression(fn) && readsInvocationContext(fn)) {
		throw new BailError({ code: 'UNCLASSIFIED', message: 'function reads `arguments` or `this`' })
	}
}

/** Non-computed identifier or string-literal key of an object-pattern property; null otherwise. */
function staticKeyName(prop: t.ObjectProperty | t.RestElement): string | null {
	if (!t.isObjectProperty(prop) || prop.computed) {
		return null
	}
	if (t.isIdentifier(prop.key)) {
		return prop.key.name
	}
	return t.isStringLiteral(prop.key) ? prop.key.value : null
}

/** Default-value expressions inside a binding pattern (evaluated when the pattern binds). */
function collectDefaults(pattern: t.Node, out: t.Expression[]): void {
	if (t.isAssignmentPattern(pattern)) {
		out.push(pattern.right)
		collectDefaults(pattern.left, out)
	} else if (t.isObjectPattern(pattern)) {
		for (const prop of pattern.properties) {
			collectDefaults(t.isRestElement(prop) ? prop.argument : prop.value, out)
		}
	} else if (t.isArrayPattern(pattern)) {
		for (const element of pattern.elements) {
			if (element) {
				collectDefaults(element, out)
			}
		}
	}
}
