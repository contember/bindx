/**
 * DefaultDataGrid — pre-configured DataGrid with toolbar, loader, table, and pagination.
 */
import type { ReactElement, ReactNode } from 'react'
import { useDataViewContext } from '@contember/bindx-dataview'
import { DataGridToolbarUI } from './toolbar.js'
import { DataGridLoader } from './loader.js'
import { DataGridPaginationUI } from './pagination.js'
import { DataGridContainer } from './table.js'

export interface DefaultDataGridProps {
	children: ReactNode
	toolbar?: ReactNode
	stickyToolbar?: boolean
	stickyPagination?: boolean
}

/**
 * Default DataGrid layout with toolbar, loader, and pagination.
 *
 * Expects to be rendered inside a DataViewProvider or DataGrid context.
 * The `toolbar` prop takes precedence; if omitted, uses toolbar from DataGrid context.
 */
export function DefaultDataGrid({
	children,
	toolbar,
	stickyToolbar,
	stickyPagination,
}: DefaultDataGridProps): ReactElement {
	const { toolbarContent } = useDataViewContext()

	return (
		<DataGridContainer>
			<DataGridToolbarUI sticky={stickyToolbar}>
				{toolbar ?? toolbarContent}
			</DataGridToolbarUI>

			<DataGridLoader>
				{children}
			</DataGridLoader>

			<DataGridPaginationUI sticky={stickyPagination} />
		</DataGridContainer>
	)
}
