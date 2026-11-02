/**
 * JSX walking for the body analyzer: recognized bindx components (Field/Attribute/
 * Show/HasOne/HasMany/If), host elements (attribute values are plain leaf slots),
 * and unknown components (children analyzed; entity-rooted non-children props bail).
 */
import * as t from '@babel/types'
import type { ComponentKind, ImportBindings } from './imports.js'
import {
	BailError, type RootRef, type Scope, consumeMany, consumeRelation, consumeResolution,
	entityPathOf, evaluateLiteral, itemRefOf, referencesRoot, resolve,
} from './resolve.js'
import { type Closure, type HoleClosureProp, type HoleValueProp, holePolicyFor, resolveHoleExtraProps } from './holeProps.js'
import type { ModuleScope } from './bindings.js'
import type { CollectorContract, ContractLookup } from './contracts.js'
import type { TargetKindLookup } from './targetKind.js'
import type { AnalyzedHole, HoleEntityProp } from './types.js'

function asClosure(node: t.Node | null): Closure | null {
	return node && (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) ? node : null
}

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
		private readonly moduleScope: ModuleScope,
		private readonly contracts: ContractLookup,
		private readonly targetKinds: TargetKindLookup,
		/** Analyzing an `<Entity>` root: the runtime walk there also keeps what components return. */
		private readonly isSelectionRoot: boolean,
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
	 * analyzed (not part of the hole). Non-entity props that a target could invoke with a
	 * collector proxy (module-scope values, render-scope-free closures) are lifted verbatim
	 * into the hole's `extraProps` so compiled ≡ oracle by construction.
	 */
	private walkComponentElement(tag: string, node: t.JSXElement, scope: Scope): void {
		// A render-local binding shadowing the tag is not the module component the contract belongs to.
		const contract = this.moduleScope.isModuleBindingAt(tag, node) ? this.contracts(tag) : null
		if (contract) {
			this.walkContractComponent(tag, node, contract, scope)
			return
		}

		const entityProps: Record<string, HoleEntityProp> = {}
		const literalProps: Record<string, unknown> = {}
		const closureProps: HoleClosureProp[] = []
		const valueProps: HoleValueProp[] = []
		const collected = { entityProps, literalProps, closureProps, valueProps }

		for (const attr of node.openingElement.attributes) {
			if (t.isJSXSpreadAttribute(attr)) {
				this.guardSpread(attr, scope, 'component')
				continue
			}
			if (!t.isJSXIdentifier(attr.name)) {
				continue
			}
			if (attr.name.name === 'children') {
				// The attribute form of children: analyzed like the JSX child it stands for.
				this.collectChildrenValue(jsxAttrInner(attr.value), scope, collected)
				continue
			}
			const fn = asClosure(jsxAttrInner(attr.value))
			if (fn) {
				closureProps.push({ name: attr.name.name, fn }) // hole-classified below (lift/drop/bail)
				continue
			}
			this.collectComponentProp(attr.name.name, attr.value, scope, collected)
		}
		this.collectChildrenValue(soleChildExpression(node.children), scope, collected)

		if (Object.keys(entityProps).length > 0) {
			if (!this.moduleScope.isModuleBindingAt(tag, node)) {
				// Tag isn't unambiguously a module binding → a module-scope thunk could reference the wrong value.
				throw new BailError({ code: 'ENTITY_ESCAPES_TO_COMPONENT', message: `component <${tag}> does not resolve to a module binding` })
			}
			// Classify the target so provably-inert props (render-locals, function children on a
			// createComponent/plain target, unreferenced staticRender props) drop without bailing.
			const policy = holePolicyFor(this.targetKinds(tag))
			// JSX children are not passed to the hole: a staticRender that reads them (e.g. clones the
			// entity into them) would collect through values the replay cannot reproduce.
			if (hasJsxChildren(node) && policy.closureNeedsCheck('children')) {
				throw new BailError({ code: 'RENDER_LOCAL_ON_HOLE', message: `JSX children of hole element <${tag}> may be read by its selection surface` })
			}
			const extraProps = resolveHoleExtraProps({ tag, closureProps, valueProps, scope, moduleScope: this.moduleScope, policy })
			this.host.addHole({
				component: tag,
				entityProps,
				literalProps: Object.keys(literalProps).length > 0 ? literalProps : undefined,
				extraProps: Object.keys(extraProps).length > 0 ? extraProps : undefined,
			})
		} else {
			// Not a hole: a closure prop capturing an entity root would escape into the element
			// (the runtime cannot see it either) — preserve the conservative bail.
			// A children closure is walked with the children below (its captures are recorded there).
			for (const { name, fn } of closureProps) {
				if (name !== 'children' && referencesRoot(fn, scope)) {
					throw new BailError({ code: 'ENTITY_IN_EXPRESSION_PROP', message: `entity value inside a function prop of <${tag}>` })
				}
			}
		}

		this.walkChildren(node.children, scope) // the `children` slot is analyzed at runtime
	}

	/** A non-JSX children value: a closure or a value the target may invoke (`{renderItem}`). */
	private collectChildrenValue(value: t.Node | null, scope: Scope, collected: CollectedProps): void {
		if (value === null || t.isJSXElement(value) || t.isJSXFragment(value)) {
			if (value !== null) {
				this.host.walkValue(value, scope)
			}
			return
		}
		const fn = asClosure(value)
		if (fn) {
			collected.closureProps.push({ name: 'children', fn })
			return
		}
		if (t.isExpression(value) && !referencesRoot(value, scope)) {
			collected.valueProps.push({ name: 'children', value })
		}
	}

	/**
	 * A component whose tag declares a collector contract (`withCollector(_, { cb: itemOf('field') })`).
	 * It forms NO hole: each contract entry's callback is analyzed exactly like a <HasMany>/<HasOne>
	 * child — its first param becomes a root at the relation, host captures inside it are ordinary
	 * paths. The contract's derived staticRender provably never invokes non-contract function props,
	 * so those are dropped with no safety bail (removing FUNCTION_PROP_ON_HOLE for contract targets).
	 */
	private walkContractComponent(_tag: string, node: t.JSXElement, contract: CollectorContract, scope: Scope): void {
		const fieldProps = new Set<string>()
		const callbackProps = new Set<string>()
		for (const [cbName, entry] of Object.entries(contract)) {
			callbackProps.add(cbName)
			fieldProps.add(entry.field)
		}

		for (const [cbName, entry] of Object.entries(contract)) {
			const fieldExpr = getAttr(node, entry.field)
			const res = fieldExpr ? resolve(fieldExpr, scope) : { kind: 'none' as const }
			if (res.kind !== 'ref') {
				if (fieldExpr && referencesRoot(fieldExpr, scope)) {
					throw new BailError({ code: 'UNCLASSIFIED', message: `contract field \`${entry.field}\` is not a plain entity path` })
				}
				continue // relation not resolvable → derived staticRender collects nothing for this entry
			}
			const isMany = entry.kind === 'itemOf'
			const item = isMany ? consumeMany(res.ref) : consumeRelation(res.ref)
			const cb = this.contractCallback(node, cbName)
			if (cb) {
				const itemRef = isMany ? itemRefOf(res.ref, item) : { node: item, path: [], source: res.ref.source, absPath: res.ref.absPath }
				this.host.walkCallbackWithItem(cb, itemRef, scope)
			}
			// Missing callback → relation only (already recorded by consume*), mirroring the runtime guard.
		}

		for (const attr of node.openingElement.attributes) {
			if (t.isJSXSpreadAttribute(attr)) {
				this.guardSpread(attr, scope, 'contract component')
				continue
			}
			if (!t.isJSXIdentifier(attr.name)) {
				continue
			}
			const name = attr.name.name
			if (name === 'children' || fieldProps.has(name) || callbackProps.has(name)) {
				continue // contract field / callback props handled above
			}
			if (asClosure(jsxAttrInner(attr.value))) {
				continue // non-contract function prop: the derived staticRender never invokes it → safe drop
			}
			const expr = attrExpr(attr)
			if (expr) {
				this.host.walkValue(expr, scope) // entity props not referenced by the contract → touched leaves
			}
		}

		if (!callbackProps.has('children')) {
			this.walkChildren(node.children, scope) // plain children (not a contract callback)
		}
	}

	/** The inline closure a contract entry is invoked with; any other callback value bails. */
	private contractCallback(node: t.JSXElement, cbName: string): t.ArrowFunctionExpression | t.FunctionExpression | null {
		const callback = cbName === 'children' ? childrenSlot(node) : attrSlot(node, cbName)
		if (callback.kind === 'other') {
			throw new BailError({ code: 'FUNCTION_PROP_ON_HOLE', message: `contract callback \`${cbName}\` is not an inline function` })
		}
		return callback.kind === 'closure' ? callback.fn : null
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

	private collectComponentProp(propName: string, value: t.JSXAttribute['value'], scope: Scope, collected: CollectedProps): void {
		const { entityProps, literalProps, valueProps } = collected
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
		// JSX-element/fragment prop (`draftSlot={<X ... />}`): analyze like children, emit nothing.
		// The oracle walks it via the target's slot/staticRender proxies → this yields an equal-or-superset union.
		if (t.isJSXElement(inner) || t.isJSXFragment(inner)) {
			this.host.walkValue(inner, scope)
			return
		}
		// `cond.*` DSL in a prop (`if={cond.eq(cell.kind, 'promo')}`): the only selection it carries
		// is the FieldRefs in its args (verified against Case/If getSelection). Record them, emit nothing.
		if (this.isCondCall(inner)) {
			this.host.walkValue(inner, scope)
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
		const lit = t.isIdentifier(inner) ? { ok: false as const } : evaluateLiteral(inner)
		if (lit.ok) {
			literalProps[propName] = lit.value
			return
		}
		if (t.isExpression(inner)) {
			valueProps.push({ name: propName, value: inner }) // deferred to hole classification (lift / drop / bail)
		}
	}

	/** True for a recognized `cond.method(...)` call (condition DSL) in a prop position. */
	private isCondCall(node: t.Node): boolean {
		if (!t.isCallExpression(node) && !t.isOptionalCallExpression(node)) {
			return false
		}
		const callee = node.callee
		return t.isMemberExpression(callee) && !callee.computed
			&& t.isIdentifier(callee.object) && this.bindings.cond.has(callee.object.name)
	}

	private walkBindxComponent(kind: ComponentKind, node: t.JSXElement, scope: Scope): void {
		for (const attr of node.openingElement.attributes) {
			if (t.isJSXSpreadAttribute(attr)) {
				this.guardSpread(attr, scope, 'bindx component')
			}
		}
		switch (kind) {
			case 'Field':
			case 'Attribute':
			case 'Show':
				// The runtime never invokes a render-function child during collection; everything
				// else on the element is evaluated during render (over-approximation is sound).
				this.consumeAttrLeaf(node, 'field', scope)
				this.walkNonFunctionChildren(node.children, scope)
				this.walkOtherAttrs(node, new Set(attrSlot(node, 'children').kind === 'closure' ? ['field', 'children'] : ['field']), scope)
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
			if (referencesRoot(node, scope)) {
				throw new BailError({ code: 'UNCLASSIFIED', message: 'relation component field is not a plain entity path' })
			}
			return // no entity reaches this element → nothing it collects belongs to this selection
		}
		if (many && this.isSelectionRoot && HASMANY_PARAM_KEYS.some(key => findAttr(node, key) !== null)) {
			// The root walk keeps <HasMany>'s returned, param-aliased relation next to the plain one;
			// a field map holds one node per field. Inside a component the runtime ignores params.
			throw new BailError({ code: 'HASMANY_PARAMS_AT_ROOT', message: '<HasMany> with params in an <Entity> root' })
		}
		const item = many ? consumeMany(res.ref) : consumeRelation(res.ref)
		const children = childrenSlot(node)
		if (children.kind === 'other') {
			// The runtime invokes whatever `children` holds with the related entity.
			throw new BailError({ code: 'UNCLASSIFIED', message: 'relation component children is not an inline function' })
		}
		if (children.kind === 'closure') {
			const itemRef = many ? itemRefOf(res.ref, item) : { node: item, path: [], source: res.ref.source, absPath: res.ref.absPath }
			this.host.walkCallbackWithItem(children.fn, itemRef, scope)
		}
		this.walkOtherAttrs(node, new Set(['field', 'children']), scope) // params are evaluated during render too
	}

	private walkNonFunctionChildren(children: t.JSXElement['children'], scope: Scope): void {
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
		if (res.kind === 'none') {
			this.host.walkValue(expr, scope) // e.g. a conditional: every branch is a candidate field
			return
		}
		consumeResolution(res)
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

interface CollectedProps {
	readonly entityProps: Record<string, HoleEntityProp>
	readonly literalProps: Record<string, unknown>
	readonly closureProps: HoleClosureProp[]
	readonly valueProps: HoleValueProp[]
}

type CallbackSlot =
	| { readonly kind: 'none' }
	| { readonly kind: 'closure'; readonly fn: Closure }
	| { readonly kind: 'other' }

/** What a callback slot holds: nothing, an inline closure, or anything else. */
function slotOf(value: t.Node | null): CallbackSlot {
	if (value === null) {
		return { kind: 'none' }
	}
	const fn = asClosure(value)
	return fn ? { kind: 'closure', fn } : { kind: 'other' }
}

function attrSlot(node: t.JSXElement, name: string): CallbackSlot {
	const attr = findAttr(node, name)
	return attr ? slotOf(jsxAttrInner(attr.value) ?? attr) : { kind: 'none' }
}

/** The element's `children`, from the attribute or the JSX children (both at once is ambiguous). */
function childrenSlot(node: t.JSXElement): CallbackSlot {
	const attr = attrSlot(node, 'children')
	const meaningful = node.children.filter(child => !t.isJSXText(child) || child.value.trim() !== '')
	if (meaningful.length === 0) {
		return attr
	}
	if (attr.kind !== 'none' || meaningful.length > 1) {
		return { kind: 'other' }
	}
	const only = meaningful[0]
	return only && t.isJSXExpressionContainer(only) && t.isExpression(only.expression)
		? slotOf(only.expression)
		: { kind: 'other' }
}

/** True when the element's children (or `children` attribute) include JSX rather than a single closure/value. */
function hasJsxChildren(node: t.JSXElement): boolean {
	const attr = findAttr(node, 'children')
	const attrValue = attr ? jsxAttrInner(attr.value) : null
	if (attrValue && (t.isJSXElement(attrValue) || t.isJSXFragment(attrValue))) {
		return true
	}
	const nonText = node.children.filter(child => !t.isJSXText(child)) // text is a primitive string
	if (nonText.length === 0) {
		return false
	}
	const sole = soleChildExpression(node.children)
	// A sole closure/value child is classified with the props instead.
	return !(sole !== null && nonText.length === 1 && !t.isJSXElement(sole) && !t.isJSXFragment(sole))
}

/** The single expression child (`{x}`) of an element, or null when children are absent or JSX. */
function soleChildExpression(children: t.JSXElement['children']): t.Expression | null {
	const meaningful = children.filter(child => !t.isJSXText(child) || child.value.trim() !== '')
	const only = meaningful[0]
	return meaningful.length === 1 && only && t.isJSXExpressionContainer(only) && t.isExpression(only.expression)
		? only.expression
		: null
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
