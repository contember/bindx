/**
 * Emits a CompiledSelection (v2) as a Babel object-literal AST — the 2nd argument the
 * Babel plugin injects into `.render(fn, <here>)`. Shape: `{ props: {...}, holes?: [...] }`.
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
	return t.objectExpression(properties)
}

export function selectionToAst(selection: StaticSelection, holes: readonly AnalyzedHole[]): t.ObjectExpression {
	const properties: t.ObjectProperty[] = [
		t.objectProperty(t.identifier('props'), propsToAst(selection)),
	]
	if (holes.length > 0) {
		properties.push(t.objectProperty(t.identifier('holes'), t.arrayExpression(holes.map(holeToAst))))
	}
	return t.objectExpression(properties)
}
