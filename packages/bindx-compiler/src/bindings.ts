/**
 * Binding facts for lift/thunk decisions. A value is emitted at module scope (a lifted closure, a
 * hole thunk), so every identifier it references must mean the same thing there. A name bound by
 * any scope enclosing the emitted value (params, locals of the render or component function) could
 * be captured, so it blocks lifting (default deny).
 */
import * as t from '@babel/types'
import { walkAst } from './astWalk.js'

/** Identifier names `root` reads (value references and component tags), with no binding analysis. */
function referencedNames(root: t.Node): Set<string> {
	const names = new Set<string>()
	const visit = (node: t.Node, parent: t.Node | null, grandparent: t.Node | null): void => {
		if (t.isIdentifier(node) && (parent === null || t.isReferenced(node, parent, grandparent ?? undefined))) {
			names.add(node.name)
		}
		if (t.isJSXOpeningElement(node) || t.isJSXClosingElement(node)) {
			const tag = jsxTagRoot(node.name)
			if (tag !== null) {
				names.add(tag)
			}
		}
		for (const key of t.VISITOR_KEYS[node.type] ?? []) {
			const child: unknown = Reflect.get(node, key)
			for (const item of Array.isArray(child) ? child : [child]) {
				if (isNode(item)) {
					visit(item, node, parent)
				}
			}
		}
	}
	visit(root, null, null)
	return names
}

/** The identifier a component tag resolves through (`Card`, `Ns` of `Ns.Card`); host tags yield null. */
function jsxTagRoot(name: t.JSXOpeningElement['name']): string | null {
	if (t.isJSXIdentifier(name)) {
		const first = name.name[0] ?? ''
		return first !== first.toLowerCase() ? name.name : null
	}
	if (t.isJSXMemberExpression(name)) {
		let object: t.JSXMemberExpression['object'] = name.object
		while (t.isJSXMemberExpression(object)) {
			object = object.object
		}
		return t.isJSXIdentifier(object) ? object.name : null
	}
	return null
}

/** True when `fn` reads `arguments` or `this` that belong to its own invocation. */
export function readsInvocationContext(fn: t.ArrowFunctionExpression | t.FunctionExpression): boolean {
	let found = false
	walkAst(fn.body, node => {
		if (t.isThisExpression(node) || (t.isIdentifier(node) && node.name === 'arguments')) {
			found = true
			return 'stop'
		}
	})
	return found
}

function isNode(value: unknown): value is t.Node {
	return typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
}

/** What module-scope emission may reference, judged at the location of the emitted value. */
export class ModuleScope {
	private readonly parents = new Map<t.Node, t.Node>()
	private readonly scopeBindings = new Map<t.Node, ReadonlySet<string>>()

	constructor(program: t.Program, private readonly moduleBindings: ReadonlySet<string>) {
		forEachChild(program, (child, parent) => this.parents.set(child, parent))
	}

	/** True when `name` at `at` means the module binding (no enclosing scope re-binds it). */
	isModuleBindingAt(name: string, at: t.Node): boolean {
		return this.moduleBindings.has(name) && !this.enclosingBindings(at).has(name)
	}

	/** True when `value` reads a binding of an enclosing function scope (so it cannot move to module scope). */
	capturesEnclosingScope(value: t.Expression): boolean {
		if (readsEnclosingInvocationContext(value)) {
			return true
		}
		const enclosing = this.enclosingBindings(value)
		for (const name of referencedNames(value)) {
			if (enclosing.has(name)) {
				return true
			}
		}
		return false
	}

	/** Names bound by the function scopes (and catch clauses) enclosing `node`, below module level. */
	private enclosingBindings(node: t.Node): Set<string> {
		const names = new Set<string>()
		for (let current = this.parents.get(node); current; current = this.parents.get(current)) {
			if (t.isFunction(current) || t.isCatchClause(current)) {
				for (const name of this.bindingsOf(current)) {
					names.add(name)
				}
			}
		}
		return names
	}

	/** Bindings a function (params + body declarations, nested functions excluded) or catch clause introduces. */
	private bindingsOf(scopeNode: t.Function | t.CatchClause): ReadonlySet<string> {
		const cached = this.scopeBindings.get(scopeNode)
		if (cached) {
			return cached
		}
		const names = new Set<string>()
		const addPattern = (pattern: t.Node): void => {
			for (const name of Object.keys(t.getBindingIdentifiers(pattern))) {
				names.add(name)
			}
		}
		if (t.isCatchClause(scopeNode)) {
			if (scopeNode.param) {
				addPattern(scopeNode.param)
			}
		} else {
			scopeNode.params.forEach(addPattern)
			if (t.isFunctionExpression(scopeNode) && scopeNode.id) {
				names.add(scopeNode.id.name)
			}
			walkAst(scopeNode.body, inner => {
				if (t.isFunction(inner) || t.isClass(inner)) {
					if ((t.isFunctionDeclaration(inner) || t.isClassDeclaration(inner)) && inner.id) {
						names.add(inner.id.name)
					}
					return 'skip'
				}
				if (t.isVariableDeclarator(inner)) {
					addPattern(inner.id)
				}
			})
		}
		this.scopeBindings.set(scopeNode, names)
		return names
	}
}

/** `this`/`arguments` that belong to the scope around `value` (a `function`'s own ones do not). */
function readsEnclosingInvocationContext(value: t.Expression): boolean {
	let found = false
	walkAst(value, node => {
		if (node !== value && (t.isFunctionExpression(node) || t.isFunctionDeclaration(node) || t.isObjectMethod(node) || t.isClassMethod(node))) {
			return 'skip'
		}
		if (node === value && t.isFunctionExpression(node)) {
			return 'skip'
		}
		if (t.isThisExpression(node) || (t.isIdentifier(node) && node.name === 'arguments')) {
			found = true
			return 'stop'
		}
	})
	return found
}

/** Visits every node below `root` with its parent. */
export function forEachChild(root: t.Node, visit: (child: t.Node, parent: t.Node) => void): void {
	const pending: t.Node[] = [root]
	for (let node = pending.pop(); node; node = pending.pop()) {
		for (const key of t.VISITOR_KEYS[node.type] ?? []) {
			const value: unknown = Reflect.get(node, key)
			for (const item of Array.isArray(value) ? value : [value]) {
				if (isNode(item)) {
					visit(item, node)
					pending.push(item)
				}
			}
		}
	}
}
