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

import React, { ReactNode } from 'react'
import type { FieldRefBase, HasOneRef, HasManyRef, FilterHandler, FilterArtifact, EntityAccessor, EnumFilterArtifact, EnumListFilterArtifact, SelectionMeta } from '@contember/bindx'
import { SelectionScope } from '@contember/bindx'
import { FIELD_REF_META, createCollectorProxy } from '@contember/bindx-react'
import { createColumn, type ColumnRenderProps } from './createColumn.js'
import { accessField } from './columnTypes.js'
import { createRelationColumn, hasOneCellConfig, hasManyCellConfig, type RelationColumnProps } from './createRelationColumn.jsx'
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
	hasOneColumnDef,
	hasManyColumnDef,
} from './columnTypes.js'
import { ColumnLeaf, type ColumnLeafProps } from './columnLeaf.js'

// ============================================================================
// Re-export ColumnLeafProps as ColumnMeta for compatibility
// ============================================================================

export type ColumnMeta = ColumnLeafProps

// ============================================================================
// Extraction Helpers
// ============================================================================

interface FieldRefMetaCarrier {
	readonly [FIELD_REF_META]: {
		readonly entityType: string
		readonly fieldName: string
		readonly isArray: boolean
		readonly isRelation: boolean
		readonly enumName?: string
	}
}

/** Type guard: checks if a value carries FIELD_REF_META symbol. */
export function hasFieldRefMeta(ref: unknown): ref is FieldRefMetaCarrier {
	return ref != null && typeof ref === 'object' && FIELD_REF_META in ref
}

/** Extract field name from a field ref (works in both collector and runtime proxies). */
export function extractFieldName(ref: unknown): string | null {
	return hasFieldRefMeta(ref) ? ref[FIELD_REF_META].fieldName : null
}

/** Extract enum name from a field ref (if field is an enum). */
export function extractEnumName(ref: unknown): string | undefined {
	return hasFieldRefMeta(ref) ? ref[FIELD_REF_META].enumName : undefined
}

/** Extract related entity type name from a relation field ref. */
export function extractRelatedEntityName(ref: unknown): string | null {
	if (!hasFieldRefMeta(ref)) return null
	const meta = ref[FIELD_REF_META]
	return meta.entityType || null
}

/**
 * Access a related entity accessor from a parent row accessor by field name.
 * EntityAccessor is a Proxy — bracket notation triggers the get trap.
 */
export function getRelatedAccessor(item: EntityAccessor<object>, fieldName: string): EntityAccessor<object> | null {
	return accessField(item, fieldName) as EntityAccessor<object> | null
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

interface EnumExtraProps<T extends string> {
	options: Record<T, ReactNode>
}

export interface DataGridEnumColumnProps<T extends string> extends DataGridScalarColumnPropsBase<T>, EnumExtraProps<NoInfer<T>> {}

export interface DataGridEnumListColumnProps<T extends string> extends DataGridScalarColumnPropsBase<T>, EnumExtraProps<NoInfer<T>> {}

// ============================================================================
// Scalar Columns via createColumn()
//
// createColumn handles `children` (custom cell renderer) and `options` (enum)
// natively — no monkey-patching needed.
// ============================================================================

export const DataGridTextColumn = createColumn(textColumnDef, {
	renderCell: renderScalarDefault,
})

export const DataGridNumberColumn = createColumn(numberColumnDef, {
	renderCell: renderScalarDefault,
})

export const DataGridDateColumn = createColumn(dateColumnDef, {
	renderCell: renderScalarDefault,
})

export const DataGridDateTimeColumn = createColumn(dateTimeColumnDef, {
	renderCell: renderDateTimeDefault,
})

export const DataGridBooleanColumn = createColumn(booleanColumnDef, {
	renderCell: renderBooleanDefault,
})

export const DataGridEnumColumn = createColumn<string | null, EnumFilterArtifact, EnumExtraProps<string>>(enumColumnDef, {
	renderCell: renderScalarDefault,
}) as <TValue extends string>(props: DataGridEnumColumnProps<TValue>) => ReactNode

export const DataGridEnumListColumn = createColumn<readonly string[] | null, EnumListFilterArtifact, EnumExtraProps<string>>(enumListColumnDef, {
	renderCell: renderEnumListDefault,
}) as <TValue extends string>(props: DataGridEnumListColumnProps<TValue>) => ReactNode

export const DataGridUuidColumn = createColumn(uuidColumnDef, {
	renderCell: renderScalarDefault,
})

export const DataGridIsDefinedColumn = createColumn(isDefinedColumnDef, {
	renderCell: renderIsDefinedDefault,
})

// ============================================================================
// Relation Column Props & Components
// ============================================================================

export interface DataGridHasOneColumnProps<TEntity, TSelected> extends RelationColumnProps<TEntity, TSelected> {
	field: HasOneRef<TEntity, TSelected>
}

/** Headless HasOne column — no filter UI or cell tooltip. Use @contember/bindx-ui for styled version. */
const _DataGridHasOneColumn = createRelationColumn(hasOneColumnDef, hasOneCellConfig)
export const DataGridHasOneColumn: {
	<TEntity, TSelected>(props: DataGridHasOneColumnProps<TEntity, TSelected>): null
	staticRender: typeof _DataGridHasOneColumn.staticRender
	buildLeaf: typeof _DataGridHasOneColumn.buildLeaf
} = _DataGridHasOneColumn

// ============================================================================
// HasMany Column
// ============================================================================

export interface DataGridHasManyColumnProps<TEntity, TSelected> extends RelationColumnProps<TEntity, TSelected> {
	field: HasManyRef<TEntity, TSelected>
}

/** Headless HasMany column — no filter UI or cell tooltip. Use @contember/bindx-ui for styled version. */
const _DataGridHasManyColumn = createRelationColumn(hasManyColumnDef, hasManyCellConfig)
export const DataGridHasManyColumn: {
	<TEntity, TSelected>(props: DataGridHasManyColumnProps<TEntity, TSelected>): null
	staticRender: typeof _DataGridHasManyColumn.staticRender
	buildLeaf: typeof _DataGridHasManyColumn.buildLeaf
} = _DataGridHasManyColumn

// ============================================================================
// Action Column
// ============================================================================

export interface DataGridActionColumnProps {
	children: React.ReactNode | ((entity: EntityAccessor<object>) => React.ReactNode)
	header?: React.ReactNode
}

export const DataGridActionColumn = Object.assign(
	function DataGridActionColumn(_props: DataGridActionColumnProps): null {
		return null
	},
	{
		staticRender: (props: Record<string, unknown>): React.ReactNode => {
			const header = (props['header'] as React.ReactNode) ?? ''
			const children = props['children']
			const cellRenderer = typeof children === 'function'
				? children as (value: unknown) => React.ReactNode
				: () => children as React.ReactNode

			const leafProps: ColumnLeafProps = {
				columnType: 'action',
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
		},
	},
)

// ============================================================================
// Generic Column
// ============================================================================

export interface DataGridColumnProps<T> {
	field?: FieldRefBase<T>
	header?: React.ReactNode
	sortable?: boolean
	filter?: boolean
	filterHandler?: FilterHandler<FilterArtifact>
	children?: (value: T | null, accessor: EntityAccessor<object>) => React.ReactNode
}

export const DataGridColumn = Object.assign(
	function DataGridColumn<T>(_props: DataGridColumnProps<T>): null {
		return null
	},
	{
		staticRender: (props: Record<string, unknown>): React.ReactNode => {
			const fieldRef = props['field'] as FieldRefBase<unknown> | undefined
			const fieldName = fieldRef ? extractFieldName(fieldRef) : null
			const header = props['header'] as React.ReactNode | undefined
			const sortable = (props['sortable'] as boolean | undefined) ?? false
			const filterEnabled = (props['filter'] as boolean | undefined) ?? true
			const customHandler = props['filterHandler'] as FilterHandler<FilterArtifact> | undefined
			const children = props['children'] as ((value: unknown, accessor: EntityAccessor<object>) => React.ReactNode) | undefined

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
					if (children) return children(value, accessor)
					return value != null ? String(value) : ''
				},
			}

			return React.createElement(ColumnLeaf, leafProps as ColumnLeafProps)
		},
	},
)
