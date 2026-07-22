/**
 * Collector-contract discovery (Phase 2.2). A `withCollector(_, contract)` component
 * declares how its callback props are invoked; the analyzer treats such a callback
 * exactly like a `<HasMany>`/`<HasOne>` child (param → root, host captures → paths),
 * so no hole and no lift is needed.
 *
 * Binding resolution (local + relative-import discovery, parse cache) is shared with
 * hole-target-kind classification — see moduleResolve.ts. This module only adds the
 * contract-specific extraction on top of a resolved binding.
 */
import * as t from '@babel/types'
import {
	BindingResolver, ModuleCache, type BindingResolverOptions, type ModuleView,
	findTopLevelVarInit,
} from './moduleResolve.js'
import { unwrap } from './resolve.js'

export { ModuleCache as ContractFileCache } from './moduleResolve.js'

export interface CallbackContract {
	readonly kind: 'itemOf' | 'entityOf'
	readonly field: string
}

/** Key = callback prop name (`children` included) → the relation it is invoked over. */
export type CollectorContract = Record<string, CallbackContract>

/** Resolves a component tag to its declared contract, or null (→ existing hole/bail rules). */
export type ContractLookup = (tag: string) => CollectorContract | null

export type ContractResolverOptions = BindingResolverOptions

export class ContractResolver {
	private readonly binding: BindingResolver
	private readonly memo = new Map<string, CollectorContract | null>()

	constructor(program: t.Program, options: ContractResolverOptions) {
		this.binding = new BindingResolver(program, options)
	}

	resolve(tag: string): CollectorContract | null {
		const cached = this.memo.get(tag)
		if (cached !== undefined) {
			return cached
		}
		const resolved = this.binding.resolve(tag)
		const contract = resolved ? this.contractFromInit(resolved.init, resolved.view) : null
		this.memo.set(tag, contract)
		return contract
	}

	/** Contract from a binding initializer, iff it is `withCollector(_, <contract>)` in `view`. */
	private contractFromInit(init: t.Node, view: ModuleView): CollectorContract | null {
		const call = unwrap(init)
		if (!t.isCallExpression(call) || !t.isIdentifier(call.callee) || !view.withCollector.has(call.callee.name)) {
			return null
		}
		const arg = call.arguments[1]
		return arg && t.isExpression(arg) ? contractFromExpr(arg, view) : null
	}
}

/** Follow an identifier / object literal to a validated contract, or null. */
function contractFromExpr(exprIn: t.Expression, view: ModuleView): CollectorContract | null {
	const expr = unwrap(exprIn)
	if (t.isIdentifier(expr)) {
		const init = findTopLevelVarInit(view.program, expr.name)
		return init ? contractFromExpr(init, view) : null
	}
	if (t.isObjectExpression(expr)) {
		return contractFromObject(expr, view)
	}
	return null
}

function contractFromObject(obj: t.ObjectExpression, view: ModuleView): CollectorContract | null {
	const contract: CollectorContract = {}
	for (const prop of obj.properties) {
		if (!t.isObjectProperty(prop) || prop.computed) {
			return null // spread / method / computed key → not a static contract
		}
		const key = propKeyName(prop.key)
		if (key === null || !t.isExpression(prop.value)) {
			return null
		}
		const entry = callbackContract(prop.value, view)
		if (!entry) {
			return null
		}
		contract[key] = entry
	}
	return contract
}

/** `itemOf('field')` / `entityOf('field')` (combinators imported from bindx, string-literal arg). */
function callbackContract(valueIn: t.Expression, view: ModuleView): CallbackContract | null {
	const value = unwrap(valueIn)
	if (!t.isCallExpression(value) || !t.isIdentifier(value.callee)) {
		return null
	}
	const kind = view.itemOf.has(value.callee.name) ? 'itemOf' : view.entityOf.has(value.callee.name) ? 'entityOf' : null
	if (!kind || value.arguments.length !== 1) {
		return null
	}
	const arg = value.arguments[0]
	return arg && t.isStringLiteral(arg) ? { kind, field: arg.value } : null
}

function propKeyName(key: t.Node): string | null {
	if (t.isIdentifier(key)) {
		return key.name
	}
	return t.isStringLiteral(key) ? key.value : null
}
