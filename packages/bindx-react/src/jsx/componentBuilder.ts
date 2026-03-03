/**
 * Unified createComponent builder implementation.
 *
 * Provides a fluent builder for creating bindx components with support for
 * both implicit (JSX-analyzed) and explicit (selector-based) entity props.
 */

import type { ReactNode } from 'react'
import type {
	SchemaRegistry,
} from '@contember/bindx'
import {
	ComponentBrand,
} from '@contember/bindx'
import type {
	ComponentBuilder,
	ComponentBuilderState,
} from './componentBuilder.types.js'
export type { SelectionPropMeta } from './componentBuilder.types.js'
import type { Condition } from './conditions.js'
import { buildComponent, type EntityConfig } from './componentFactory.js'

// Re-export symbols from componentFactory for backwards compatibility
export { COMPONENT_MARKER, COMPONENT_BRAND, COMPONENT_SELECTIONS } from './componentFactory.js'
import { COMPONENT_MARKER, COMPONENT_BRAND } from './componentFactory.js'

// ============================================================================
// Builder Implementation
// ============================================================================

/**
 * Implementation of the ComponentBuilder interface.
 * Accumulates entity configs and builds the component on .render().
 *
 * Note: The implementation uses `any` returns because TypeScript cannot
 * properly infer the accumulating state types through method chaining.
 * Type safety is provided by the interface definition.
 */
export class ComponentBuilderImpl<
	TSchema extends Record<string, object>,
	TState extends ComponentBuilderState<TSchema>,
> {
	constructor(
		private readonly schemaRegistry: SchemaRegistry<Record<string, object>> | null,
		private readonly entityConfigs: Map<string, EntityConfig>,
		private readonly roles: readonly string[],
		private readonly hasInterfacesMode: boolean = false,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		private readonly conditionFn: ((props: any) => Condition) | null = null,
	) {}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	entity(
		propName: string,
		entityName: string,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		selector?: (builder: any) => any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	): any {
		const newConfigs = new Map(this.entityConfigs)
		newConfigs.set(propName, { entityName, selector })
		return new ComponentBuilderImpl(
			this.schemaRegistry,
			newConfigs,
			this.roles,
			this.hasInterfacesMode,
			this.conditionFn,
		)
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	interfaces(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		selectors?: Record<string, (builder: any) => any>,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	): any {
		// Note: At runtime we don't know the TInterfaces keys, so we rely on
		// the selectors parameter to determine which props have explicit selectors.
		// For props without selectors (including pure implicit mode with no selectors param),
		// entity-like props are discovered at render time via proxy.
		const newConfigs = new Map(this.entityConfigs)

		if (selectors) {
			for (const [propName, selector] of Object.entries(selectors)) {
				newConfigs.set(propName, {
					entityName: null,
					selector,
					isInterface: true,
				})
			}
		}

		return new ComponentBuilderImpl(
			this.schemaRegistry,
			newConfigs,
			this.roles,
			true, // Enable interfaces mode for discovery of implicit interface props
			this.conditionFn,
		)
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	props<TNewScalarProps extends object>(): any {
		// Type-only operation - runtime is a no-op
		return new ComponentBuilderImpl(
			this.schemaRegistry,
			this.entityConfigs,
			this.roles,
			this.hasInterfacesMode,
			this.conditionFn,
		)
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if(conditionFn: (props: any) => Condition): any {
		return new ComponentBuilderImpl(
			this.schemaRegistry,
			this.entityConfigs,
			this.roles,
			this.hasInterfacesMode,
			conditionFn,
		)
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	render(renderFn: (props: any) => ReactNode): any {
		return buildComponent(
			this.entityConfigs,
			this.roles,
			renderFn,
			this.hasInterfacesMode,
			this.schemaRegistry,
			this.conditionFn,
		)
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a new component builder with initial state.
 *
 * @param schemaRegistry - Optional schema registry for validation
 * @param roles - Optional role constraints
 */
export function createComponentBuilder<TSchema extends Record<string, object>>(
	schemaRegistry: SchemaRegistry<Record<string, object>> | null,
	roles: readonly string[] = [],
// eslint-disable-next-line @typescript-eslint/ban-types
): ComponentBuilder<TSchema, ComponentBuilderState<TSchema, {}, object, typeof roles>> {
	return new ComponentBuilderImpl(
		schemaRegistry,
		new Map(),
		roles,
	// eslint-disable-next-line @typescript-eslint/ban-types
	) as unknown as ComponentBuilder<TSchema, ComponentBuilderState<TSchema, {}, object, typeof roles>>
}

// ============================================================================
// Type Guards & Utilities
// ============================================================================

/**
 * Type guard to check if a value is a component created with createComponent
 */
export function isBindxComponent(value: unknown): boolean {
	if (value === null || value === undefined) {
		return false
	}
	if (typeof value !== 'object' && typeof value !== 'function') {
		return false
	}
	return COMPONENT_MARKER in value && (value as Record<symbol, unknown>)[COMPONENT_MARKER] === true
}

/**
 * Gets the component brand from a bindx component
 */
export function getComponentBrand(component: unknown): ComponentBrand | undefined {
	if (!isBindxComponent(component)) {
		return undefined
	}
	return (component as unknown as Record<symbol, ComponentBrand>)[COMPONENT_BRAND]
}
