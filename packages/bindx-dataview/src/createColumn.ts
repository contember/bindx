/**
 * `createColumn()` — factory for building column components from a column type definition.
 *
 * Layer 2 in the column architecture: wraps a headless `ColumnTypeDef` with
 * rendering configuration (cell renderer, optional filter renderer) to produce
 * a React component usable inside a DataGrid children render function.
 */

import React from 'react'
import type { FieldRef, FilterArtifact, FilterHandler, EntityAccessor } from '@contember/bindx'
import type { ColumnTypeDef } from './columnTypes.js'
import { ColumnLeaf, type ColumnLeafProps } from './columnLeaf.js'
import { extractFieldName, extractEnumName } from './columns.js'

// ============================================================================
// Render Props
// ============================================================================

export interface ColumnRenderProps<TValue> {
	readonly value: TValue
	readonly accessor: EntityAccessor<object>
	readonly fieldRef: FieldRef<unknown> | null
	readonly fieldName: string | null
	readonly enumOptions: Readonly<Record<string, React.ReactNode>> | undefined
	readonly enumName: string | undefined
}

export interface FilterRenderProps<TFilterArtifact> {
	readonly artifact: TFilterArtifact
	readonly setArtifact: (artifact: TFilterArtifact) => void
}

// ============================================================================
// Config
// ============================================================================

export interface CreateColumnConfig<TValue, TFilterArtifact extends FilterArtifact> {
	readonly renderCell: (props: ColumnRenderProps<TValue>) => React.ReactNode
	readonly renderFilter?: (props: FilterRenderProps<TFilterArtifact>) => React.ReactNode
}

// ============================================================================
// Column Component Props
// ============================================================================

export interface ColumnComponentProps<TValue = unknown> {
	field: FieldRef<TValue>
	header?: React.ReactNode
	sortable?: boolean
	filter?: boolean
	children?: (value: TValue | null, accessor: EntityAccessor<object>) => React.ReactNode
}

// ============================================================================
// Factory
// ============================================================================

export interface ColumnComponent<TExtraProps = object> {
	<T>(props: ColumnComponentProps<T> & TExtraProps): null
	staticRender: (props: Record<string, unknown>) => React.ReactNode
}

/**
 * Build the static-render function for a column type definition. Used both by
 * {@link createColumn} and by column components that need a narrower generic
 * signature than `ColumnComponent` can express (e.g. enum columns constrained
 * to `T extends string`) — those define their own component and attach this
 * static render via `Object.assign`.
 */
export function createColumnStaticRender<TValue, TFilterArtifact extends FilterArtifact>(
	columnType: ColumnTypeDef<TValue, TFilterArtifact>,
	config: CreateColumnConfig<TValue, TFilterArtifact>,
): (props: Record<string, unknown>) => React.ReactNode {
	return (props: Record<string, unknown>): React.ReactNode => {
		const fieldRef = props['field'] as FieldRef<unknown> | undefined
		const fieldName = fieldRef ? extractFieldName(fieldRef) : null
		const header = props['header'] as React.ReactNode | undefined
		const sortable = (props['sortable'] as boolean | undefined) ?? columnType.defaultSortable
		const filterEnabled = (props['filter'] as boolean | undefined) ?? false
		const children = props['children'] as ((value: TValue | null, accessor: EntityAccessor<object>) => React.ReactNode) | undefined
		const rawOptions = props['options'] as readonly string[] | Readonly<Record<string, React.ReactNode>> | undefined
		const enumOptions: Readonly<Record<string, React.ReactNode>> | undefined = Array.isArray(rawOptions)
			? Object.fromEntries((rawOptions as readonly string[]).map(v => [v, v]))
			: rawOptions as Readonly<Record<string, React.ReactNode>> | undefined
		const enumName = extractEnumName(fieldRef)

		const renderCell = children
			? (accessor: EntityAccessor<object>): React.ReactNode => {
				const value = fieldName
					? columnType.extractValue(accessor, fieldName)
					: null as TValue
				return children(value, accessor)
			}
			: (accessor: EntityAccessor<object>): React.ReactNode => {
				const value = fieldName
					? columnType.extractValue(accessor, fieldName)
					: null as TValue
				return config.renderCell({
					value,
					accessor,
					fieldRef: fieldRef ?? null,
					fieldName,
					enumOptions,
					enumName,
				})
			}

		const leafProps = {
			name: fieldName ?? `col-${Math.random().toString(36).slice(2, 8)}`,
			fieldName,
			fieldRef: fieldRef ?? null,
			sortingField: sortable && fieldName ? fieldName : null,
			filterName: filterEnabled && fieldName ? fieldName : null,
			filterHandler: filterEnabled && fieldName
				? columnType.createFilterHandler(fieldName) as FilterHandler<FilterArtifact>
				: undefined,
			isTextSearchable: columnType.isTextSearchable,
			columnType: columnType.name as ColumnLeafProps['columnType'],
			enumName,
			enumOptions,
			header,
			renderCell,
			renderFilter: config.renderFilter
				? ({ artifact, setArtifact }: { artifact: unknown; setArtifact: (artifact: FilterArtifact) => void }) => config.renderFilter!({
					artifact: artifact as TFilterArtifact,
					setArtifact: setArtifact as (artifact: TFilterArtifact) => void,
				})
				: undefined,
		}

		return React.createElement(ColumnLeaf, leafProps as ColumnLeafProps)
	}
}

export function createColumn<TValue, TFilterArtifact extends FilterArtifact, TExtraProps = object>(
	columnType: ColumnTypeDef<TValue, TFilterArtifact>,
	config: CreateColumnConfig<TValue, TFilterArtifact>,
): ColumnComponent<TExtraProps> {
	function Column(_props: ColumnComponentProps<unknown> & TExtraProps): null {
		return null
	}
	Column.staticRender = createColumnStaticRender(columnType, config)
	return Column as ColumnComponent<TExtraProps>
}
