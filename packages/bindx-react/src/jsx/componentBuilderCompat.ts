/**
 * Backwards compatibility exports for createComponent.
 * These are used by other parts of the codebase that haven't been migrated yet.
 */

import type { ComponentType } from 'react'
import type { SelectionPropMeta } from './componentBuilder.types.js'
import { COMPONENT_MARKER, COMPONENT_SELECTIONS } from './componentBuilder.js'
import { BINDX_COMPONENT } from './types.js'

/**
 * Assigns $propName fragment properties to a component.
 * @internal
 */
export function assignFragmentProperties(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	component: ComponentType<any>,
	selectionsMap: Map<string, SelectionPropMeta>,
): void {
	const result = component as unknown as Record<string, unknown>
	for (const [propName, meta] of selectionsMap) {
		result[`$${propName}`] = meta.fragment
	}
}

/**
 * Assigns standard bindx component markers to a component.
 * @internal
 */
export function assignComponentMarkers(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	component: ComponentType<any>,
	selectionsMap: Map<string, SelectionPropMeta>,
): void {
	const comp = component as unknown as Record<symbol, unknown>
	comp[BINDX_COMPONENT] = true
	comp[COMPONENT_MARKER] = true
	comp[COMPONENT_SELECTIONS] = selectionsMap
}
