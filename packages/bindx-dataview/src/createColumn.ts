/**
 * `createColumn()` — factory for building column components from a column type definition.
 *
 * Layer 2 in the column architecture: wraps a headless `ColumnTypeDef` with
 * rendering configuration (cell renderer, optional filter renderer) to produce
 * a React component usable inside `<DataGrid columns={...}>`.
 */

import React from 'react'
import type { FieldRefBase, FilterArtifact, FilterHandler, EntityAccessor } from '@contember/bindx'
import type { ColumnTypeDef } from './columnTypes.js'
import { ColumnLeaf, type ColumnLeafProps } from './columnLeaf.js'
import { extractFieldName } from './columns.js'

// ============================================================================
// Render Props
// ============================================================================

export interface ColumnRenderProps<TValue> {
	readonly value: TValue
	readonly accessor: EntityAccessor<object>
	readonly fieldRef: FieldRefBase<unknown> | null
	readonly fieldName: string | null
}

export interface FilterRenderProps<TFilterArtifact> {
	readonly artifact: TFilterArtifact
	readonly setArtifact: (artifact: TFilterArtifact) => void
}

// ============================================================================
// Config
// ============================================================================

export interface CreateColumnConfig<TValue, TFilterArtifact extends FilterArtifact, TExtraProps = object> {
	readonly renderCell: (props: ColumnRenderProps<TValue> & TExtraProps) => React.ReactNode
	readonly renderFilter?: (props: FilterRenderProps<TFilterArtifact>) => React.ReactNode
}

// ============================================================================
// Column Component Props
// ============================================================================

export interface ColumnComponentProps<TValue = unknown> {
	field: FieldRefBase<TValue>
	header?: React.ReactNode
	sortable?: boolean
	filter?: boolean
	children?: (value: TValue | null) => React.ReactNode
}

// ============================================================================
// Factory
// ============================================================================

interface ColumnComponent<TValue, TExtraProps> extends React.FC<ColumnComponentProps<TValue> & TExtraProps> {
	staticRender: (props: Record<string, unknown>) => React.ReactNode
}

export function createColumn<TValue, TFilterArtifact extends FilterArtifact, TExtraProps = object>(
	columnType: ColumnTypeDef<TValue, TFilterArtifact>,
	config: CreateColumnConfig<TValue, TFilterArtifact, TExtraProps>,
): ColumnComponent<TValue, TExtraProps> {
	function Column(_props: ColumnComponentProps<TValue> & TExtraProps): null {
		return null
	}

	Column.staticRender = (props: Record<string, unknown>): React.ReactNode => {
		const fieldRef = props['field'] as FieldRefBase<unknown> | undefined
		const fieldName = fieldRef ? extractFieldName(fieldRef) : null
		const header = (props['header'] as React.ReactNode) ?? fieldName ?? ''
		const sortable = (props['sortable'] as boolean | undefined) ?? columnType.defaultSortable
		const filterEnabled = (props['filter'] as boolean | undefined) ?? false
		const children = props['children'] as ((value: TValue | null) => React.ReactNode) | undefined
		const enumOptions = props['options'] as readonly string[] | undefined

		const renderCell = children
			? (accessor: EntityAccessor<object>): React.ReactNode => {
				const value = fieldName
					? columnType.extractValue(accessor as unknown as Record<string, unknown>, fieldName)
					: null as TValue
				return children(value)
			}
			: (accessor: EntityAccessor<object>): React.ReactNode => {
				const value = fieldName
					? columnType.extractValue(accessor as unknown as Record<string, unknown>, fieldName)
					: null as TValue
				return config.renderCell({
					value,
					accessor,
					fieldRef: fieldRef ?? null,
					fieldName,
					...props as unknown as TExtraProps,
				})
			}

		const leafProps: ColumnLeafProps = {
			name: fieldName ?? `col-${Math.random().toString(36).slice(2, 8)}`,
			fieldName,
			fieldRef: fieldRef ?? null,
			sortingField: sortable && fieldName ? fieldName : null,
			filterName: filterEnabled && fieldName ? fieldName : null,
			filterHandler: filterEnabled && fieldName
				? columnType.createFilterHandler(fieldName) as FilterHandler<FilterArtifact>
				: undefined,
			isTextSearchable: columnType.isTextSearchable,
			columnType: columnType.name,
			enumOptions,
			header,
			renderCell,
			renderFilter: config.renderFilter
				? ({ artifact, setArtifact }) => config.renderFilter!({
					artifact: artifact as TFilterArtifact,
					setArtifact: setArtifact as (artifact: TFilterArtifact) => void,
				})
				: undefined,
		}

		return React.createElement(ColumnLeaf, leafProps as ColumnLeafProps)
	}

	return Column as ColumnComponent<TValue, TExtraProps>
}
