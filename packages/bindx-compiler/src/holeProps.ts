/**
 * Phase-2.1 lifting: classify a hole element's non-entity props (closures, identifiers) into
 * `extraProps` (lifted verbatim) or a bail. A hole target's `staticRender` may INVOKE such a value
 * with a collector proxy during collection, so dropping it can under-fetch — lift when the value is
 * reproducible at the module-scope emit site, bail otherwise (default deny). See docs/compiler-plan.md.
 */
import * as t from '@babel/types'
import { BailError, type Scope, classifyHoleClosure } from './resolve.js'

export type Closure = t.ArrowFunctionExpression | t.FunctionExpression

export interface HoleClosureProp {
	readonly name: string
	readonly fn: Closure
}

export interface HoleIdentifierProp {
	readonly name: string
	readonly ident: t.Identifier
}

export interface HolePropInputs {
	readonly tag: string
	readonly closureProps: ReadonlyArray<HoleClosureProp>
	readonly identifierProps: ReadonlyArray<HoleIdentifierProp>
	readonly childClosure: Closure | null
	readonly scope: Scope
	readonly moduleBindings: ReadonlySet<string>
}

/**
 * Builds a hole's `extraProps` (target prop → value expression, emitted as an arrow thunk), lifting
 * what a target may invoke and bailing on what cannot be reproduced at the emit site.
 */
export function resolveHoleExtraProps(inputs: HolePropInputs): Record<string, t.Expression> {
	const { tag, closureProps, identifierProps, childClosure, scope, moduleBindings } = inputs
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
		liftClosure(name, fn)
	}
	if (childClosure) {
		liftClosure('children', childClosure)
	}
	for (const { name, ident } of identifierProps) {
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
