/**
 * DataGrid column components.
 *
 * These are "metadata" components — they are not rendered directly.
 * Instead, they carry `staticRender` methods that produce `ColumnLeaf`
 * elements, which the DataGrid extracts for column metadata.
 *
 * Scalar columns are built via `createColumn()` + column type defs.
 * Relation/action/generic columns use manual `staticRender`.
 */

import React from 'react'
import type { FieldRefBase, HasOneRef, HasManyRef, FilterHandler, FilterArtifact, EntityAccessor } from '@contember/bindx'
import { FIELD_REF_META } from '@contember/bindx-react'
import { createColumn, type ColumnRenderProps } from './createColumn.js'
import {
	textColumnDef,
	numberColumnDef,
	dateColumnDef,
	dateTimeColumnDef,
	booleanColumnDef,
	enumColumnDef,
	enumListColumnDef,
	uuidColumnDef,
	isDefinedColumnDef,
} from './columnTypes.js'
import { ColumnLeaf, type ColumnLeafProps } from './columnLeaf.js'

// ============================================================================
// Re-export ColumnLeafProps as ColumnMeta for compatibility
// ============================================================================

export type ColumnMeta = ColumnLeafProps

// ============================================================================
// Extraction Helpers
// ============================================================================

/**
 * Extract field name from a field ref (works in both collector and runtime proxies)
 */
export function extractFieldName(ref: unknown): string | null {
	if (ref && typeof ref === 'object' && FIELD_REF_META in ref) {
		const meta = (ref as Record<symbol, { fieldName: string }>)[FIELD_REF_META]
		return meta?.fieldName ?? null
	}
	return null
}

// ============================================================================
// Default Cell Renderers
// ============================================================================

function renderScalarDefault({ value }: ColumnRenderProps<unknown>): React.ReactNode {
	return value != null ? String(value) : ''
}

function renderBooleanDefault({ value }: ColumnRenderProps<boolean | null>): React.ReactNode {
	return value != null ? String(value) : ''
}

function renderIsDefinedDefault({ value }: ColumnRenderProps<unknown>): React.ReactNode {
	return value != null ? '✓' : '✗'
}

function renderDateTimeDefault({ value }: ColumnRenderProps<string | null>): React.ReactNode {
	if (typeof value !== 'string') return ''
	const date = new Date(value)
	if (isNaN(date.getTime())) return value
	return date.toLocaleString()
}

function renderEnumListDefault({ value }: ColumnRenderProps<readonly string[] | null>): React.ReactNode {
	if (!Array.isArray(value)) return ''
	return value.join(', ')
}

// ============================================================================
// Scalar Column Props
// ============================================================================

interface DataGridScalarColumnPropsBase<T> {
	field: FieldRefBase<T>
	header?: React.ReactNode
	sortable?: boolean
	filter?: boolean
	children?: (value: T | null) => React.ReactNode
}

export interface DataGridTextColumnProps<T> extends DataGridScalarColumnPropsBase<T> {}
export interface DataGridNumberColumnProps<T> extends DataGridScalarColumnPropsBase<T> {}
export interface DataGridDateColumnProps<T> extends DataGridScalarColumnPropsBase<T> {}
export interface DataGridDateTimeColumnProps<T> extends DataGridScalarColumnPropsBase<T> {}
export interface DataGridBooleanColumnProps<T> extends DataGridScalarColumnPropsBase<T> {}
export interface DataGridUuidColumnProps<T> extends DataGridScalarColumnPropsBase<T> {}
export interface DataGridIsDefinedColumnProps<T> extends DataGridScalarColumnPropsBase<T> {}

export interface DataGridEnumColumnProps<T> extends DataGridScalarColumnPropsBase<T> {
	options: readonly string[]
}

export interface DataGridEnumListColumnProps<T> extends DataGridScalarColumnPropsBase<T> {
	options: readonly string[]
}

// ============================================================================
// Scalar Columns via createColumn()
//
// createColumn handles `children` (custom cell renderer) and `options` (enum)
// natively — no monkey-patching needed.
// ============================================================================

export const DataGridTextColumn = createColumn(textColumnDef, {
	renderCell: renderScalarDefault,
}) as unknown as <T>(props: DataGridTextColumnProps<T>) => React.ReactElement | null

export const DataGridNumberColumn = createColumn(numberColumnDef, {
	renderCell: renderScalarDefault,
}) as unknown as <T>(props: DataGridNumberColumnProps<T>) => React.ReactElement | null

export const DataGridDateColumn = createColumn(dateColumnDef, {
	renderCell: renderScalarDefault,
}) as unknown as <T>(props: DataGridDateColumnProps<T>) => React.ReactElement | null

export const DataGridDateTimeColumn = createColumn(dateTimeColumnDef, {
	renderCell: renderDateTimeDefault,
}) as unknown as <T>(props: DataGridDateTimeColumnProps<T>) => React.ReactElement | null

export const DataGridBooleanColumn = createColumn(booleanColumnDef, {
	renderCell: renderBooleanDefault,
}) as unknown as <T>(props: DataGridBooleanColumnProps<T>) => React.ReactElement | null

export const DataGridEnumColumn = createColumn(enumColumnDef, {
	renderCell: renderScalarDefault,
}) as unknown as <T>(props: DataGridEnumColumnProps<T>) => React.ReactElement | null

export const DataGridEnumListColumn = createColumn(enumListColumnDef, {
	renderCell: renderEnumListDefault,
}) as unknown as <T>(props: DataGridEnumListColumnProps<T>) => React.ReactElement | null

export const DataGridUuidColumn = createColumn(uuidColumnDef, {
	renderCell: renderScalarDefault,
}) as unknown as <T>(props: DataGridUuidColumnProps<T>) => React.ReactElement | null

export const DataGridIsDefinedColumn = createColumn(isDefinedColumnDef, {
	renderCell: renderIsDefinedDefault,
}) as unknown as <T>(props: DataGridIsDefinedColumnProps<T>) => React.ReactElement | null

// ============================================================================
// Relation Column Props & Components
// ============================================================================

export interface DataGridHasOneColumnProps<TEntity, TSelected> {
	field: HasOneRef<TEntity, TSelected> | FieldRefBase<unknown>
	header?: React.ReactNode
	children: (entity: unknown) => React.ReactNode
}

export function DataGridHasOneColumn<TEntity, TSelected>(
	_props: DataGridHasOneColumnProps<TEntity, TSelected>,
): React.ReactElement | null {
	return null
}

;(DataGridHasOneColumn as unknown as { staticRender: (props: Record<string, unknown>) => React.ReactNode }).staticRender = (
	props: Record<string, unknown>,
): React.ReactNode => {
	const fieldRef = props['field'] as FieldRefBase<unknown> | undefined
	const fieldName = fieldRef ? extractFieldName(fieldRef) : null
	const renderer = props['children'] as ((ref: unknown) => React.ReactNode) | undefined
	const header = (props['header'] as React.ReactNode) ?? fieldName ?? ''

	const leafProps: ColumnLeafProps = {
		name: fieldName ?? `col-${Math.random().toString(36).slice(2, 8)}`,
		fieldName,
		fieldRef: fieldRef ?? null,
		sortingField: null,
		filterName: null,
		filterHandler: undefined,
		isTextSearchable: false,
		columnType: 'hasOne',
		header,
		collectSelection: () => {
			if (renderer && fieldRef) {
				renderer(fieldRef)
			}
		},
		renderCell: (accessor: EntityAccessor<object>) => {
			if (!fieldName) return null
			const ref = (accessor as unknown as Record<string, unknown>)[fieldName]
			if (!renderer) return null
			const result = renderer(ref)
			if (result && typeof result === 'object' && 'value' in result) {
				return (result as { value: unknown }).value != null
					? String((result as { value: unknown }).value)
					: ''
			}
			return result
		},
	}

	return React.createElement(ColumnLeaf, leafProps as ColumnLeafProps)
}

// ============================================================================
// HasMany Column
// ============================================================================

export interface DataGridHasManyColumnProps<TEntity, TSelected> {
	field: HasManyRef<TEntity, TSelected> | FieldRefBase<unknown>
	header?: React.ReactNode
	children: (entity: unknown) => React.ReactNode
}

export function DataGridHasManyColumn<TEntity, TSelected>(
	_props: DataGridHasManyColumnProps<TEntity, TSelected>,
): React.ReactElement | null {
	return null
}

;(DataGridHasManyColumn as unknown as { staticRender: (props: Record<string, unknown>) => React.ReactNode }).staticRender = (
	props: Record<string, unknown>,
): React.ReactNode => {
	const fieldRef = props['field'] as FieldRefBase<unknown> | undefined
	const fieldName = fieldRef ? extractFieldName(fieldRef) : null
	const renderer = props['children'] as ((ref: unknown) => React.ReactNode) | undefined
	const header = (props['header'] as React.ReactNode) ?? fieldName ?? ''

	const leafProps: ColumnLeafProps = {
		name: fieldName ?? `col-${Math.random().toString(36).slice(2, 8)}`,
		fieldName,
		fieldRef: fieldRef ?? null,
		sortingField: null,
		filterName: null,
		filterHandler: undefined,
		isTextSearchable: false,
		columnType: 'hasMany',
		header,
		collectSelection: () => {
			if (renderer && fieldRef) {
				const mapFn = (fieldRef as { map?: (fn: (item: unknown, index: number) => unknown) => unknown[] }).map
				if (mapFn) {
					mapFn((item: unknown) => {
						renderer(item)
						return null
					})
				}
			}
		},
		renderCell: (accessor: EntityAccessor<object>) => {
			if (!fieldName) return null
			const ref = (accessor as unknown as Record<string, unknown>)[fieldName]
			const items = (ref as { items?: unknown[] })?.items
			if (!Array.isArray(items) || items.length === 0) return ''
			if (!renderer) return null

			return items.map((item, i) => {
				const result = renderer(item)
				if (result && typeof result === 'object' && 'value' in result) {
					const val = (result as { value: unknown }).value
					return <React.Fragment key={i}>{i > 0 ? ', ' : ''}{val != null ? String(val) : ''}</React.Fragment>
				}
				return <React.Fragment key={i}>{i > 0 ? ', ' : ''}{result}</React.Fragment>
			})
		},
	}

	return React.createElement(ColumnLeaf, leafProps as ColumnLeafProps)
}

// ============================================================================
// Action Column
// ============================================================================

export interface DataGridActionColumnProps {
	children: React.ReactNode | ((entity: unknown) => React.ReactNode)
	header?: React.ReactNode
}

export function DataGridActionColumn(_props: DataGridActionColumnProps): React.ReactElement | null {
	return null
}

;(DataGridActionColumn as unknown as { staticRender: (props: Record<string, unknown>) => React.ReactNode }).staticRender = (
	props: Record<string, unknown>,
): React.ReactNode => {
	const header = (props['header'] as React.ReactNode) ?? ''
	const children = props['children']
	const cellRenderer = typeof children === 'function'
		? children as (value: unknown) => React.ReactNode
		: () => children as React.ReactNode

	const leafProps: ColumnLeafProps = {
		name: `action-${Math.random().toString(36).slice(2, 8)}`,
		fieldName: null,
		fieldRef: null,
		sortingField: null,
		filterName: null,
		filterHandler: undefined,
		isTextSearchable: false,
		header,
		renderCell: (accessor: EntityAccessor<object>) => cellRenderer(accessor),
	}

	return React.createElement(ColumnLeaf, leafProps as ColumnLeafProps)
}

// ============================================================================
// Generic Column
// ============================================================================

export interface DataGridColumnProps<T> {
	field?: FieldRefBase<T>
	header?: React.ReactNode
	sortable?: boolean
	filter?: boolean
	filterHandler?: FilterHandler<FilterArtifact>
	children?: (value: T | null) => React.ReactNode
}

export function DataGridColumn<T>(_props: DataGridColumnProps<T>): React.ReactElement | null {
	return null
}

;(DataGridColumn as unknown as { staticRender: (props: Record<string, unknown>) => React.ReactNode }).staticRender = (
	props: Record<string, unknown>,
): React.ReactNode => {
	const fieldRef = props['field'] as FieldRefBase<unknown> | undefined
	const fieldName = fieldRef ? extractFieldName(fieldRef) : null
	const header = (props['header'] as React.ReactNode) ?? fieldName ?? ''
	const sortable = (props['sortable'] as boolean | undefined) ?? false
	const filterEnabled = (props['filter'] as boolean | undefined) ?? false
	const customHandler = props['filterHandler'] as FilterHandler<FilterArtifact> | undefined
	const children = props['children'] as ((value: unknown) => React.ReactNode) | undefined

	const leafProps: ColumnLeafProps = {
		name: fieldName ?? `col-${Math.random().toString(36).slice(2, 8)}`,
		fieldName,
		fieldRef: fieldRef ?? null,
		sortingField: sortable && fieldName ? fieldName : null,
		filterName: filterEnabled && fieldName ? fieldName : null,
		filterHandler: filterEnabled && fieldName
			? (customHandler ?? textColumnDef.createFilterHandler(fieldName) as FilterHandler<FilterArtifact>)
			: undefined,
		isTextSearchable: false,
		header,
		renderCell: (accessor: EntityAccessor<object>) => {
			if (!fieldName) return null
			const ref = (accessor as unknown as Record<string, unknown>)[fieldName]
			const value = ref && typeof ref === 'object' && 'value' in ref
				? (ref as { value: unknown }).value ?? null
				: null
			if (children) return children(value)
			return value != null ? String(value) : ''
		},
	}

	return React.createElement(ColumnLeaf, leafProps as ColumnLeafProps)
}
