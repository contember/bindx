/**
 * Recognizes `createComponent()....render(fn)` fluent chains and extracts the
 * pieces the analyzer needs: implicit entity prop names, the inline render/condition
 * function literals, and any early (chain-shape) bail.
 */
import * as t from '@babel/types'
import { walkAst } from './astWalk.js'
import type { ImportBindings } from './imports.js'
import type { Bailout } from './types.js'

export interface Chain {
	/** The `.render(...)` call — the Babel plugin injects the 2nd argument here. */
	readonly renderCall: t.CallExpression
	readonly entityProps: readonly string[]
	/** Inline render function literal, or null when it could not be resolved inline. */
	readonly renderFn: t.ArrowFunctionExpression | t.FunctionExpression | null
	/** Inline `.if(fn)` condition function literal, if present. */
	readonly conditionFn: t.ArrowFunctionExpression | t.FunctionExpression | null
	/** A chain-shape bail (interfaces mode, dynamic entity name, non-inline fn). */
	readonly earlyBail: Bailout | null
}

function asInlineFn(node: t.Node | undefined): t.ArrowFunctionExpression | t.FunctionExpression | null {
	if (node && (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node))) {
		return node
	}
	return null
}

export function findChains(program: t.Program, bindings: ImportBindings): Chain[] {
	const chains: Chain[] = []

	walkAst(program, node => {
		if (!isRenderCall(node)) {
			return
		}
		const methods = collectChainMethods(node, bindings)
		if (!methods) {
			return
		}
		chains.push(buildChain(node, methods))
	})

	return chains
}

interface MethodCall {
	readonly name: string
	readonly call: t.CallExpression
}

function isRenderCall(node: t.Node): node is t.CallExpression {
	return t.isCallExpression(node)
		&& t.isMemberExpression(node.callee)
		&& !node.callee.computed
		&& t.isIdentifier(node.callee.property)
		&& node.callee.property.name === 'render'
}

/** Walks the fluent chain down to `createComponent(...)`; returns null if not our chain. */
function collectChainMethods(renderCall: t.CallExpression, bindings: ImportBindings): MethodCall[] | null {
	const methods: MethodCall[] = []
	let node: t.Node = renderCall
	while (t.isCallExpression(node) && t.isMemberExpression(node.callee) && !node.callee.computed && t.isIdentifier(node.callee.property)) {
		methods.push({ name: node.callee.property.name, call: node })
		node = node.callee.object
	}
	if (t.isCallExpression(node) && t.isIdentifier(node.callee) && bindings.createComponent.has(node.callee.name)) {
		return methods
	}
	return null
}

function buildChain(renderCall: t.CallExpression, methods: MethodCall[]): Chain {
	const entityProps: string[] = []
	let renderFn: t.ArrowFunctionExpression | t.FunctionExpression | null = null
	let conditionFn: t.ArrowFunctionExpression | t.FunctionExpression | null = null
	let earlyBail: Bailout | null = null

	const bail = (b: Bailout): void => {
		if (!earlyBail) {
			earlyBail = b
		}
	}

	for (const { name, call } of methods) {
		const args = call.arguments
		switch (name) {
			case 'interfaces':
				bail({ code: 'INTERFACES_MODE', message: '.interfaces() mode is not statically analyzable (v1)' })
				break
			case 'entity': {
				if (args.length >= 3) {
					break // explicit selector — already static, nothing to collect
				}
				const nameArg = args[0]
				if (t.isStringLiteral(nameArg)) {
					entityProps.push(nameArg.value)
				} else {
					bail({ code: 'DYNAMIC_ENTITY_NAME', message: '.entity() name must be a string literal' })
				}
				break
			}
			case 'render': {
				renderFn = asInlineFn(args[0])
				if (!renderFn) {
					bail({ code: 'EXPLICIT_RENDER_FN', message: '.render() argument is not an inline function literal' })
				}
				break
			}
			case 'if': {
				conditionFn = asInlineFn(args[0])
				if (!conditionFn) {
					bail({ code: 'EXPLICIT_RENDER_FN', message: '.if() argument is not an inline function literal' })
				}
				break
			}
			default:
				break // props / use / mock / slots / roles — no effect on analysis
		}
	}

	return { renderCall, entityProps, renderFn, conditionFn, earlyBail }
}
