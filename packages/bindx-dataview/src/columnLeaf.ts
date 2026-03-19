/**
 * ColumnLeaf — the data carrier for extracted column metadata.
 *
 * `ColumnLeaf` is a marker React component (returns null) whose props carry
 * all column metadata. `analyzeChildren()` walks a JSX element tree,
 * resolving components with `staticRender` and collecting props from registered
 * marker types — a lightweight equivalent of contember-oss's ChildrenAnalyzer.
 */

import React from 'react'
import type { FieldRefBase, FilterHandler, FilterArtifact, EntityAccessor } from '@contember/bindx'

// ============================================================================
// ColumnLeaf Props — the new ColumnMeta
// ============================================================================

// ============================================================================
// Column Leaf Props
// ============================================================================

/** All known column type literals for type narrowing */
export type ColumnType = 'text' | 'number' | 'date' | 'dateTime' | 'boolean' | 'uuid' | 'isDefined' | 'enum' | 'enumList' | 'hasOne' | 'hasMany' | 'action' | (string & {})

export interface ColumnLeafProps {
	// ── Core ──
	readonly name: string
	readonly fieldName: string | null
	readonly fieldRef: FieldRefBase<unknown> | null
	readonly sortingField: string | null
	readonly filterName: string | null
	readonly filterHandler: FilterHandler<FilterArtifact> | undefined
	readonly isTextSearchable: boolean
	readonly columnType?: ColumnType
	readonly collectSelection?: (collectorProxy: unknown) => void

	// ── Enum ──
	/** Enum type name for resolving options from context (e.g. 'DeploymentStatus') */
	readonly enumName?: string
	/** Explicit enum options — value → label (overrides context-resolved options) */
	readonly enumOptions?: Readonly<Record<string, React.ReactNode>>

	// ── Relation ──
	readonly relatedEntityName?: string
	readonly relatedSelection?: import('@contember/bindx').SelectionMeta
	readonly renderFilterItem?: (accessor: EntityAccessor<object>) => React.ReactNode

	// ── UI ──
	readonly header?: React.ReactNode
	readonly renderCell: (accessor: EntityAccessor<object>) => React.ReactNode
	readonly renderFilter?: (props: { artifact: FilterArtifact; setArtifact: (artifact: FilterArtifact) => void }) => React.ReactNode
	readonly renderCellWrapper?: (content: React.ReactNode, item: EntityAccessor<object>) => React.ReactNode
}

/** Type guard for relation columns */
export function isRelationColumn(col: ColumnLeafProps): col is ColumnLeafProps & { columnType: 'hasOne' | 'hasMany'; relatedEntityName: string; renderFilterItem: (accessor: EntityAccessor<object>) => React.ReactNode } {
	return (col.columnType === 'hasOne' || col.columnType === 'hasMany') && !!col.relatedEntityName && !!col.renderFilterItem
}

/**
 * Marker component — returns null at runtime.
 * Its props are the column metadata extracted by `analyzeChildren()`.
 */
export function ColumnLeaf(_props: ColumnLeafProps): null {
	return null
}

// ============================================================================
// Generalized Children Analyzer
// ============================================================================

interface ComponentWithStaticRender {
	staticRender: (props: Record<string, unknown>) => React.ReactNode
}

function hasStaticRender(type: unknown): type is ComponentWithStaticRender {
	return typeof type === 'function' && 'staticRender' in type
}

/**
 * Result of analyzing a JSX element tree for marker components.
 */
export interface ChildrenAnalysisResult {
	/** Get all collected props for a given marker type */
	getAll<TProps>(marker: React.ComponentType<TProps>): TProps[]
	/** Get the first collected props for a given marker type, or undefined */
	getFirst<TProps>(marker: React.ComponentType<TProps>): TProps | undefined
}

/**
 * Walk a JSX element tree and collect props from registered marker types.
 *
 * For each element:
 * 1. If its type is in `markerTypes` → collect its props
 * 2. If it's a `React.Fragment` → recurse into children
 * 3. If it has a `staticRender` static method → call it and recurse into result
 * 4. Otherwise → skip (renders normally at runtime)
 */
export function analyzeChildren(
	elements: React.ReactNode,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	markerTypes: ReadonlySet<React.ComponentType<any>>,
): ChildrenAnalysisResult {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const collected = new Map<React.ComponentType<any>, unknown[]>()
	for (const type of markerTypes) {
		collected.set(type, [])
	}

	walkTree(elements, markerTypes, collected)

	return {
		getAll<TProps>(marker: React.ComponentType<TProps>): TProps[] {
			return (collected.get(marker) ?? []) as TProps[]
		},
		getFirst<TProps>(marker: React.ComponentType<TProps>): TProps | undefined {
			const items = collected.get(marker)
			return items?.[0] as TProps | undefined
		},
	}
}

function walkTree(
	elements: React.ReactNode,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	markerTypes: ReadonlySet<React.ComponentType<any>>,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	collected: Map<React.ComponentType<any>, unknown[]>,
): void {
	React.Children.forEach(elements, (child) => {
		if (!React.isValidElement(child)) return

		if (markerTypes.has(child.type as React.ComponentType)) {
			collected.get(child.type as React.ComponentType)!.push(child.props)
		} else if (child.type === React.Fragment) {
			walkTree((child.props as { children?: React.ReactNode }).children, markerTypes, collected)
		} else if (hasStaticRender(child.type)) {
			const rendered = child.type.staticRender(child.props as Record<string, unknown>)
			walkTree(rendered, markerTypes, collected)
		}
	})
}

/**
 * Convenience wrapper: extract `ColumnLeafProps` from a JSX element tree.
 */
export function extractColumnLeaves(elements: React.ReactNode): ColumnLeafProps[] {
	return analyzeChildren(elements, new Set([ColumnLeaf])).getAll(ColumnLeaf)
}
