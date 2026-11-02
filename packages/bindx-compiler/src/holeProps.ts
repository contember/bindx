/**
 * Phase-2.1 lifting + phase-3.1 target-kind policy: classify a hole element's non-entity props
 * (closures, identifiers) into `extraProps` (lifted verbatim), a safe drop, or a bail. A hole
 * target's `staticRender` may INVOKE such a value with a collector proxy during collection, so
 * dropping it can under-fetch — but only IF the target actually reads/invokes that prop. The
 * `HolePropPolicy` (derived from the classified target kind) says which props could under-fetch;
 * the rest are dropped with no bail. Uncertain props still go through the taint lattice (default
 * deny). See docs/compiler-plan.md (Phase 2.1 / 3.1).
 */
import * as t from '@babel/types'
import { walkAst } from './astWalk.js'
import { BailError, type Scope, classifyHoleClosure, unwrap } from './resolve.js'
import type { ModuleScope } from './bindings.js'
import type { TargetKind } from './targetKind.js'

export type Closure = t.ArrowFunctionExpression | t.FunctionExpression

export interface HoleClosureProp {
	readonly name: string
	readonly fn: Closure
}

/** A non-closure, non-literal prop value (`renderItem={renderers.author}`, `{renderTag}`). */
export interface HoleValueProp {
	readonly name: string
	readonly value: t.Expression
}

/**
 * Per-target decision surface: does dropping a given prop risk under-fetch (must run the taint
 * lattice), or is the target provably inert for it (safe drop, no bail)?
 */
interface HolePropPolicy {
	closureNeedsCheck(name: string): boolean
	identifierNeedsCheck(name: string): boolean
}

const CHECK_ALL: HolePropPolicy = { closureNeedsCheck: () => true, identifierNeedsCheck: () => true }
const CHECK_NONE: HolePropPolicy = { closureNeedsCheck: () => false, identifierNeedsCheck: () => false }

/** Derive the hole-prop policy for a classified target kind (default deny → check everything). */
export function holePolicyFor(kind: TargetKind): HolePropPolicy {
	switch (kind.kind) {
		case 'createComponent':
			// getSelection never invokes function slots (analyzeJsx ignores functions) → closures always
			// safe. A slot passed a bare identifier may hold JSX → check identifiers named as slots.
			return {
				closureNeedsCheck: () => false,
				identifierNeedsCheck: name => kind.slots === 'unknown' || kind.slots.has(name),
			}
		case 'plain':
			return CHECK_NONE // no selection surface → runtime is blind to every non-entity prop
		case 'collectorStatic': {
			const referenced = kind.referenced
			const needs = (name: string): boolean => referenced === 'all' || referenced.has(name)
			return { closureNeedsCheck: needs, identifierNeedsCheck: needs }
		}
		case 'unknown':
			return CHECK_ALL
	}
}

interface HolePropInputs {
	readonly tag: string
	readonly closureProps: ReadonlyArray<HoleClosureProp>
	readonly valueProps: ReadonlyArray<HoleValueProp>
	readonly scope: Scope
	readonly moduleScope: ModuleScope
	readonly policy: HolePropPolicy
}

/**
 * Builds a hole's `extraProps` (target prop → value expression, emitted as an arrow thunk), lifting
 * what a target may invoke, dropping what it provably ignores, and bailing on what cannot be
 * reproduced at the emit site (default deny).
 */
export function resolveHoleExtraProps(inputs: HolePropInputs): Record<string, t.Expression> {
	const { tag, closureProps, valueProps, scope, moduleScope, policy } = inputs
	const extraProps: Record<string, t.Expression> = {}

	for (const { name, fn } of closureProps) {
		if (!policy.closureNeedsCheck(name)) {
			continue // target provably never invokes it → safe drop
		}
		switch (classifyHoleClosure(fn, scope, moduleScope)) {
			case 'drop': break
			case 'lift': extraProps[name] = fn; break // captures nothing from render scope → emit verbatim
			case 'bail':
				throw new BailError({ code: 'FUNCTION_PROP_ON_HOLE', message: `closure ${name} on hole element <${tag}> may be invoked with an entity during collection` })
		}
	}
	for (const { name, value } of valueProps) {
		if (!policy.identifierNeedsCheck(name)) {
			continue // target provably ignores it → safe drop
		}
		switch (classifyValueProp(value, scope, moduleScope)) {
			case 'drop': break
			case 'lift': extraProps[name] = value; break // the real module-scope value reaches the target
			case 'bail':
				throw new BailError({ code: 'RENDER_LOCAL_ON_HOLE', message: `value of \`${name}\` passed to hole element <${tag}> may under-fetch` })
		}
	}
	return extraProps
}

/**
 * Taint lattice for a non-literal value passed to a hole (default deny): a primitive-producing
 * expression or an inert scalar/.use() param → drop; an identifier or member chain rooted at an
 * unshadowed module binding → lift; anything else (render-local, call result, …) → bail.
 */
function classifyValueProp(valueIn: t.Expression, scope: Scope, moduleScope: ModuleScope): 'drop' | 'lift' | 'bail' {
	const value = unwrap(valueIn)
	if (isPrimitiveValued(value)) {
		return 'drop' // a primitive cannot be invoked with a collector proxy
	}
	let root: t.Node = value
	while ((t.isMemberExpression(root) || t.isOptionalMemberExpression(root)) && !root.computed) {
		root = unwrap(root.object)
	}
	if (t.isIdentifier(root)) {
		if (scope.locals.has(root.name)) {
			return 'bail' // render-local const/let (checked first so it wins over a shadowed module name)
		}
		if (scope.scalarParams.has(root.name) || root.name === 'undefined') {
			return 'drop' // inert scalar mock at oracle collection — cannot reach a selection scope
		}
	}
	// Re-evaluated at collection time from module scope: must run no code and read only module names.
	return evaluatesWithoutCalls(valueIn) && !moduleScope.capturesEnclosingScope(valueIn) ? 'lift' : 'bail'
}

/** True when evaluating `value` runs no code (nested function bodies are not evaluated). */
function evaluatesWithoutCalls(value: t.Expression): boolean {
	let runsCode = false
	walkAst(value, node => {
		if (t.isFunction(node)) {
			return 'skip'
		}
		if (t.isCallExpression(node) || t.isOptionalCallExpression(node) || t.isNewExpression(node)
			|| t.isTaggedTemplateExpression(node) || t.isAwaitExpression(node) || t.isYieldExpression(node)
			|| t.isAssignmentExpression(node) || t.isUpdateExpression(node) || t.isJSXElement(node) || t.isJSXFragment(node)) {
			runsCode = true
			return 'stop'
		}
	})
	return !runsCode
}

/** Expressions whose value is always a primitive (never a function a target could invoke). */
function isPrimitiveValued(node: t.Node): boolean {
	if (t.isStringLiteral(node) || t.isNumericLiteral(node) || t.isBooleanLiteral(node) || t.isNullLiteral(node)
		|| t.isTemplateLiteral(node) || t.isBigIntLiteral(node) || t.isUnaryExpression(node) || t.isBinaryExpression(node)) {
		return true
	}
	if (t.isConditionalExpression(node)) {
		return isPrimitiveValued(unwrap(node.consequent)) && isPrimitiveValued(unwrap(node.alternate))
	}
	if (t.isLogicalExpression(node)) {
		return isPrimitiveValued(unwrap(node.left)) && isPrimitiveValued(unwrap(node.right))
	}
	return false
}
