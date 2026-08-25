/**
 * Top-level `<Entity>` scan (phase 3). Finds `<Entity>` JSX elements whose tag resolves
 * to a bindx import — anywhere in the file: plain function components (routes), inside
 * `createComponent` render bodies, at any nesting — and analyzes each as an independent
 * emit-or-bail selection ROOT.
 *
 * The root's field map lives under the fixed key `entity` (see `ENTITY_ROOT_KEY`); every
 * hole's `entityProps[*].source` is `'entity'`. `<Entity>`'s own props (`entity`, `by`,
 * `filter`, `create`, `onPersisted`, `queryKey`, `loading`, `error`, `notFound`, …) carry
 * no selection and are never analyzed — only the children closure is.
 */
import * as t from '@babel/types'
import { walkAst } from './astWalk.js'
import { BodyAnalyzer } from './body.js'
import { BailError, internalErrorBail } from './resolve.js'
import { SelNode } from './selectionTree.js'
import type { ImportBindings } from './imports.js'
import type { ContractLookup } from './contracts.js'
import type { TargetKindLookup } from './targetKind.js'
import type { ChainLoc, EntityRootResult } from './types.js'

/** Fixed key under which a compiled `<Entity>` stores its root field map + hole sources. */
export const ENTITY_ROOT_KEY = 'entity'

/** A recognized `<Entity>` element paired with its analysis result (Babel node retained for emit). */
export interface InternalEntityRootResult {
	readonly element: t.JSXElement
	readonly result: EntityRootResult
}

/**
 * Collect every `<Entity>` JSX element whose tag is a bindx `Entity` import binding, plus any
 * `entityLike` forwarding-wrapper elements (see `resolveEntityLikeLocals`). The two are treated
 * identically — the wrapper must forward the injected `compiledSelection` to its inner `<Entity>`
 * via `{...props}`.
 */
export function findEntityElements(
	program: t.Program,
	bindings: ImportBindings,
	entityLikeLocals: ReadonlySet<string> = new Set(),
): t.JSXElement[] {
	const elements: t.JSXElement[] = []
	walkAst(program, node => {
		if (t.isJSXElement(node) && isEntityTag(node.openingElement.name, bindings, entityLikeLocals)) {
			elements.push(node)
		}
	})
	return elements
}

function isEntityTag(name: t.JSXOpeningElement['name'], bindings: ImportBindings, entityLikeLocals: ReadonlySet<string>): boolean {
	return t.isJSXIdentifier(name) && (bindings.entity.has(name.name) || entityLikeLocals.has(name.name))
}

/**
 * Resolve which LOCAL tag names in `program` correspond to the configured `entityLike` component
 * names. Matching prefers an import's ORIGINAL exported name over its local alias (so
 * `import { RefreshableEntity as RE }` still matches when `RefreshableEntity` is configured); a
 * locally-declared component (const/function/class) matches by its declared name. Default/namespace
 * imports carry no matchable exported name and are skipped.
 */
export function resolveEntityLikeLocals(program: t.Program, entityLike: ReadonlySet<string>): Set<string> {
	const locals = new Set<string>()
	if (entityLike.size === 0) {
		return locals
	}
	// Match imports by original exported name, and top-level declarations by declared name.
	for (const node of program.body) {
		if (t.isImportDeclaration(node)) {
			for (const spec of node.specifiers) {
				if (t.isImportSpecifier(spec)) {
					const imported = t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value
					if (entityLike.has(imported)) {
						locals.add(spec.local.name)
					}
				}
			}
			continue
		}
		collectLocalDeclNames(node, entityLike, locals)
	}
	return locals
}

function collectLocalDeclNames(node: t.Statement, entityLike: ReadonlySet<string>, locals: Set<string>): void {
	const decl = t.isExportNamedDeclaration(node) ? node.declaration : node
	if (decl && t.isVariableDeclaration(decl)) {
		for (const d of decl.declarations) {
			if (t.isIdentifier(d.id) && entityLike.has(d.id.name)) {
				locals.add(d.id.name)
			}
		}
		return
	}
	if (decl && (t.isFunctionDeclaration(decl) || t.isClassDeclaration(decl)) && decl.id && entityLike.has(decl.id.name)) {
		locals.add(decl.id.name)
	}
}

export function analyzeEntityRoot(
	element: t.JSXElement,
	bindings: ImportBindings,
	moduleBindings: ReadonlySet<string>,
	lookup: ContractLookup,
	targetKinds: TargetKindLookup,
): EntityRootResult {
	const loc = elementLoc(element)
	const childrenFn = entityChildrenFn(element)
	if (!childrenFn) {
		// Non-function or absent children — the runtime children walk stays; no emit.
		return { loc, bailout: { code: 'ENTITY_NO_FUNCTION_CHILDREN', message: '<Entity> children is not a single inline function' } }
	}

	const rootNode = new SelNode()
	const analyzer = new BodyAnalyzer(bindings, moduleBindings, lookup, targetKinds)
	try {
		analyzer.analyzeRootChildren(childrenFn, rootNode, ENTITY_ROOT_KEY)
	} catch (error) {
		if (error instanceof BailError) {
			return { loc, bailout: error.bailout }
		}
		// Contain an unexpected compiler bug per root: bail (proxy fallback is sound), never crash the build.
		return { loc, bailout: internalErrorBail(error) }
	}

	return { loc, selection: rootNode.toFieldMap(), holes: analyzer.holes }
}

/**
 * The single inline function `<Entity>` renders with. Accepts both the JSX-child form
 * (`<Entity>{e => …}</Entity>`) and the explicit `children={e => …}` attribute; anything
 * else (element children, multiple children, non-function) yields null → bail.
 */
function entityChildrenFn(element: t.JSXElement): t.ArrowFunctionExpression | t.FunctionExpression | null {
	const attrFn = childrenAttrFn(element)
	if (attrFn) {
		return attrFn
	}
	let found: t.ArrowFunctionExpression | t.FunctionExpression | null = null
	for (const child of element.children) {
		if (t.isJSXText(child)) {
			if (child.value.trim() === '') {
				continue
			}
			return null // non-whitespace text alongside → not a clean function-children form
		}
		if (t.isJSXExpressionContainer(child)
			&& (t.isArrowFunctionExpression(child.expression) || t.isFunctionExpression(child.expression))) {
			if (found) {
				return null // more than one function child
			}
			found = child.expression
			continue
		}
		return null // element / spread / non-function expression child
	}
	return found
}

function childrenAttrFn(element: t.JSXElement): t.ArrowFunctionExpression | t.FunctionExpression | null {
	for (const attr of element.openingElement.attributes) {
		if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name) || attr.name.name !== 'children') {
			continue
		}
		if (t.isJSXExpressionContainer(attr.value)
			&& (t.isArrowFunctionExpression(attr.value.expression) || t.isFunctionExpression(attr.value.expression))) {
			return attr.value.expression
		}
		return null // children attribute present but not an inline function
	}
	return null
}

/** True if the element already carries a `compiledSelection` attribute (idempotence guard). */
export function hasCompiledSelectionAttr(element: t.JSXElement): boolean {
	return element.openingElement.attributes.some(
		attr => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'compiledSelection',
	)
}

function elementLoc(element: t.JSXElement): ChainLoc {
	return {
		start: element.start ?? 0,
		end: element.end ?? 0,
		line: element.loc?.start.line ?? 0,
		column: element.loc?.start.column ?? 0,
	}
}
