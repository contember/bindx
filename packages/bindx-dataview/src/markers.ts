/**
 * Marker components for DataGrid children analysis.
 *
 * These are metadata components — they return null at runtime.
 * Their props are extracted by `analyzeChildren()` during the DataGrid's
 * collection phase and stored in DataViewContext for layout components to consume.
 */

import type React from 'react'
import type { ReactNode } from 'react'
import type { EntityAccessor } from '@contember/bindx'

// ============================================================================
// Toolbar Content Marker
// ============================================================================

export interface DataGridToolbarContentProps {
	readonly children: React.ReactNode
}

/**
 * Marker for toolbar content inside a DataGrid children render function.
 * At analysis time, the children ReactNode is extracted and stored in context.
 * At runtime, returns null (content is rendered by toolbar layout components).
 */
export function DataGridToolbarContent(_props: DataGridToolbarContentProps): null {
	return null
}

// ============================================================================
// Layout Marker (replaces DataGridTileLayout)
// ============================================================================

export interface DataGridLayoutProps<T = never> {
	/** Unique name for this layout (e.g. "grid", "rows", "cards") */
	readonly name: string
	/** Label shown in the layout switcher UI (supports ReactNode for icons) */
	readonly label?: ReactNode
	/** Pass the DataGrid's `it` parameter for type inference on the children callback. */
	readonly item?: T
	readonly children: (item: T) => ReactNode
}

/**
 * Marker for a named layout inside a DataGrid children render function.
 * Multiple DataGridLayout markers can coexist with different names.
 * At analysis time, the callback is extracted and called with the collector proxy
 * to discover field selections. At runtime, returns null (callback is stored in
 * context and invoked per-item by layout rendering components).
 */
export function DataGridLayout<T>(_props: DataGridLayoutProps<T>): null {
	return null
}
