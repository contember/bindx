/**
 * JSX walking for the body analyzer: recognized bindx components (Field/Attribute/
 * Show/HasOne/HasMany/If), host elements (attribute values are plain leaf slots),
 * and unknown components (children analyzed; entity-rooted non-children props bail).
 */
import * as t from '@babel/types'
import type { ComponentKind, ImportBindings } from './imports.js'
import {
	BailError, type RootRef, type Scope, consumeLeaf, consumeMany, consumeRelation,
	entityPathOf, evaluateLiteral, referencesRoot, resolve,
} from './resolve.js'
import type { AnalyzedHole, HoleEntityProp, StaticHasManyParams } from './types.js'

const HASMANY_PARAM_KEYS = ['filter', 'orderBy', 'limit', 'offset', 'totalCount'] as const

/** The value/callback walkers the JSX analyzer defers back into (BodyAnalyzer). */
export interface JsxHost {
	walkValue(node: t.Node, scope: Scope): void
	walkCallbackWithItem(fn: t.ArrowFunctionExpression | t.FunctionExpression, itemRef: RootRef, scope: Scope): void
	addHole(hole: AnalyzedHole): void
}

export class JsxAnalyzer {
	constructor(
		private readonly host: JsxHost,
		private readonly bindings: ImportBindings,
		private readonly moduleBindings: ReadonlySet<string>,
	) {}

	walk(node: t.JSXElement | t.JSXFragment, scope: Scope): void {
		if (t.isJSXFragment(node)) {
			this.walkChildren(node.children, scope)
			return
		}
		const kind = this.componentKind(node.openingElement.name)
		if (kind.type === 'bindx') {
			this.walkBindxComponent(kind.kind, node, scope)
		} else if (kind.type === 'host') {
			this.walkHostElement(node, scope)
		} else if (kind.type === 'component') {
			this.walkComponentElement(kind.tag, node, scope)
		} else {
			this.walkMemberTagElement(node, scope)
		}
	}

	private componentKind(name: t.JSXOpeningElement['name']):
		{ type: 'bindx'; kind: ComponentKind } | { type: 'host' } | { type: 'component'; tag: string } | { type: 'memberTag' } {
		if (t.isJSXIdentifier(name)) {
			const kind = this.bindings.components.get(name.name)
			if (kind) {
				return { type: 'bindx', kind }
			}
			const first = name.name[0] ?? ''
			const isHost = first === first.toLowerCase() && first !== first.toUpperCase()
			return isHost ? { type: 'host' } : { type: 'component', tag: name.name }
		}
		if (t.isJSXMemberExpression(name) && t.isJSXIdentifier(name.property) && name.property.name === 'Fragment') {
			return { type: 'host' }
		}
		return { type: 'memberTag' } // `<Ns.Comp/>` / namespaced tags — not a simple identifier
	}

	private walkHostElement(node: t.JSXElement, scope: Scope): void {
		for (const attr of node.openingElement.attributes) {
			if (t.isJSXSpreadAttribute(attr)) {
				this.guardSpread(attr, scope, 'host element')
				continue
			}
			const expr = attrExpr(attr)
			if (expr) {
				this.host.walkValue(expr, scope) // host attributes are plain value slots (leaf)
			}
		}
		this.walkChildren(node.children, scope)
	}

	/**
	 * A component-typed JSX element (`<Card .../>`). Entity-rooted props become a phase-2
	 * hole resolved through the target's runtime selection surface; children stay statically
	 * analyzed (not part of the hole).
	 */
	private walkComponentElement(tag: string, node: t.JSXElement, scope: Scope): void {
		const entityProps: Record<string, HoleEntityProp> = {}
		const literalProps: Record<string, unknown> = {}

		for (const attr of node.openingElement.attributes) {
			if (t.isJSXSpreadAttribute(attr)) {
				this.guardSpread(attr, scope, 'component')
				continue
			}
			if (!t.isJSXIdentifier(attr.name) || attr.name.name === 'children') {
				continue
			}
			this.collectComponentProp(attr.name.name, attr.value, scope, entityProps, literalProps)
		}

		if (Object.keys(entityProps).length > 0) {
			if (!this.moduleBindings.has(tag)) {
				// Tag isn't resolvable at module scope → no thunk can reference it.
				throw new BailError({ code: 'ENTITY_ESCAPES_TO_COMPONENT', message: `component <${tag}> does not resolve to a module binding` })
			}
			this.host.addHole({
				component: tag,
				entityProps,
				literalProps: Object.keys(literalProps).length > 0 ? literalProps : undefined,
			})
		}

		this.walkChildren(node.children, scope) // the `children` slot is analyzed at runtime
	}

	/** Namespaced / member-expression tags (`<Ns.Comp/>`) cannot be referenced by a thunk → bail on entity props. */
	private walkMemberTagElement(node: t.JSXElement, scope: Scope): void {
		for (const attr of node.openingElement.attributes) {
			if (t.isJSXSpreadAttribute(attr)) {
				this.guardSpread(attr, scope, 'component')
				continue
			}
			const expr = attrExpr(attr)
			if (expr && referencesRoot(expr, scope)) {
				throw new BailError({ code: 'MEMBER_COMPONENT_TAG', message: 'entity value passed to a member-expression component tag' })
			}
		}
		this.walkChildren(node.children, scope)
	}

	private collectComponentProp(
		propName: string,
		value: t.JSXAttribute['value'],
		scope: Scope,
		entityProps: Record<string, HoleEntityProp>,
		literalProps: Record<string, unknown>,
	): void {
		if (value === null || value === undefined) {
			literalProps[propName] = true // boolean shorthand `<Card flag/>`
			return
		}
		if (t.isStringLiteral(value)) {
			literalProps[propName] = value.value
			return
		}
		const inner = jsxAttrInner(value)
		if (!inner) {
			return
		}
		const ep = entityPathOf(inner, scope) // may throw COMPUTED_MEMBER
		if (ep.kind === 'path') {
			entityProps[propName] = { source: ep.source, path: [...ep.path] }
			return
		}
		if (referencesRoot(inner, scope)) {
			throw new BailError({ code: 'ENTITY_IN_EXPRESSION_PROP', message: `entity value inside a non-path expression prop \`${propName}\`` })
		}
		const lit = evaluateLiteral(inner)
		if (lit.ok) {
			literalProps[propName] = lit.value
		}
		// Non-literal non-entity props are silently omitted (recovered at runtime if needed).
	}

	private walkBindxComponent(kind: ComponentKind, node: t.JSXElement, scope: Scope): void {
		for (const attr of node.openingElement.attributes) {
			if (t.isJSXSpreadAttribute(attr)) {
				this.guardSpread(attr, scope, 'bindx component')
			}
		}
		switch (kind) {
			case 'Field':
				this.consumeAttrLeaf(node, 'field', scope)
				this.walkOtherAttrs(node, new Set(['field', 'children', 'format']), scope)
				return
			case 'Attribute':
				this.consumeAttrLeaf(node, 'field', scope)
				this.walkChildren(node.children, scope)
				this.walkOtherAttrs(node, new Set(['field', 'children', 'format']), scope)
				return
			case 'Show':
				this.consumeAttrLeaf(node, 'field', scope)
				this.walkShowChildren(node.children, scope)
				this.walkOtherAttrs(node, new Set(['field', 'children', 'fallback']), scope)
				return
			case 'HasOne':
				this.walkRelationComponent(node, scope, false)
				return
			case 'HasMany':
				this.walkRelationComponent(node, scope, true)
				return
			case 'If':
				this.walkIf(node, scope)
				return
		}
	}

	private walkIf(node: t.JSXElement, scope: Scope): void {
		for (const name of ['condition', 'then', 'else'] as const) {
			const expr = getAttr(node, name)
			if (expr) {
				this.host.walkValue(expr, scope) // condition + both branches → union
			}
		}
		this.walkOtherAttrs(node, new Set(['condition', 'then', 'else']), scope)
	}

	private walkRelationComponent(node: t.JSXElement, scope: Scope, many: boolean): void {
		const fieldExpr = getAttr(node, 'field')
		const res = fieldExpr ? resolve(fieldExpr, scope) : { kind: 'none' as const }
		if (res.kind !== 'ref') {
			this.walkOtherAttrs(node, new Set(['field', 'children']), scope)
			return
		}
		const params = many ? readHasManyParams(node) : undefined
		const item = many ? consumeMany(res.ref, params) : consumeRelation(res.ref)
		const cb = childrenCallback(node.children)
		if (cb) {
			this.host.walkCallbackWithItem(cb, { node: item, path: [], source: res.ref.source, absPath: res.ref.absPath }, scope)
		}
		this.walkOtherAttrs(node, new Set(['field', 'children', ...(many ? HASMANY_PARAM_KEYS : [])]), scope)
	}

	private walkShowChildren(children: t.JSXElement['children'], scope: Scope): void {
		// Runtime skips function children of <Show>; only plain children are analyzed.
		const only = children.filter(c => !t.isJSXText(c) || c.value.trim() !== '')
		const first = only[0]
		if (only.length === 1 && first && t.isJSXExpressionContainer(first)
			&& (t.isArrowFunctionExpression(first.expression) || t.isFunctionExpression(first.expression))) {
			return
		}
		this.walkChildren(children, scope)
	}

	private walkChildren(children: t.JSXElement['children'], scope: Scope): void {
		for (const child of children) {
			if (t.isJSXElement(child) || t.isJSXFragment(child)) {
				this.walk(child, scope)
			} else if (t.isJSXExpressionContainer(child) && t.isExpression(child.expression)) {
				this.host.walkValue(child.expression, scope)
			} else if (t.isJSXSpreadChild(child) && referencesRoot(child.expression, scope)) {
				throw new BailError({ code: 'ENTITY_SPREAD', message: 'spread of an entity value as a child' })
			}
		}
	}

	private consumeAttrLeaf(node: t.JSXElement, name: string, scope: Scope): void {
		const expr = getAttr(node, name)
		if (!expr) {
			return
		}
		const res = resolve(expr, scope)
		if (res.kind === 'ref') {
			consumeLeaf(res.ref)
		}
	}

	private walkOtherAttrs(node: t.JSXElement, handled: Set<string>, scope: Scope): void {
		for (const attr of node.openingElement.attributes) {
			if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name) || handled.has(attr.name.name)) {
				continue
			}
			const expr = attrExpr(attr)
			if (expr) {
				this.host.walkValue(expr, scope) // extra attrs are plain value slots (leaf)
			}
		}
	}

	private guardSpread(attr: t.JSXSpreadAttribute, scope: Scope, where: string): void {
		if (referencesRoot(attr.argument, scope)) {
			throw new BailError({ code: 'ENTITY_SPREAD', message: `spread of an entity value onto a ${where}` })
		}
	}
}

function readHasManyParams(node: t.JSXElement): StaticHasManyParams {
	const params: Record<string, unknown> = {}
	for (const key of HASMANY_PARAM_KEYS) {
		const attr = findAttr(node, key)
		if (!attr) {
			continue
		}
		if (attr.value === null || attr.value === undefined) {
			params[key] = true // boolean shorthand, e.g. `<HasMany ... totalCount>`
			continue
		}
		if (t.isStringLiteral(attr.value)) {
			params[key] = attr.value.value
			continue
		}
		const expr = t.isJSXExpressionContainer(attr.value) && t.isExpression(attr.value.expression)
			? attr.value.expression
			: null
		const lit = expr ? evaluateLiteral(expr) : { ok: false as const }
		if (!lit.ok) {
			throw new BailError({ code: 'NON_LITERAL_HASMANY_PARAM', message: `<HasMany> ${key} is not a static literal` })
		}
		params[key] = lit.value
	}
	return params
}

function childrenCallback(children: t.JSXElement['children']): t.ArrowFunctionExpression | t.FunctionExpression | null {
	for (const child of children) {
		if (t.isJSXExpressionContainer(child)
			&& (t.isArrowFunctionExpression(child.expression) || t.isFunctionExpression(child.expression))) {
			return child.expression
		}
	}
	return null
}

function getAttr(node: t.JSXElement, name: string): t.Expression | null {
	const attr = findAttr(node, name)
	return attr ? attrExpr(attr) : null
}

function findAttr(node: t.JSXElement, name: string): t.JSXAttribute | null {
	for (const attr of node.openingElement.attributes) {
		if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === name) {
			return attr
		}
	}
	return null
}

function attrExpr(attr: t.JSXAttribute | t.JSXSpreadAttribute): t.Expression | null {
	if (!t.isJSXAttribute(attr) || !attr.value) {
		return null
	}
	if (t.isJSXExpressionContainer(attr.value) && t.isExpression(attr.value.expression)) {
		return attr.value.expression
	}
	return null
}

/** Underlying value node of a JSX attribute (container expression or nested JSX), or null. */
function jsxAttrInner(value: t.JSXAttribute['value']): t.Node | null {
	if (t.isJSXExpressionContainer(value)) {
		return t.isExpression(value.expression) ? value.expression : null
	}
	if (t.isJSXElement(value) || t.isJSXFragment(value)) {
		return value
	}
	return null
}
