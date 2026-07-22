/**
 * Emits a CompiledSelection (v2) as a Babel object-literal AST — the 2nd argument the
 * Babel plugin injects into `.render(fn, <here>)`. Shape: `{ v: 2, props: {...}, holes?: [...] }`.
 * Unlike phase 1 this is no longer pure JSON: each hole's `component` is an arrow thunk
 * referencing the target's module-scope identifier.
 */
import * as t from '@babel/types'
import type { AnalyzedHole, StaticFieldMap, StaticFieldNode, StaticSelection } from './types.js'

const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/

function key(name: string): t.Identifier | t.StringLiteral {
	return IDENTIFIER_RE.test(name) ? t.identifier(name) : t.stringLiteral(name)
}

function nodeToAst(node: StaticFieldNode): t.Expression {
	if (node === true) {
		return t.booleanLiteral(true)
	}
	const props: t.ObjectProperty[] = [
		t.objectProperty(t.identifier('fields'), fieldMapToAst(node.fields)),
	]
	if (node.many) {
		props.push(t.objectProperty(t.identifier('many'), t.booleanLiteral(true)))
	}
	if (node.params) {
		props.push(t.objectProperty(t.identifier('params'), t.valueToNode(node.params)))
	}
	return t.objectExpression(props)
}

function fieldMapToAst(map: StaticFieldMap): t.ObjectExpression {
	return t.objectExpression(
		Object.entries(map).map(([name, node]) => t.objectProperty(key(name), nodeToAst(node))),
	)
}

function propsToAst(selection: StaticSelection): t.ObjectExpression {
	return t.objectExpression(
		Object.entries(selection).map(([prop, map]) => t.objectProperty(key(prop), fieldMapToAst(map))),
	)
}

function holeToAst(hole: AnalyzedHole): t.ObjectExpression {
	const properties: t.ObjectProperty[] = [
		// Thunk (not a direct reference) so the runtime resolves the target lazily — TDZ-safe.
		t.objectProperty(t.identifier('component'), t.arrowFunctionExpression([], t.identifier(hole.component))),
		t.objectProperty(t.identifier('entityProps'), t.valueToNode(hole.entityProps)),
	]
	if (hole.literalProps && Object.keys(hole.literalProps).length > 0) {
		properties.push(t.objectProperty(t.identifier('literalProps'), t.valueToNode(hole.literalProps)))
	}
	if (hole.extraProps && Object.keys(hole.extraProps).length > 0) {
		// Each lifted value is wrapped in an arrow thunk (TDZ-safe, resolved at collection time).
		// Deep-clone: the same expression still sits in the original render body — sharing one node
		// object at two tree positions is fragile against later passes (react-refresh, JSX transform).
		const entries = Object.entries(hole.extraProps).map(
			([name, expr]) => t.objectProperty(key(name), t.arrowFunctionExpression([], t.cloneNode(expr, true))),
		)
		properties.push(t.objectProperty(t.identifier('extraProps'), t.objectExpression(entries)))
	}
	return t.objectExpression(properties)
}

export function selectionToAst(selection: StaticSelection, holes: readonly AnalyzedHole[]): t.ObjectExpression {
	const properties: t.ObjectProperty[] = [
		// Version marker: the runtime rejects a literal without `v === 2` and falls back to the proxy pass.
		t.objectProperty(t.identifier('v'), t.numericLiteral(2)),
		t.objectProperty(t.identifier('props'), propsToAst(selection)),
	]
	if (holes.length > 0) {
		properties.push(t.objectProperty(t.identifier('holes'), t.arrayExpression(holes.map(holeToAst))))
	}
	return t.objectExpression(properties)
}

/**
 * Builds the CompiledSelection object literal for a proven `<Entity>` root (phase 3): the root
 * field map lives under the fixed `rootKey`; holes are the same thunk-carrying shape as chains.
 * Emitted separately from the attribute so the plugin can hoist it to a module-scope const —
 * keeping a stable identity across parent renders (inline object literals re-resolve every render).
 */
export function entitySelectionObject(
	rootKey: string,
	selection: StaticFieldMap,
	holes: readonly AnalyzedHole[],
): t.ObjectExpression {
	return selectionToAst({ [rootKey]: selection }, holes)
}

/** Builds the `compiledSelection={<value>}` JSX attribute referencing the given expression. */
export function compiledSelectionAttr(value: t.Expression): t.JSXAttribute {
	return t.jsxAttribute(t.jsxIdentifier('compiledSelection'), t.jsxExpressionContainer(value))
}
