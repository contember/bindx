/**
 * Component creation utilities for bindx.
 *
 * The main createComponent function is now provided by createBindx() using the builder API.
 * This module re-exports builder utilities and provides helper functions.
 */

import type { FluentFragment, AnyBrand } from '@contember/bindx'
import { ComponentBrand } from '@contember/bindx'
import { SelectionMetaCollector, mergeSelections } from './SelectionMeta.js'
import { COMPONENT_BRAND } from './componentBuilder.js'

// Re-export from builder module
export {
	COMPONENT_MARKER,
	COMPONENT_BRAND,
	COMPONENT_SELECTIONS,
	ComponentBuilderImpl,
	createComponentBuilder,
	isBindxComponent,
	getComponentBrand,
} from './componentBuilder.js'

export type {
	SelectionPropMeta,
	BindxComponentBase,
	BindxComponent,
	ComponentBuilder,
	ComponentBuilderState,
	CreateComponentOptions,
	CreateComponentFn,
	// Interface types
	InterfaceEntityPropConfig,
	ImplicitInterfaceEntityConfig,
	ExplicitInterfaceEntityConfig,
	AddInterfaces,
	InterfaceSelectorsMap,
	AnyEntityPropConfig,
	// Entity prop config types
	EntityPropConfig,
	ImplicitEntityConfig,
	ExplicitEntityConfig,
	// State helpers
	AddImplicitEntity,
	AddExplicitEntity,
	AddImplicitInterfaceEntity,
	AddExplicitInterfaceEntity,
	SetScalarProps,
	// Props building
	BuildEntityProps,
	BuildProps,
	BuildFragmentProps,
	InitialBuilderState,
} from './componentBuilder.types.js'

// ============================================================================
// Legacy exports for backwards compatibility
// ============================================================================

// These are kept for backwards compatibility with existing code
// that imports from createComponent.ts

export { assignFragmentProperties } from './componentBuilderCompat.js'

// ============================================================================
// Brand Validation
// ============================================================================

/**
 * Flag to enable/disable brand validation.
 * Set to false in production for performance.
 */
let brandValidationEnabled = true

/**
 * Enables or disables brand validation.
 * Call with false in production to disable warnings.
 */
export function setBrandValidation(enabled: boolean): void {
	brandValidationEnabled = enabled
}

/**
 * Validates that an EntityRef has the required component brand.
 * Logs a warning in development mode if the brand is missing.
 *
 * @param entityRef - The EntityRef to validate
 * @param component - The component that requires the brand
 * @param propName - The prop name for error messages
 */
export function validateBrand(
	entityRef: { __brands?: Set<symbol> } | null | undefined,
	component: { [key: symbol]: ComponentBrand | undefined },
	propName: string,
): void {
	if (!brandValidationEnabled || !entityRef) {
		return
	}

	const componentBrand = component[COMPONENT_BRAND] as ComponentBrand | undefined
	if (!componentBrand) {
		return
	}

	const entityBrands = entityRef.__brands
	if (!entityBrands) {
		// EntityRef doesn't have brands yet (might be from legacy code)
		return
	}

	if (!entityBrands.has(componentBrand.brandSymbol)) {
		console.warn(
			`[bindx] EntityRef passed to "${propName}" is missing the required component brand. ` +
			`Use mergeFragments() to combine fragment selections when using multiple components. ` +
			`Expected brand: ${componentBrand.name}`,
		)
	}
}

// ============================================================================
// Fragment Merging
// ============================================================================

/**
 * Merges multiple fragment selections into one.
 * Combines both the selection metadata and brand symbols.
 *
 * @example
 * ```tsx
 * const article = useEntity('Article', { id }, e =>
 *   e.author(mergeFragments(AuthorInfo.$author, AuthorCard.$author))
 * )
 * ```
 */
export function mergeFragments<T, R1 extends object, B1 extends AnyBrand>(
	fragment1: FluentFragment<T, R1, B1>,
): FluentFragment<T, R1, B1>
export function mergeFragments<T, R1 extends object, R2 extends object, B1 extends AnyBrand, B2 extends AnyBrand>(
	fragment1: FluentFragment<T, R1, B1>,
	fragment2: FluentFragment<T, R2, B2>,
): FluentFragment<T, R1 & R2, B1 | B2>
export function mergeFragments<T, R1 extends object, R2 extends object, R3 extends object, B1 extends AnyBrand, B2 extends AnyBrand, B3 extends AnyBrand>(
	fragment1: FluentFragment<T, R1, B1>,
	fragment2: FluentFragment<T, R2, B2>,
	fragment3: FluentFragment<T, R3, B3>,
): FluentFragment<T, R1 & R2 & R3, B1 | B2 | B3>
export function mergeFragments<T>(
	...fragments: FluentFragment<T, object, AnyBrand>[]
): FluentFragment<T, object, AnyBrand> {
	if (fragments.length === 0) {
		throw new Error('mergeFragments requires at least one fragment')
	}

	if (fragments.length === 1) {
		return fragments[0]!
	}

	const mergedSelection = new SelectionMetaCollector()
	const mergedBrands = new Set<symbol>()

	for (const fragment of fragments) {
		mergeSelections(mergedSelection, fragment.__meta)
		// Merge brand symbols from all fragments
		if (fragment.__brands) {
			fragment.__brands.forEach(b => mergedBrands.add(b))
		}
	}

	return {
		__meta: mergedSelection,
		__resultType: {} as object,
		__modelType: undefined as unknown as T,
		__isFragment: true,
		__brands: mergedBrands,
	}
}
