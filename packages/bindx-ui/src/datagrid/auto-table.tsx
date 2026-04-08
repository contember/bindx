/**
 * DataGridAutoTable — renders a full table from DataView context columns.
 *
 * Generic table renderer — no column-type-specific logic. Each column defines
 * its own renderFilter, renderCellWrapper, and renderCell on ColumnLeafProps.
 */
import type { ReactElement, ReactNode } from 'react'
import type { FilterArtifact } from '@contember/bindx'
import {
	useDataViewContext,
	DataViewEachRow,
	DataViewHighlightRow,
	DataViewKeyboardEventHandler,
	DataViewElement,
	DataViewEmpty,
	DataViewNonEmpty,
	DataViewFilterScope,
	useDataViewFilter,
	type DataViewItem,
	type ColumnLeafProps,
} from '@contember/bindx-dataview'
import { useFieldLabelFormatter } from '#bindx-ui/labels/index'
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
} from '#bindx-ui/datagrid/table'
import { DataGridColumnHeaderUI } from '#bindx-ui/datagrid/column-header'

function ColumnFilterRenderer({ filterName, renderFilter }: {
	filterName: string
	renderFilter: (props: { artifact: FilterArtifact; setArtifact: (artifact: FilterArtifact) => void }) => ReactNode
}): ReactElement {
	const [artifact, setArtifact] = useDataViewFilter(filterName)
	return (
		<DataViewFilterScope name={filterName}>
			{renderFilter({ artifact: artifact as FilterArtifact, setArtifact })}
		</DataViewFilterScope>
	)
}

function ResolvedColumnHeader({ col }: { col: ColumnLeafProps }): ReactNode {
	const { entityType } = useDataViewContext()
	const formatter = useFieldLabelFormatter()
	if (col.header != null) return col.header
	if (!col.fieldName) return ''
	return formatter(entityType, col.fieldName) ?? col.fieldName
}

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
								<DataViewElement key={col.name} name={col.name} label={col.header}>
									<DataGridHeaderCell data-testid={`datagrid-header-${col.name}`}>
										<DataGridColumnHeaderUI
											sortingField={col.sortingField && col.fieldRef ? col.fieldRef : undefined}
											hidingName={col.fieldName ?? undefined}
											filterName={col.filterName ?? undefined}
											filter={col.filterName && col.renderFilter
												? <ColumnFilterRenderer filterName={col.filterName} renderFilter={col.renderFilter} />
												: undefined}
										>
											<ResolvedColumnHeader col={col} />
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
														{col.renderCellWrapper
															? col.renderCellWrapper(col.renderCell(item), item)
															: col.renderCell(item)}
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
