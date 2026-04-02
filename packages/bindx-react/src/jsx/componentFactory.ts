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
	EntityRef,
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
import { type Condition, evaluateCondition } from './conditions.js'
import { useAccessor } from '../hooks/useAccessor.js'

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
 * Converts explicit entity ref props to accessors via useAccessor.
 * Called with a fixed list of prop names — hook count is stable across renders.
 */
function useRenderProps<TProps extends object>(props: TProps, explicitPropNames: string[]): TProps {
	const record = props as Record<string, unknown>
	const accessors: Record<string, unknown> = {}
	for (const name of explicitPropNames) {
		// eslint-disable-next-line react-hooks/rules-of-hooks -- stable iteration count (explicitPropNames is fixed at build time)
		accessors[name] = useAccessor(record[name] as EntityRef<object>)
	}
	return { ...props, ...accessors } as TProps
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
): unknown {
	const selectionsMap = new Map<string, SelectionPropMeta>()

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

	// Collect explicit entity prop names (stable list for hooks)
	const explicitEntityPropNames = [...entityConfigs.entries()]
		.filter(([_, c]) => c.selector)
		.map(([name]) => name)

	// 2. Implicit entities - collect lazily to avoid TDZ errors
	const implicitConfigs = [...entityConfigs.entries()].filter(([_, c]) => !c.selector)
	let implicitCollected = false

	function ensureImplicitCollected(): void {
		// In interfaces mode, we also need to collect even if no explicit implicit configs exist
		// (because interface props may be discovered dynamically)
		// Also collect if there's a conditionFn (it may access entity fields)
		if (implicitCollected || (implicitConfigs.length === 0 && !hasInterfacesMode && !conditionFn)) {
			return
		}
		implicitCollected = true
		collectImplicitSelections(implicitConfigs, renderFn, selectionsMap, componentBrand, roles, hasInterfacesMode, schemaRegistry, conditionFn)
	}

	// 3. Create React component
	function ComponentImpl(props: TProps): ReactNode {
		ensureImplicitCollected()

		// Convert explicit entity refs to accessors (stable hook count — explicitEntityPropNames is fixed)
		const renderProps = explicitEntityPropNames.length > 0
			? useRenderProps(props, explicitEntityPropNames)
			: props

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
		return createGetSelection(selectionsMap)(props, collectNested)
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

			// Scalar prop - return undefined
			return undefined
		},
	})

	// Execute conditionFn to capture field accesses from the condition
	if (conditionFn) {
		conditionFn(propsProxy)
	}

	// Execute render to capture field accesses
	const jsx = renderFn(propsProxy)

	// Analyze JSX tree for component-level selections (handles nested createComponent)
	try {
		collectSelection(jsx)
	} catch {
		// staticRender of nested components may crash during collection phase
		// when collector proxies don't fully implement all runtime interfaces.
		// Field accesses are still captured in the scope tree via proxy.
	}

	// Create fragments for captured entities
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

// ============================================================================
// Fragment Creation
// ============================================================================

/**
 * Creates a FluentFragment from selection metadata.
 */
function createFragment(
	selection: SelectionMeta,
	componentBrand: ComponentBrand,
	roles: readonly string[],
): FluentFragment<unknown, object, AnyBrand> {
	return {
		__meta: selection,
		__resultType: {} as object,
		__modelType: undefined as unknown,
		__isFragment: true,
		__brand: componentBrand,
		__brands: new Set([componentBrand.brandSymbol]),
		__roles: roles.length > 0 ? roles : undefined,
	}
}

// ============================================================================
// Selection Provider
// ============================================================================

/**
 * Creates the getSelection function for SelectionProvider interface.
 */
function createGetSelection(
	selectionsMap: Map<string, SelectionPropMeta>,
): SelectionProvider['getSelection'] {
	return (
		props: Record<string, unknown>,
		_collectNested,
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

		return fields.length > 0 ? fields : null
	}
}
