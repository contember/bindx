/**
 * DefaultDataGrid — top-level component that wraps DataGrid with a pre-configured layout.
 *
 * Renders toolbar, table (auto from columns), optional named layouts, pagination, and empty state.
 * The user provides column markers (and optional toolbar/layout markers) via a children render function:
 *
 * ```tsx
 * <DefaultDataGrid entity={schema.Article} itemsPerPage={5}>
 *   {it => (
 *     <>
 *       <DataGridTextColumn field={it.title} header="Title" sortable filter />
 *       <DataGridDateColumn field={it.publishedAt} header="Published" sortable filter />
 *     </>
 *   )}
 * </DefaultDataGrid>
 * ```
 */
import React, { type ReactElement, type ReactNode } from 'react'
import type { CommonEntity, EntityAccessor } from '@contember/bindx'
import {
	DataGrid,
	type DataGridProps,
	HasManyDataGrid,
	type HasManyDataGridProps,
} from '@contember/bindx-dataview'
import { DefaultDataGridLayout, type DefaultDataGridLayoutProps } from '#bindx-ui/datagrid/default-layout'

export type DefaultDataGridProps<TRoleMap extends Record<string, object> = Record<string, object>> =
	& Omit<DataGridProps<TRoleMap>, 'children'>
	& DefaultDataGridLayoutProps
	& {
		/** Children render function: receives entity proxy `it`, returns column/toolbar/layout markers */
		children: (it: EntityAccessor<CommonEntity<TRoleMap>>) => ReactNode
	}

export function DefaultDataGrid<TRoleMap extends Record<string, object>>({
	children,
	stickyToolbar,
	stickyPagination,
	...dataGridProps
}: DefaultDataGridProps<TRoleMap>): ReactElement {
	return (
		<DataGrid {...dataGridProps}>
			{it => (
				<>
					{children(it)}
					<DefaultDataGridLayout
						stickyToolbar={stickyToolbar}
						stickyPagination={stickyPagination}
					/>
				</>
			)}
		</DataGrid>
	)
}

export type DefaultHasManyDataGridProps<TEntity extends object = object> =
	& Omit<HasManyDataGridProps<TEntity>, 'children'>
	& DefaultDataGridLayoutProps
	& {
		children: (it: EntityAccessor<TEntity>) => ReactNode
	}

export function DefaultHasManyDataGrid<TEntity extends object>({
	children,
	stickyToolbar,
	stickyPagination,
	...props
}: DefaultHasManyDataGridProps<TEntity>): ReactElement {
	return (
		<HasManyDataGrid {...props}>
			{it => (
				<>
					{children(it)}
					<DefaultDataGridLayout
						stickyToolbar={stickyToolbar}
						stickyPagination={stickyPagination}
					/>
				</>
			)}
		</HasManyDataGrid>
	)
}
