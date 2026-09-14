/**
 * Component factory - builds React components with bindx selection metadata.
 *
 * This module handles the actual component creation, including:
 * - Building React components with selection metadata
 * - Implicit selection collection from JSX
 * - Fragment creation
 * - Selection provider interface
 */

import type { ReactNode } from 'react'
import { memo } from 'react'
import type {
	FluentFragment,
	SelectionMeta,
	SelectionBuilder,
	AnyBrand,
	SchemaDefinition,
} from '@contember/bindx'
import {
	SchemaRegistry,
	SELECTION_META,
	ComponentBrand,
	createSelectionBuilder,
	SelectionScope,
} from '@contember/bindx'
import type {
	SelectionPropMeta,
} from './componentBuilder.types.js'
import type { SelectionProvider, SelectionFieldMeta } from './types.js'
import { FIELD_REF_META, BINDX_COMPONENT, SCOPE_REF } from './types.js'
import { createCollectorProxy } from './proxy.js'
import { collectSelection } from './analyzer.js'
import { createFragment, createScalarPropMock } from './collectionHelpers.js'
import { applyCompiledSelection, isValidCompiledSelection, type CompiledSelection } from './compiledSelection.js'
import { type Condition, evaluateCondition } from './conditions.js'
import { useRefSubscription } from '../hooks/useFields.js'

// ============================================================================
// Symbols
// ============================================================================

/**
 * Marker symbol for identifying components created with createComponent
 */
export const COMPONENT_MARKER = Symbol('BINDX_COMPONENT')

/**
 * Symbol for storing component brand on the component
 */
export const COMPONENT_BRAND = Symbol('COMPONENT_BRAND')

/**
 * Symbol for stored selection metadata
 */
export const COMPONENT_SELECTIONS = Symbol('COMPONENT_SELECTIONS')

// ============================================================================
// Static Selection Validation
// ============================================================================

/**
 * When enabled, components carrying a precompiled static selection ALSO run the
 * runtime proxy pass and warn on any per-prop mismatch. Trust-building mode for
 * dev/CI; off by default so production skips the proxy pass entirely.
 */
let staticSelectionValidationEnabled = false

/**
 * Enables or disables static-selection validate mode (module-level flag).
 */
export function setStaticSelectionValidation(enabled: boolean): void {
	staticSelectionValidationEnabled = enabled
}

/** Reads the module-level validate-mode flag (used by <Entity>'s root compilation). */
export function isStaticSelectionValidationEnabled(): boolean {
	return staticSelectionValidationEnabled
}

/** Killswitch: when off, all consumers ignore compiled literals and use the runtime proxy path. */
let compiledSelectionsEnabled = true

/** Disables compiled selections at runtime — incident mitigation without a rebuild. */
export function setCompiledSelectionsEnabled(enabled: boolean): void {
	compiledSelectionsEnabled = enabled
}

/** Reads the module-level compiled-selections killswitch (used by both consumers). */
export function isCompiledSelectionsEnabled(): boolean {
	return compiledSelectionsEnabled
}

// ============================================================================
// Entity Config (Runtime)
// ============================================================================

export interface EntityConfig {
	readonly entityName: string | null  // null for interface-based props
	readonly selector?: (builder: SelectionBuilder<object>) => SelectionBuilder<object, object, object>
	readonly isInterface?: boolean
	readonly schema?: SchemaDefinition<Record<string, object>>
}

// ============================================================================
// Render Props Transformation
// ============================================================================

/**
 * Converts entity ref props to accessors while subscribing with one fixed hook.
 */
function readProperty(target: object, name: string): unknown {
	return Reflect.get(target, name)
}

function useRenderProps<TProps extends object>(props: TProps, entityPropNames: string[]): TProps {
	const refs = entityPropNames.map(name => readProperty(props, name))
	const accessors = useRefSubscription(refs)
	const accessorProps = Object.fromEntries(
		entityPropNames.map((name, index) => [name, accessors[index]]),
	)
	return Object.assign({}, props, accessorProps)
}

// ============================================================================
// Component Building
// ============================================================================

/**
 * Builds a bindx component from entity configs and render function.
 *
 * Note: Implicit selection collection is deferred (lazy) to avoid TDZ errors
 * when components reference other components defined later in the same file.
 */
export function buildComponent<TProps extends object>(
	entityConfigs: Map<string, EntityConfig>,
	roles: readonly string[],
	renderFn: (props: TProps) => ReactNode,
	hasInterfacesMode: boolean,
	schemaRegistry: SchemaRegistry<Record<string, object>> | null,
	conditionFn: ((props: TProps) => Condition) | null,
	slotNames: readonly string[],
	useFns: readonly ((props: TProps) => object)[],
	mockValues: Record<string, unknown>,
	compiled: CompiledSelection | null,
): unknown {
	const selectionsMap = new Map<string, SelectionPropMeta>()
	const componentDisplayName = `BindxComponent(${[...entityConfigs.keys()].join(', ')})`

	// Generate unique brand for this component
	const componentBrand = new ComponentBrand(`component_${Math.random().toString(36).slice(2)}`)

	// 1. Process explicit entities (those with selectors) - these are safe to do eagerly
	for (const [propName, config] of entityConfigs) {
		if (config.selector) {
			const builder = createSelectionBuilder<object>()
			const resultBuilder = config.selector(builder)
			const selection = resultBuilder[SELECTION_META]

			selectionsMap.set(propName, {
				selection,
				fragment: createFragment(selection, componentBrand, roles),
			})
		}
	}

	// Every entity prop is subscribed, selector or not: accessor identity is stable, so a
	// memo()-wrapped component only learns about its entity through its own subscription.
	// Interface props are appended during lazy collection, before the first runtime render.
	const entityPropNames = [...entityConfigs.keys()]

	// Selector-backed props are the only ones step 1 seeds into selectionsMap; anything
	// else there came from a collection pass and must not survive a reset.
	const explicitEntityPropNames = [...entityConfigs.entries()]
		.filter(([_, c]) => c.selector)
		.map(([name]) => name)

	// 2. Implicit entities - collect lazily to avoid TDZ errors
	const implicitConfigs = [...entityConfigs.entries()].filter(([_, c]) => !c.selector)
	// Tri-state: 'collecting' terminates self-recursive components
	let collectionState: 'idle' | 'collecting' | 'done' = 'idle'

	// Drops any implicit/hole-derived entries so a partial compiled pass can't leak into the fallback.
	function resetToExplicitSelections(): void {
		for (const key of [...selectionsMap.keys()]) {
			if (!explicitEntityPropNames.includes(key)) {
				selectionsMap.delete(key)
			}
		}
	}

	// Applies the compiled literal; returns false (⇒ caller falls back to the proxy pass) on a
	// malformed literal or a top-level throw. Per-hole failures stay contained inside applyCompiledSelection.
	function tryApplyCompiled(): boolean {
		if (!isValidCompiledSelection(compiled)) {
			console.warn(
				`[bindx] compiled selection for <${componentDisplayName}> is malformed (version/shape check failed) — `
				+ 'falling back to runtime collection.',
			)
			return false
		}
		try {
			applyCompiledSelection({
				compiled,
				selectionsMap,
				componentBrand,
				roles,
				implicitConfigs,
				schemaRegistry,
				componentDisplayName,
				validateMode: staticSelectionValidationEnabled,
			})
		} catch (error) {
			resetToExplicitSelections()
			console.warn(
				`[bindx] compiled selection for <${componentDisplayName}> failed to resolve — `
				+ 'falling back to runtime collection.',
				error,
			)
			return false
		}
		if (staticSelectionValidationEnabled) {
			validateCompiledSelection(
				selectionsMap, componentDisplayName,
				implicitConfigs, renderFn, componentBrand, roles,
				hasInterfacesMode, schemaRegistry, conditionFn, mockValues,
			)
		}
		return true
	}

	// Runs only from the static-analysis surface (getSelection, $propName fragment
	// getters) — never from render. Render bodies stay pure runtime code.
	function ensureImplicitCollected(): void {
		// In interfaces mode, we also need to collect even if no explicit implicit configs exist
		// (because interface props may be discovered dynamically)
		// Also collect if there's a conditionFn (it may access entity fields)
		if (collectionState !== 'idle' || (implicitConfigs.length === 0 && !hasInterfacesMode && !conditionFn)) {
			return
		}
		collectionState = 'collecting'
		try {
			// Precompiled selection present ⇒ build entries from it, skip the proxy pass.
			// Killswitch off or a malformed/throwing literal falls back to the proxy pass wholesale (never under-fetch).
			if (compiled && isCompiledSelectionsEnabled() && tryApplyCompiled()) {
				return
			}
			collectImplicitSelections(implicitConfigs, renderFn, selectionsMap, componentBrand, roles, hasInterfacesMode, schemaRegistry, conditionFn, mockValues)
		} catch (error) {
			// Analysis is deterministic, so retrying is pointless — degrade loudly
			// to the fields captured before the throw (scopes record eagerly).
			console.error(
				`[bindx] Implicit selection analysis of <${componentDisplayName}> failed — `
				+ 'only fields accessed before the error were collected; fields used after it may be missing from queries.',
				error,
			)
		} finally {
			collectionState = 'done'
			// Subscribe the props collection discovered too, incl. a degraded partial pass.
			for (const propName of selectionsMap.keys()) {
				if (!entityPropNames.includes(propName)) entityPropNames.push(propName)
			}
		}
	}

	// 3. Create React component
	function ComponentImpl(props: TProps): ReactNode {
		ensureImplicitCollected()

		// Subscribe every entity ref prop; an empty fixed list is a no-op.
		let renderProps: TProps = useRenderProps(props, entityPropNames)

		// Runtime-only values from .use() — hooks are allowed here; static analysis
		// never executes these (their outputs are mocked in the collection pass).
		for (const useFn of useFns) {
			// eslint-disable-next-line react-hooks/rules-of-hooks -- stable iteration count (useFns is fixed at build time)
			renderProps = { ...renderProps, ...useFn(renderProps) }
		}

		// Evaluate condition at runtime
		if (conditionFn) {
			const condition = conditionFn(renderProps)
			if (!evaluateCondition(condition)) {
				return null
			}
		}
		return renderFn(renderProps)
	}

	const MemoizedComponent = memo(ComponentImpl)
	// Names for selection-analysis error attribution; users can override
	MemoizedComponent.displayName = componentDisplayName

	// 4. Attach metadata
	const comp = MemoizedComponent as unknown as Record<symbol | string, unknown>
	comp[BINDX_COMPONENT] = true
	comp[COMPONENT_MARKER] = true
	comp[COMPONENT_SELECTIONS] = selectionsMap
	comp[COMPONENT_BRAND] = componentBrand

	if (roles.length > 0) {
		comp['__componentRoles'] = roles
	}

	// 5. Add SelectionProvider interface with lazy collection
	;(MemoizedComponent as unknown as SelectionProvider).getSelection = (
		props: Record<string, unknown>,
		collectNested,
	): SelectionFieldMeta | SelectionFieldMeta[] | null => {
		ensureImplicitCollected()
		return createGetSelection(selectionsMap, slotNames)(props, collectNested)
	}

	// 6. Attach fragment properties ($propName) for explicit entities
	for (const [propName, meta] of selectionsMap) {
		comp[`$${propName}`] = meta.fragment
	}

	// 7. Define lazy getters for implicit entity props
	// This allows accessing $propName without first rendering the component
	for (const [propName] of implicitConfigs) {
		Object.defineProperty(comp, `$${propName}`, {
			get(): FluentFragment<unknown, object, AnyBrand> | undefined {
				ensureImplicitCollected()
				return selectionsMap.get(propName)?.fragment
			},
			enumerable: true,
			configurable: true,
		})
	}

	// 8. In interfaces mode, wrap the component in a Proxy to handle dynamic $propName access
	// This is needed because interface prop names are only known at type-level, not runtime
	if (hasInterfacesMode) {
		return new Proxy(MemoizedComponent, {
			get(target, prop, receiver): unknown {
				// Handle $propName access for interface props discovered during collection
				if (typeof prop === 'string' && prop.startsWith('$')) {
					const propName = prop.slice(1)
					// Check if it's already defined on the target
					if (prop in target) {
						return Reflect.get(target, prop, receiver)
					}
					// Trigger collection and return the fragment
					ensureImplicitCollected()
					return selectionsMap.get(propName)?.fragment
				}
				return Reflect.get(target, prop, receiver)
			},
			has(target, prop): boolean {
				if (typeof prop === 'string' && prop.startsWith('$')) {
					ensureImplicitCollected()
					const propName = prop.slice(1)
					return selectionsMap.has(propName)
				}
				return Reflect.has(target, prop)
			},
		})
	}

	return MemoizedComponent
}

// ============================================================================
// Implicit Selection Collection
// ============================================================================

/**
 * Creates a mock object for explicit entity props during collection phase.
 * This prevents crashes when accessing .data or .fields on explicit props.
 */
function createExplicitPropMock(): unknown {
	const fieldsProxy = new Proxy({}, {
		get(): unknown {
			return { value: null }
		},
	})

	return new Proxy({}, {
		get(_target, prop): unknown {
			switch (prop) {
				case 'data':
				case 'id':
					return null
				case 'fields':
					return fieldsProxy
				default:
					return undefined
			}
		},
	})
}

/**
 * Collects selections from JSX for implicit entity props.
 *
 * In interfaces mode (hasInterfacesMode=true), any prop that is accessed
 * and used as an entity-like object will be captured as a potential interface prop.
 */
function collectImplicitSelections<TProps extends object>(
	implicitConfigs: [string, EntityConfig][],
	renderFn: (props: TProps) => ReactNode,
	selectionsMap: Map<string, SelectionPropMeta>,
	componentBrand: ComponentBrand,
	roles: readonly string[],
	hasInterfacesMode: boolean,
	schemaRegistry: SchemaRegistry<Record<string, object>> | null,
	conditionFn: ((props: TProps) => Condition) | null,
	mockValues: Record<string, unknown>,
): void {
	const propScopes = new Map<string, SelectionScope>()
	const implicitConfigsMap = new Map(implicitConfigs)
	const implicitPropNames = new Set(implicitConfigs.map(([name]) => name))
	const explicitPropNames = new Set(
		[...selectionsMap.keys()].filter(name => !implicitPropNames.has(name)),
	)

	// Create proxy for props that captures field accesses using SelectionScope
	const propsProxy = new Proxy({} as TProps, {
		get(_target, propName: string | symbol): unknown {
			if (typeof propName === 'symbol') {
				return undefined
			}

			// For explicit entity props, return a mock object that won't crash
			// when accessing .data or .fields during the collection phase
			if (explicitPropNames.has(propName)) {
				return createExplicitPropMock()
			}

			// For implicit entity props, create or reuse scopes
			if (implicitPropNames.has(propName)) {
				// Reuse existing scope or create new one
				// This ensures both conditionFn and renderFn selections are captured in the same scope
				let scope = propScopes.get(propName)
				if (!scope) {
					scope = new SelectionScope()
					propScopes.set(propName, scope)
				}
				const config = implicitConfigsMap.get(propName)
				const entityName = config?.entityName ?? null
				// Prefer schema from entity def, fall back to provided schemaRegistry
				const resolvedRegistry = config?.schema
					? new SchemaRegistry(config.schema)
					: schemaRegistry
				return createCollectorProxy(scope, entityName, resolvedRegistry)
			}

			// Deterministic analysis-time value; must win over the interfaces-mode
			// branch so a mocked scalar is never mistaken for an interface entity prop.
			if (propName in mockValues) {
				return mockValues[propName]
			}

			// In interfaces mode, any unknown prop could be an interface entity prop
			// Create or reuse a scope for it and return a collector proxy
			if (hasInterfacesMode) {
				let scope = propScopes.get(propName)
				if (!scope) {
					scope = new SelectionScope()
					propScopes.set(propName, scope)
				}
				return createCollectorProxy(scope, null, schemaRegistry)
			}

			// Scalar prop — tolerant stand-in so render bodies using it survive
			return createScalarPropMock()
		},
	})

	// Create fragments for captured entities
	const finalizeScopes = (): void => {
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

	let jsx: ReactNode
	try {
		// Execute conditionFn + render to capture field accesses
		if (conditionFn) {
			conditionFn(propsProxy)
		}
		jsx = renderFn(propsProxy)
	} catch (error) {
		// Scopes capture accesses eagerly, so a throw mid-render still leaves a
		// usable partial selection — keep it, then let the caller report the error.
		finalizeScopes()
		throw error
	}

	// Analyze JSX tree for component-level selections (handles nested createComponent)
	try {
		collectSelection(jsx)
	} catch {
		// staticRender of nested components may crash during collection phase
		// when collector proxies don't fully implement all runtime interfaces.
		// Field accesses are still captured in the scope tree via proxy.
	}

	finalizeScopes()
}

// ============================================================================
// Static Selection Application & Validation
// ============================================================================

/**
 * Validate mode: also run the proxy pass (which resolves nested holes by
 * rendering them inline) and warn (once) when the compiled selection
 * under-fetches relative to what runtime collection would produce. Diffs over
 * the runtime props so hole-derived entity props are covered too.
 */
function validateCompiledSelection<TProps extends object>(
	compiledMap: Map<string, SelectionPropMeta>,
	componentDisplayName: string,
	implicitConfigs: [string, EntityConfig][],
	renderFn: (props: TProps) => ReactNode,
	componentBrand: ComponentBrand,
	roles: readonly string[],
	hasInterfacesMode: boolean,
	schemaRegistry: SchemaRegistry<Record<string, object>> | null,
	conditionFn: ((props: TProps) => Condition) | null,
	mockValues: Record<string, unknown>,
): void {
	const runtimeMap = new Map<string, SelectionPropMeta>()
	try {
		collectImplicitSelections(implicitConfigs, renderFn, runtimeMap, componentBrand, roles, hasInterfacesMode, schemaRegistry, conditionFn, mockValues)
	} catch {
		// Proxy pass crashed — the compiled selection already stands; nothing to compare.
		return
	}

	const lines: string[] = []
	for (const propName of runtimeMap.keys()) {
		const compiledSelectionMeta = compiledMap.get(propName)?.selection
		const runtimeSelectionMeta = runtimeMap.get(propName)?.selection
		diffUnderfetchedFields(compiledSelectionMeta, runtimeSelectionMeta, [propName], lines)
	}

	if (lines.length > 0) {
		console.warn(
			`[bindx] static selection under-fetches for <${componentDisplayName}>:\n${lines.join('\n')}`,
		)
	}
}

/**
 * Validate mode for a compiled <Entity> root: warn (once per collection) on fields
 * the runtime children-collector walk requests but the compiled root omits. Reuses
 * the same under-fetch-only diff as createComponent; the warn names the entity type.
 */
export function validateCompiledRootSelection(
	compiledSelection: SelectionMeta,
	runtimeSelection: SelectionMeta,
	entityType: string,
): void {
	const lines: string[] = []
	diffUnderfetchedFields(compiledSelection, runtimeSelection, [entityType], lines)
	if (lines.length > 0) {
		console.warn(
			`[bindx] static selection under-fetches for <Entity ${entityType}>:\n${lines.join('\n')}`,
		)
	}
}

/**
 * Under-fetch diff: warn only for fields the runtime (proxy) selection requests
 * that the static selection omits — the sole mismatch class that is a fetch bug.
 * Fields present only in static (branch unions) and params/alias/isArray-only
 * differences are intentionally NOT reported: the compiler unions all branches
 * and the runtime never records has-many params in implicit collection. Keyed by
 * `fieldName` (not alias) so a params-driven alias never reads as a missing field.
 */
function diffUnderfetchedFields(
	staticMeta: SelectionMeta | undefined,
	runtimeMeta: SelectionMeta | undefined,
	path: string[],
	lines: string[],
): void {
	if (!runtimeMeta) {
		return
	}
	const staticByField = indexByFieldName(staticMeta)
	for (const runtimeField of runtimeMeta.fields.values()) {
		const staticField = staticByField.get(runtimeField.fieldName)
		if (!staticField) {
			lines.push(`  missing from static (under-fetch): ${[...path, runtimeField.fieldName].join('.')}`)
			continue
		}
		// Both sides fetch this relation — recurse into what the runtime nests.
		if (runtimeField.nested) {
			diffUnderfetchedFields(staticField.nested, runtimeField.nested, [...path, runtimeField.fieldName], lines)
		}
	}
}

/** Index a selection's top-level fields by field name (aliases collapse). */
function indexByFieldName(meta: SelectionMeta | undefined): Map<string, SelectionFieldMeta> {
	const byField = new Map<string, SelectionFieldMeta>()
	if (meta) {
		for (const field of meta.fields.values()) {
			byField.set(field.fieldName, field)
		}
	}
	return byField
}

// ============================================================================
// Selection Provider
// ============================================================================

/**
 * Creates the getSelection function for SelectionProvider interface.
 */
function createGetSelection(
	selectionsMap: Map<string, SelectionPropMeta>,
	slotNames: readonly string[],
): SelectionProvider['getSelection'] {
	return (
		props: Record<string, unknown>,
		collectNested,
	): SelectionFieldMeta[] | null => {
		const fields: SelectionFieldMeta[] = []

		for (const [propName, meta] of selectionsMap) {
			const propValue = props[propName]

			if (!propValue || typeof propValue !== 'object') {
				continue
			}

			// Case 0: Collection phase — prop has SCOPE_REF, merge directly into scope
			if (SCOPE_REF in propValue) {
				const targetScope = (propValue as { [SCOPE_REF]: SelectionScope })[SCOPE_REF]
				targetScope.mergeFromSelectionMeta(meta.selection)
				continue
			}

			// Case 1: Prop is a field reference (from relation)
			if (FIELD_REF_META in propValue) {
				const refMeta = (propValue as { [FIELD_REF_META]: { path: string[]; fieldName: string } })[FIELD_REF_META]

				for (const [_key, field] of meta.selection.fields) {
					if (field.path.length === 1) {
						fields.push({
							...field,
							path: [...refMeta.path, ...field.path],
						})
					}
				}
			}
			// Case 2: Prop is an EntityRef from root level
			else if ('id' in propValue && 'fields' in propValue) {
				for (const [_key, field] of meta.selection.fields) {
					if (field.path.length === 1) {
						fields.push({ ...field })
					}
				}
			}
		}

		// Walk configured slot props so nested bindx components inside children
		// (or any other slot) contribute their selection to the fetch plan.
		for (const slotName of slotNames) {
			const slotValue = props[slotName]
			if (slotValue === undefined || slotValue === null) {
				continue
			}
			const nested = collectNested(slotValue as ReactNode)
			for (const field of nested.fields.values()) {
				fields.push({ ...field })
			}
		}

		return fields.length > 0 ? fields : null
	}
}
