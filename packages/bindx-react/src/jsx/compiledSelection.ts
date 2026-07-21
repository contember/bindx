/**
 * Compiled-selection contract (v2) and its runtime resolution.
 *
 * The selection compiler emits a {@link CompiledSelection} as the 2nd argument
 * of `.render()`. Phase 1 covered per-prop static field maps; phase 2 adds
 * `holes` — statically-emitted references to nested components that received
 * entity-derived values. Holes are resolved here at collection time through the
 * target's existing runtime selection surface (`getSelection` / `staticRender`),
 * the Relay-fragment-spread equivalent, WITHOUT executing the host render body.
 *
 * Phase 2.1 adds {@link CompiledHole.extraProps}: non-entity values (module-scope
 * bindings, render-scope-free closures) lifted into the hole so a target that
 * invokes them during collection stays oracle-equal — see docs/compiler-plan.md.
 */
import type { ReactNode } from 'react'
import type { SelectionMeta } from '@contember/bindx'
import { SchemaRegistry, SelectionScope, ComponentBrand, driveSelectionScope } from '@contember/bindx'
import type { StaticFieldMap } from '@contember/bindx'
import { createCollectorProxy } from './proxy.js'
import { collectSelection, resolveComponentName } from './analyzer.js'
import { createFragment, createScalarPropMock } from './collectionHelpers.js'
import type { SelectionPropMeta } from './componentBuilder.types.js'
import type { EntityConfig } from './componentFactory.js'

// ============================================================================
// Contract v2
// ============================================================================

/**
 * Precompiled selection injected by the selection compiler. Breaking-change
 * shape within the experiment — hand-write only in tests that simulate emit.
 */
export interface CompiledSelection {
	/** Per implicit entity prop — same {@link StaticFieldMap} as phase 1. */
	props: Record<string, StaticFieldMap>
	/** Nested components that received entity-derived values. */
	holes?: CompiledHole[]
}

/**
 * A nested component composition the compiler could not inline statically.
 * Resolved at collection time through the target's selection surface.
 */
export interface CompiledHole {
	/**
	 * Thunk, not a direct reference — dodges TDZ for components defined later in
	 * the module (same reason runtime collection is lazy).
	 */
	component: () => unknown
	/**
	 * Target prop name → where its value comes from: a host entity prop plus a
	 * member path. Empty path = the root entity prop itself.
	 */
	entityProps: Record<string, { source: string; path: readonly string[] }>
	/**
	 * Statically-literal non-entity props of the JSX element. Non-literal
	 * non-entity props are simply omitted.
	 */
	literalProps?: Record<string, unknown>
	/**
	 * Non-entity props lifted verbatim from the emit site: module-scope values
	 * (imports / top-level bindings) and render-scope-free inline closures. Each
	 * is a thunk (TDZ-safe, same reason as {@link component}) resolved to the real
	 * value at collection time, so a target's `staticRender` that *invokes* one
	 * (e.g. `props.children(entity)`) collects the same fields the oracle would.
	 */
	extraProps?: Record<string, () => unknown>
}

// ============================================================================
// Runtime resolution
// ============================================================================

export interface ApplyCompiledSelectionParams {
	readonly compiled: CompiledSelection
	readonly selectionsMap: Map<string, SelectionPropMeta>
	readonly componentBrand: ComponentBrand
	readonly roles: readonly string[]
	readonly implicitConfigs: [string, EntityConfig][]
	readonly schemaRegistry: SchemaRegistry<Record<string, object>> | null
	readonly componentDisplayName: string
	readonly validateMode: boolean
}

/**
 * Builds `selectionsMap` entries from a compiled selection — seeding one live
 * scope per entity prop from its static field map, resolving every hole into the
 * same scopes, then snapshotting. Replaces the proxy pass entirely; the host
 * render function is never executed.
 */
export function applyCompiledSelection(params: ApplyCompiledSelectionParams): void {
	const { compiled, selectionsMap, componentBrand, roles } = params
	const propScopes = new Map<string, SelectionScope>()

	const scopeFor = (propName: string): SelectionScope => {
		let scope = propScopes.get(propName)
		if (!scope) {
			scope = new SelectionScope()
			propScopes.set(propName, scope)
		}
		return scope
	}

	const ctx: HoleResolutionContext = {
		scopeFor,
		implicitConfigsMap: new Map(params.implicitConfigs),
		schemaRegistry: params.schemaRegistry,
		componentDisplayName: params.componentDisplayName,
		validateMode: params.validateMode,
	}

	// 1. Seed a live (open) scope per entity prop from the static field maps.
	for (const [propName, fieldMap] of Object.entries(compiled.props)) {
		driveSelectionScope(scopeFor(propName), fieldMap)
	}

	// 2. Resolve each hole into the same scopes (fragment-spread equivalent).
	for (const hole of compiled.holes ?? []) {
		resolveHole(hole, ctx)
	}

	// 3. Snapshot every scope that captured fields.
	for (const [propName, scope] of propScopes) {
		if (scope.hasFields()) {
			const selection = scope.toSelectionMeta()
			selectionsMap.set(propName, {
				selection,
				fragment: createFragment(selection, componentBrand, roles),
			})
		}
	}
}

interface HoleResolutionContext {
	readonly scopeFor: (propName: string) => SelectionScope
	readonly implicitConfigsMap: Map<string, EntityConfig>
	readonly schemaRegistry: SchemaRegistry<Record<string, object>> | null
	readonly componentDisplayName: string
	readonly validateMode: boolean
}

/**
 * Resolves one hole: assembles the target's props (entity values replayed from
 * the source scopes + literal props) and feeds them to its selection surface,
 * mirroring `analyzeJsx` order. Errors are contained per hole.
 */
function resolveHole(hole: CompiledHole, ctx: HoleResolutionContext): void {
	let target: unknown
	try {
		target = hole.component()
	} catch (error) {
		reportHoleError(undefined, ctx.componentDisplayName, error)
		return
	}
	if (target === null || (typeof target !== 'object' && typeof target !== 'function')) {
		return
	}

	const props = assembleHoleProps(hole, ctx)

	try {
		if (hasGetSelection(target)) {
			// Entity values carry SCOPE_REF, so getSelection merges into the source
			// scopes as a side effect; the returned fields are irrelevant here.
			target.getSelection(props, collectNested)
		} else if (hasStaticRender(target)) {
			const jsx = target.staticRender(wrapPropsWithScalarFallback(props))
			if (jsx !== null && jsx !== undefined) {
				collectSelection(jsx)
			}
		} else if (ctx.validateMode) {
			// Plain React target: the runtime proxy pass is equally blind here, so
			// compiled behavior stays equivalent — surface the blind spot in dev/CI.
			console.warn(
				`[bindx] <${resolveComponentName(target)}> inside <${ctx.componentDisplayName}> exposes no `
				+ 'selection surface (getSelection/staticRender) — its fields are a selection blind spot.',
			)
		}
	} catch (error) {
		reportHoleError(target, ctx.componentDisplayName, error)
	}
}

/** Real nested-collection walk for `getSelection` targets. */
function collectNested(node: ReactNode): SelectionMeta {
	return collectSelection(node)
}

/**
 * Assembles the target's props: each entity prop is the source prop's collector
 * proxy with the member path replayed via property gets; literal props merge in.
 */
function assembleHoleProps(hole: CompiledHole, ctx: HoleResolutionContext): Record<string, unknown> {
	const props: Record<string, unknown> = { ...hole.literalProps }
	// Lifted values reach the target before entity proxies (which must win on collision).
	for (const [prop, thunk] of Object.entries(hole.extraProps ?? {})) {
		props[prop] = thunk()
	}
	for (const [targetProp, origin] of Object.entries(hole.entityProps)) {
		const proxy = createSourceProxy(origin.source, ctx)
		props[targetProp] = replayPath(proxy, origin.path)
	}
	return props
}

/**
 * Creates the collector proxy for a source entity prop, using the same scope +
 * entity-name + schema config that the proxy pass uses for that prop.
 */
function createSourceProxy(sourceProp: string, ctx: HoleResolutionContext): unknown {
	const scope = ctx.scopeFor(sourceProp)
	const config = ctx.implicitConfigsMap.get(sourceProp)
	const entityName = config?.entityName ?? null
	const registry = config?.schema
		? new SchemaRegistry(config.schema)
		: ctx.schemaRegistry
	return createCollectorProxy(scope, entityName, registry)
}

/** Replays a member path via property gets — identical to the proxy pass. */
function replayPath(root: unknown, path: readonly string[]): unknown {
	let current = root
	for (const key of path) {
		if (current === null || (typeof current !== 'object' && typeof current !== 'function')) {
			return current
		}
		current = (current as Record<string, unknown>)[key]
	}
	return current
}

/**
 * Wraps a staticRender target's props so unknown keys fall back to the tolerant
 * scalar mock (holes carry no children/render-prop closures).
 */
function wrapPropsWithScalarFallback(props: Record<string, unknown>): Record<string, unknown> {
	return new Proxy(props, {
		get(target, key): unknown {
			if (typeof key === 'symbol' || key in target) {
				return Reflect.get(target, key)
			}
			return createScalarPropMock()
		},
	})
}

interface GetSelectionSurface {
	getSelection(props: Record<string, unknown>, collectNested: (node: ReactNode) => SelectionMeta): unknown
}

interface StaticRenderSurface {
	staticRender(props: Record<string, unknown>): ReactNode
}

function hasGetSelection(target: object): target is GetSelectionSurface {
	return 'getSelection' in target && typeof (target as GetSelectionSurface).getSelection === 'function'
}

function hasStaticRender(target: object): target is StaticRenderSurface {
	return 'staticRender' in target && typeof (target as StaticRenderSurface).staticRender === 'function'
}

/**
 * Reports a hole-resolution failure with attribution, matching the
 * report-and-continue policy of `analyzeJsx`'s per-component error handling.
 */
function reportHoleError(target: unknown, hostName: string, error: unknown): void {
	const name = target === undefined ? 'anonymous' : resolveComponentName(target)
	console.error(
		`[bindx] Hole resolution of <${name}> inside <${hostName}> failed — its fields were NOT added to the fetch plan. `
		+ 'Fix the error below; fields it uses may be missing from queries until then.',
		error,
	)
}
