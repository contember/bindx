/**
 * Emits a StaticSelection as a Babel object-literal AST — the 2nd argument the
 * Babel plugin injects into `.render(fn, <here>)`.
 */
import * as t from '@babel/types'
import type { StaticFieldMap, StaticFieldNode, StaticSelection } from './types.js'

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

export function selectionToAst(selection: StaticSelection): t.ObjectExpression {
	return t.objectExpression(
		Object.entries(selection).map(([prop, map]) => t.objectProperty(key(prop), fieldMapToAst(map))),
	)
}
