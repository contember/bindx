/**
 * DataGrid — top-level component that wraps DataGrid with a pre-configured layout.
 *
 * Renders toolbar, table (auto from columns), optional named layouts, pagination, and empty state.
 * The user provides column markers (and optional toolbar/layout markers) via a children render function:
 *
 * ```tsx
 * <DataGrid entity={schema.Article} itemsPerPage={5}>
 *   {it => (
 *     <>
 *       <TextColumn field={it.title} header="Title" sortable filter />
 *       <DateColumn field={it.publishedAt} header="Published" sortable filter />
 *     </>
 *   )}
 * </DataGrid>
 * ```
 */
import React, { type ReactElement, type ReactNode } from 'react'
import type { CommonEntity, EntityAccessor } from '@contember/bindx'
import {
	DataGrid as DataGridCore,
	type DataGridProps as DataGridCoreProps,
	HasManyDataGrid as HasManyDataGridCore,
	type HasManyDataGridProps as HasManyDataGridCoreProps,
} from '@contember/bindx-dataview'
import { DataGridLayout, type DataGridLayoutProps } from '#bindx-ui/datagrid/layout'

export type DataGridProps<TRoleMap extends Record<string, object> = Record<string, object>> =
	& Omit<DataGridCoreProps<TRoleMap>, 'children'>
	& DataGridLayoutProps
	& {
		/** Children render function: receives entity proxy `it`, returns column/toolbar/layout markers */
		children: (it: EntityAccessor<CommonEntity<TRoleMap>>) => ReactNode
	}

export function DataGrid<TRoleMap extends Record<string, object>>({
	children,
	stickyToolbar,
	stickyPagination,
	...dataGridProps
}: DataGridProps<TRoleMap>): ReactElement {
	return (
		<DataGridCore {...dataGridProps}>
			{it => (
				<>
					{children(it)}
					<DataGridLayout
						stickyToolbar={stickyToolbar}
						stickyPagination={stickyPagination}
					/>
				</>
			)}
		</DataGridCore>
	)
}

export type HasManyDataGridProps<TEntity extends object = object> =
	& Omit<HasManyDataGridCoreProps<TEntity>, 'children'>
	& DataGridLayoutProps
	& {
		children: (it: EntityAccessor<TEntity>) => ReactNode
	}

export function HasManyDataGrid<TEntity extends object>({
	children,
	stickyToolbar,
	stickyPagination,
	...props
}: HasManyDataGridProps<TEntity>): ReactElement {
	return (
		<HasManyDataGridCore {...props}>
			{it => (
				<>
					{children(it)}
					<DataGridLayout
						stickyToolbar={stickyToolbar}
						stickyPagination={stickyPagination}
					/>
				</>
			)}
		</HasManyDataGridCore>
	)
}
