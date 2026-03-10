/**
 * ColumnLeaf — the data carrier for extracted column metadata.
 *
 * `ColumnLeaf` is a marker React component (returns null) whose props carry
 * all column metadata. `extractColumnLeaves()` walks a JSX element tree,
 * resolving components with `staticRender` until it finds `ColumnLeaf` markers.
 */

import React from 'react'
import type { FieldRefBase, FilterHandler, FilterArtifact, EntityAccessor } from '@contember/bindx'

// ============================================================================
// ColumnLeaf Props — the new ColumnMeta
// ============================================================================

export interface ColumnLeafProps {
	// ── Behavior ──
	readonly name: string
	readonly fieldName: string | null
	readonly fieldRef: FieldRefBase<unknown> | null
	readonly sortingField: string | null
	readonly filterName: string | null
	readonly filterHandler: FilterHandler<FilterArtifact> | undefined
	readonly isTextSearchable: boolean
	readonly enumOptions?: readonly string[]
	/** Column type hint for UI dispatch (e.g. 'text', 'boolean', 'enum') */
	readonly columnType?: string
	readonly collectSelection?: (collectorProxy: unknown) => void

	// ── UI ──
	readonly header: React.ReactNode
	readonly renderCell: (accessor: EntityAccessor<object>) => React.ReactNode
	readonly renderFilter?: (props: { artifact: unknown; setArtifact: (artifact: FilterArtifact) => void }) => React.ReactNode
}

/**
 * Marker component — returns null at runtime.
 * Its props are the column metadata extracted by `extractColumnLeaves()`.
 */
export function ColumnLeaf(_props: ColumnLeafProps): null {
	return null
}

// ============================================================================
// Extraction
// ============================================================================

interface ComponentWithStaticRender {
	staticRender: (props: Record<string, unknown>) => React.ReactNode
}

function hasStaticRender(type: unknown): type is ComponentWithStaticRender {
	return typeof type === 'function' && 'staticRender' in type
}

/**
 * Extract `ColumnLeafProps` from a JSX element tree.
 *
 * Walks children recursively:
 * - `ColumnLeaf` elements → extract props directly
 * - `React.Fragment` → recurse into children
 * - Components with `staticRender` → call staticRender, recurse into result
 */
export function extractColumnLeaves(elements: React.ReactNode): ColumnLeafProps[] {
	const leaves: ColumnLeafProps[] = []

	React.Children.forEach(elements, (child) => {
		if (!React.isValidElement(child)) return

		if (child.type === ColumnLeaf) {
			leaves.push(child.props as unknown as ColumnLeafProps)
		} else if (child.type === React.Fragment) {
			leaves.push(...extractColumnLeaves((child.props as { children?: React.ReactNode }).children))
		} else if (hasStaticRender(child.type)) {
			const rendered = child.type.staticRender(child.props as Record<string, unknown>)
			leaves.push(...extractColumnLeaves(rendered))
		}
	})

	return leaves
}
