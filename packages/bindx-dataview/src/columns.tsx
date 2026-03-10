/**
 * DataGrid column components.
 *
 * These are "metadata" components --- they are not rendered directly.
 * Instead, the DataGrid parent analyzes them to extract column definitions,
 * selection metadata, and filter/sort configuration.
 */

import React from 'react'
import type { FieldRefBase, HasOneRef, HasManyRef } from '@contember/bindx-react'
import { FIELD_REF_META } from '@contember/bindx-react'
import type { FilterHandler, FilterArtifact } from '@contember/bindx'
import {
	createTextFilterHandler,
	createNumberRangeFilterHandler,
	createDateFilterHandler,
	createBooleanFilterHandler,
	createEnumFilterHandler,
	createEnumListFilterHandler,
	createIsDefinedFilterHandler,
	createRelationFilterHandler,
} from '@contember/bindx'

// ============================================================================
// Column Metadata
// ============================================================================

export const COLUMN_META = Symbol('COLUMN_META')

/**
 * Column metadata extracted during collection phase.
 */
export interface ColumnMeta {
	readonly type: 'text' | 'number' | 'date' | 'dateTime' | 'boolean' | 'enum' | 'enumList' | 'uuid' | 'isDefined' | 'hasOne' | 'hasMany' | 'action' | 'custom'
	/** Field name on entity (null for action column) */
	readonly fieldName: string | null
	/** Typed field reference from the collector proxy (null for action column) */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly fieldRef: FieldRefBase<any> | null
	/** Column header text */
	readonly header: React.ReactNode
	/** Whether column supports sorting */
	readonly sortable: boolean
	/** Whether column has filtering enabled */
	readonly filterable: boolean
	/** Filter handler for this column */
	readonly filterHandler?: FilterHandler<FilterArtifact>
	/** Render function for relation content (hasOne/hasMany children callback) */
	readonly relationRenderer?: (ref: unknown) => React.ReactNode
	/** Enum options (for enum/enumList columns) */
	readonly enumOptions?: readonly string[]
	/** Custom cell renderer */
	readonly cellRenderer?: (value: unknown) => React.ReactNode
}

export interface ColumnElementProps {
	[COLUMN_META]: ColumnMeta
}

// ============================================================================
// Scalar Column Props & Components
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

export function DataGridTextColumn<T>(_props: DataGridTextColumnProps<T>): React.ReactElement | null {
	return null
}

export function DataGridNumberColumn<T>(_props: DataGridNumberColumnProps<T>): React.ReactElement | null {
	return null
}

export function DataGridDateColumn<T>(_props: DataGridDateColumnProps<T>): React.ReactElement | null {
	return null
}

export function DataGridDateTimeColumn<T>(_props: DataGridDateTimeColumnProps<T>): React.ReactElement | null {
	return null
}

export function DataGridBooleanColumn<T>(_props: DataGridBooleanColumnProps<T>): React.ReactElement | null {
	return null
}

export function DataGridEnumColumn<T>(_props: DataGridEnumColumnProps<T>): React.ReactElement | null {
	return null
}

export function DataGridEnumListColumn<T>(_props: DataGridEnumListColumnProps<T>): React.ReactElement | null {
	return null
}

export function DataGridUuidColumn<T>(_props: DataGridUuidColumnProps<T>): React.ReactElement | null {
	return null
}

export function DataGridIsDefinedColumn<T>(_props: DataGridIsDefinedColumnProps<T>): React.ReactElement | null {
	return null
}

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

const filterFactories: Record<string, (fieldPath: string) => FilterHandler<FilterArtifact>> = {
	text: createTextFilterHandler,
	number: createNumberRangeFilterHandler,
	date: createDateFilterHandler,
	dateTime: createDateFilterHandler,
	boolean: createBooleanFilterHandler,
	enum: createEnumFilterHandler,
	enumList: createEnumListFilterHandler,
	isDefined: createIsDefinedFilterHandler,
	hasOne: createRelationFilterHandler,
	hasMany: createRelationFilterHandler,
}

function createFilterHandlerForColumn(type: string, fieldName: string): FilterHandler<FilterArtifact> | undefined {
	const factory = filterFactories[type]
	return factory ? factory(fieldName) : undefined
}

// ============================================================================
// Scalar Column Extraction
// ============================================================================

type ScalarColumnType = ColumnMeta['type']

interface ScalarColumnConfig {
	readonly type: ScalarColumnType
	readonly defaultSortable: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scalarColumnComponents = new Map<React.FC<any>, ScalarColumnConfig>([
	[DataGridTextColumn, { type: 'text', defaultSortable: true }],
	[DataGridNumberColumn, { type: 'number', defaultSortable: true }],
	[DataGridDateColumn, { type: 'date', defaultSortable: true }],
	[DataGridDateTimeColumn, { type: 'dateTime', defaultSortable: true }],
	[DataGridBooleanColumn, { type: 'boolean', defaultSortable: false }],
	[DataGridEnumColumn, { type: 'enum', defaultSortable: true }],
	[DataGridEnumListColumn, { type: 'enumList', defaultSortable: false }],
	[DataGridUuidColumn, { type: 'uuid', defaultSortable: false }],
	[DataGridIsDefinedColumn, { type: 'isDefined', defaultSortable: false }],
])

function extractScalarColumn(
	config: ScalarColumnConfig,
	props: Record<string, unknown>,
): ColumnMeta {
	const propFieldRef = props['field'] as FieldRefBase<unknown> | undefined
	const fieldName = propFieldRef ? extractFieldName(propFieldRef) : null
	const filterable = (props['filter'] as boolean) ?? false

	return {
		type: config.type,
		fieldName,
		fieldRef: propFieldRef ?? null,
		header: (props['header'] as React.ReactNode) ?? fieldName ?? '',
		sortable: (props['sortable'] as boolean) ?? config.defaultSortable,
		filterable,
		filterHandler: filterable && fieldName ? createFilterHandlerForColumn(config.type, fieldName) : undefined,
		cellRenderer: props['children'] as ((value: unknown) => React.ReactNode) | undefined,
		enumOptions: (config.type === 'enum' || config.type === 'enumList')
			? props['options'] as readonly string[] | undefined
			: undefined,
	}
}

// ============================================================================
// Column Extraction
// ============================================================================

/**
 * Extract column metadata from a JSX element tree.
 *
 * Walks the children returned by the DataGrid render callback
 * and collects column definitions, including filter handlers
 * when `filter` prop is enabled on a column.
 *
 * When a collector proxy is provided, relation renderers are called
 * during collection to capture nested field accesses for the selection.
 */
export function extractColumns(elements: React.ReactNode, collectorProxy?: unknown): ColumnMeta[] {
	const columns: ColumnMeta[] = []

	React.Children.forEach(elements, (child) => {
		if (!React.isValidElement(child)) return

		const componentType = child.type
		const props = child.props as Record<string, unknown>

		const scalarConfig = scalarColumnComponents.get(componentType as React.FC)
		if (scalarConfig) {
			columns.push(extractScalarColumn(scalarConfig, props))
			return
		}

		if (componentType === DataGridHasOneColumn) {
			const propFieldRef = props['field'] as FieldRefBase<unknown> | undefined
			const fieldName = propFieldRef ? extractFieldName(propFieldRef) : null
			const renderer = props['children'] as ((ref: unknown) => React.ReactNode) | undefined

			// Call renderer during collection to capture nested field accesses
			if (renderer && propFieldRef && collectorProxy) {
				renderer(propFieldRef)
			}

			columns.push({
				type: 'hasOne',
				fieldName,
				fieldRef: propFieldRef ?? null,
				header: (props['header'] as React.ReactNode) ?? fieldName ?? '',
				sortable: false,
				filterable: false,
				relationRenderer: renderer,
			})
		} else if (componentType === DataGridHasManyColumn) {
			const propFieldRef = props['field'] as FieldRefBase<unknown> | undefined
			const fieldName = propFieldRef ? extractFieldName(propFieldRef) : null
			const renderer = props['children'] as ((ref: unknown) => React.ReactNode) | undefined

			// Call renderer during collection with a simulated item from map()
			if (renderer && propFieldRef && collectorProxy) {
				const mapFn = (propFieldRef as { map?: (fn: (item: unknown, index: number) => unknown) => unknown[] }).map
				if (mapFn) {
					mapFn((item: unknown) => {
						renderer(item)
						return null
					})
				}
			}

			columns.push({
				type: 'hasMany',
				fieldName,
				fieldRef: propFieldRef ?? null,
				header: (props['header'] as React.ReactNode) ?? fieldName ?? '',
				sortable: false,
				filterable: false,
				relationRenderer: renderer,
			})
		} else if (componentType === DataGridActionColumn) {
			columns.push({
				type: 'action',
				fieldName: null,
				fieldRef: null,
				header: (props['header'] as React.ReactNode) ?? '',
				sortable: false,
				filterable: false,
				cellRenderer: typeof props['children'] === 'function'
					? props['children'] as (value: unknown) => React.ReactNode
					: () => props['children'] as React.ReactNode,
			})
		} else if (componentType === DataGridColumn) {
			const propFieldRef = props['field'] as FieldRefBase<unknown> | undefined
			const fieldName = propFieldRef ? extractFieldName(propFieldRef) : null
			const filterable = (props['filter'] as boolean) ?? false
			const customHandler = props['filterHandler'] as FilterHandler<FilterArtifact> | undefined

			columns.push({
				type: 'custom',
				fieldName,
				fieldRef: propFieldRef ?? null,
				header: (props['header'] as React.ReactNode) ?? fieldName ?? '',
				sortable: (props['sortable'] as boolean) ?? false,
				filterable,
				filterHandler: filterable && fieldName ? (customHandler ?? createFilterHandlerForColumn('text', fieldName)) : undefined,
				cellRenderer: props['children'] as ((value: unknown) => React.ReactNode) | undefined,
			})
		} else if (componentType === React.Fragment) {
			columns.push(...extractColumns(props['children'] as React.ReactNode, collectorProxy))
		}
	})

	return columns
}
