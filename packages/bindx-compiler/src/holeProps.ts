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
import { BailError, type Scope, classifyHoleClosure } from './resolve.js'
import type { TargetKind } from './targetKind.js'

export type Closure = t.ArrowFunctionExpression | t.FunctionExpression

export interface HoleClosureProp {
	readonly name: string
	readonly fn: Closure
}

export interface HoleIdentifierProp {
	readonly name: string
	readonly ident: t.Identifier
}

/**
 * Per-target decision surface: does dropping a given prop risk under-fetch (must run the taint
 * lattice), or is the target provably inert for it (safe drop, no bail)?
 */
export interface HolePropPolicy {
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

export interface HolePropInputs {
	readonly tag: string
	readonly closureProps: ReadonlyArray<HoleClosureProp>
	readonly identifierProps: ReadonlyArray<HoleIdentifierProp>
	readonly childClosure: Closure | null
	readonly scope: Scope
	readonly moduleBindings: ReadonlySet<string>
	readonly policy: HolePropPolicy
}

/**
 * Builds a hole's `extraProps` (target prop → value expression, emitted as an arrow thunk), lifting
 * what a target may invoke, dropping what it provably ignores, and bailing on what cannot be
 * reproduced at the emit site (default deny).
 */
export function resolveHoleExtraProps(inputs: HolePropInputs): Record<string, t.Expression> {
	const { tag, closureProps, identifierProps, childClosure, scope, moduleBindings, policy } = inputs
	const extraProps: Record<string, t.Expression> = {}

	const liftClosure = (name: string, fn: Closure): void => {
		switch (classifyHoleClosure(fn, scope)) {
			case 'drop': return
			case 'lift': extraProps[name] = fn; return // captures nothing from render scope → emit verbatim
			case 'bail':
				throw new BailError({ code: 'FUNCTION_PROP_ON_HOLE', message: `closure ${name} on hole element <${tag}> may be invoked with an entity during collection` })
		}
	}

	for (const { name, fn } of closureProps) {
		if (policy.closureNeedsCheck(name)) {
			liftClosure(name, fn) // target may invoke it → lattice decides lift/drop/bail
		}
		// else: target provably never invokes it → safe drop
	}
	if (childClosure && policy.closureNeedsCheck('children')) {
		liftClosure('children', childClosure)
	}
	for (const { name, ident } of identifierProps) {
		if (!policy.identifierNeedsCheck(name)) {
			continue // target provably ignores it → safe drop
		}
		switch (classifyIdentifierProp(ident.name, scope, moduleBindings)) {
			case 'drop': break
			case 'lift': extraProps[name] = ident; break // real module-scope value reaches the target
			case 'bail':
				throw new BailError({ code: 'RENDER_LOCAL_ON_HOLE', message: `render-local value \`${ident.name}\` passed to hole element <${tag}> may under-fetch` })
		}
	}
	return extraProps
}

/**
 * Taint lattice for a bare identifier passed to a hole (default deny):
 * render-local (incl. shadowing) → bail; inert scalar/.use() param → drop; module-scope → lift.
 */
export function classifyIdentifierProp(name: string, scope: Scope, moduleBindings: ReadonlySet<string>): 'drop' | 'lift' | 'bail' {
	if (scope.locals.has(name)) {
		return 'bail' // render-local const/let (checked first so it wins over a shadowed module name)
	}
	if (scope.scalarParams.has(name) || name === 'undefined') {
		return 'drop' // inert scalar mock at oracle collection — cannot reach a selection scope
	}
	if (moduleBindings.has(name)) {
		return 'lift' // import / top-level binding — pass the real value through unchanged
	}
	return 'bail' // free/unresolvable identifier — could be a field-collecting function
}
