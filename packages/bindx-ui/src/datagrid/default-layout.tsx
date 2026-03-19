/**
 * Shared layout for DefaultDataGrid and DefaultHasManyDataGrid.
 * Renders toolbar, loader, table/custom layouts, pagination.
 */
import React, { type ReactElement } from 'react'
import {
	DataViewLayout,
	DataViewEachRow,
	DataViewEmpty,
	DataViewNonEmpty,
	useDataViewContext,
} from '@contember/bindx-dataview'
import { DataGridToolbarUI } from './toolbar.js'
import { DataGridLoader } from './loader.js'
import { DataGridPaginationUI } from './pagination.js'
import { DataGridContainer } from './table.js'
import { DataGridAutoTable } from './auto-table.js'
import { DataGridNoResults } from './empty.js'

export interface DefaultDataGridLayoutProps {
	stickyToolbar?: boolean
	stickyPagination?: boolean
}

export function DefaultDataGridLayout({
	stickyToolbar,
	stickyPagination,
}: DefaultDataGridLayoutProps): ReactElement {
	const { toolbarContent, layoutRenders } = useDataViewContext()

	return (
		<DataGridContainer>
			{toolbarContent && (
				<DataGridToolbarUI sticky={stickyToolbar}>
					{toolbarContent}
				</DataGridToolbarUI>
			)}

			<DataGridLoader>
				<DataViewEmpty>
					<DataGridNoResults />
				</DataViewEmpty>

				<DataViewNonEmpty>
					<DataViewLayout name="table">
						<DataGridAutoTable />
					</DataViewLayout>

					{Array.from(layoutRenders.entries()).map(([name, render]) => (
						<DataViewLayout key={name} name={name}>
							<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
								<DataViewEachRow>
									{render}
								</DataViewEachRow>
							</div>
						</DataViewLayout>
					))}
				</DataViewNonEmpty>
			</DataGridLoader>

			<DataGridPaginationUI sticky={stickyPagination} />
		</DataGridContainer>
	)
}
