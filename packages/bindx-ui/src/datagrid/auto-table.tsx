/**
 * DataGridAutoTable — renders a full table (headers + rows) from DataView context columns.
 *
 * This is the standard table layout for DataGrid. It reads columns from the
 * DataView context and renders them automatically with sorting indicators,
 * column visibility, filter controls, and row highlighting.
 *
 * Usage:
 * ```tsx
 * <DataGrid entity={schema.Article} columns={it => (...)}>
 *   <DefaultDataGrid>
 *     <DataViewLayout name="table">
 *       <DataGridAutoTable />
 *     </DataViewLayout>
 *   </DefaultDataGrid>
 * </DataGrid>
 * ```
 */
import type { ReactElement } from 'react'
import {
	useDataViewContext,
	DataViewEachRow,
	DataViewHighlightRow,
	DataViewKeyboardEventHandler,
	DataViewElement,
	DataViewEmpty,
	DataViewNonEmpty,
	type DataViewItem,
} from '@contember/bindx-dataview'
import {
	DataGridTableWrapper,
	DataGridTable,
	DataGridThead,
	DataGridTbody,
	DataGridHeaderRow,
	DataGridRow,
	DataGridHeaderCell,
	DataGridCell,
	DataGridEmptyState,
} from './table.js'
import { DataGridColumnHeaderUI } from './column-header.js'

export interface DataGridAutoTableProps {
	onSelectHighlighted?: (item: DataViewItem) => void
}

export function DataGridAutoTable({ onSelectHighlighted }: DataGridAutoTableProps): ReactElement {
	const { columns } = useDataViewContext()

	return (
		<DataViewKeyboardEventHandler onSelectHighlighted={onSelectHighlighted}>
			<DataGridTableWrapper data-testid="datagrid-table">
				<DataGridTable>
					<DataGridThead>
						<DataGridHeaderRow data-testid="datagrid-header">
							{columns.map(col => (
								<DataViewElement key={col.name} name={col.name}>
									<DataGridHeaderCell data-testid={`datagrid-header-${col.name}`}>
										<DataGridColumnHeaderUI
											sortingField={col.sortingField && col.fieldRef ? col.fieldRef : undefined}
											hidingName={col.fieldName ?? undefined}
											filterName={col.filterName ?? undefined}
											filter={col.renderFilter
												? col.renderFilter({ artifact: undefined, setArtifact: () => {} })
												: undefined}
										>
											{col.header}
										</DataGridColumnHeaderUI>
									</DataGridHeaderCell>
								</DataViewElement>
							))}
						</DataGridHeaderRow>
					</DataGridThead>
					<DataGridTbody data-testid="datagrid-body">
						<DataViewNonEmpty>
							<DataViewEachRow>
								{(item, rowIndex) => (
									<DataViewHighlightRow key={item.id} index={rowIndex}>
										<DataGridRow data-testid={`datagrid-row-${rowIndex}`}>
											{columns.map(col => (
												<DataViewElement key={col.name} name={col.name}>
													<DataGridCell data-testid={`datagrid-cell-${col.name}`}>
														{col.renderCell(item)}
													</DataGridCell>
												</DataViewElement>
											))}
										</DataGridRow>
									</DataViewHighlightRow>
								)}
							</DataViewEachRow>
						</DataViewNonEmpty>
						<DataViewEmpty>
							<tr>
								<td colSpan={columns.length}>
									<DataGridEmptyState>No results found</DataGridEmptyState>
								</td>
							</tr>
						</DataViewEmpty>
					</DataGridTbody>
				</DataGridTable>
			</DataGridTableWrapper>
		</DataViewKeyboardEventHandler>
	)
}
