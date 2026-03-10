import {
	DataGrid,
	DataGridTextColumn,
	DataGridDateColumn,
	DataGridHasOneColumn,
	DataGridHasManyColumn,
	useDataViewContext,
	renderCellValue,
	DataViewEachRow,
	DataViewLayout,
	DataViewEmpty,
	DataViewNonEmpty,
	DataViewHighlightRow,
	DataViewKeyboardEventHandler,
	DataViewElement,
} from '@contember/bindx-dataview'
import {
	useBindxContext,
	createRuntimeAccessor,
} from '@contember/bindx-react'
import {
	DefaultDataGrid,
	DataGridTable,
	DataGridTableWrapper,
	DataGridThead,
	DataGridTbody,
	DataGridHeaderRow,
	DataGridRow,
	DataGridHeaderCell,
	DataGridCell,
	DataGridColumnHeaderUI,
	DataGridNoResults,
	DataGridTiles,
	DataGridTextFilter,
	DataGridDateFilterUI,
	DataGridHasOneCell,
	DataGridHasManyCell,
	DataViewFieldLabel,
	DataViewHasOneLabel,
	DataViewHasManyLabel,
	FieldLabelFormatterProvider,
} from '@contember/bindx-ui'
import type { ReactElement, ReactNode } from 'react'

const fieldLabels: Record<string, Record<string, string>> = {
	Article: {
		title: 'Title',
		content: 'Content',
		publishedAt: 'Published',
		author: 'Author',
		tags: 'Tags',
	},
	Author: {
		Author: 'Author',
		name: 'Name',
	},
	Tag: {
		Tag: 'Tag',
		name: 'Name',
	},
}

function labelFormatter(entityName: string, fieldName: string): ReactNode | null {
	return fieldLabels[entityName]?.[fieldName] ?? null
}

/**
 * Example: Styled DataGrid with filtering, sorting, and pagination.
 *
 * Uses bindx-ui styled components: DefaultDataGrid, DataGridTable,
 * DataGridColumnHeaderUI, DataGridHasOneCell, DataGridHasManyCell,
 * DataViewFieldLabel/HasOneLabel/HasManyLabel, DataGridTiles, DataGridNoResults.
 */
export function DataGridExample(): ReactElement {
	return (
		<div data-testid="datagrid-example">
			<FieldLabelFormatterProvider formatter={labelFormatter}>
				<DataGrid
					entity="Article"
					itemsPerPage={5}
					initialSorting={{ title: 'asc' }}
					layouts={[
						{ name: 'table', label: 'Table' },
						{ name: 'grid', label: 'Grid' },
					]}
					columns={it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" sortable filter />
							<DataGridTextColumn field={it.content} header="Content" />
							<DataGridDateColumn field={it.publishedAt} header="Published" sortable filter />
							<DataGridHasOneColumn field={it.author} header="Author">
								{(author: any) => author?.name?.value ?? '\u2014'}
							</DataGridHasOneColumn>
							<DataGridHasManyColumn field={it.tags} header="Tags">
								{(tag: any) => tag?.name?.value ?? ''}
							</DataGridHasManyColumn>
						</>
					)}
					toolbar={it => (
						<>
							<DataGridTextFilter field={it.title} label={<DataViewFieldLabel field="title" />} />
							<DataGridDateFilterUI field={it.publishedAt} label={<DataViewFieldLabel field="publishedAt" />} />
						</>
					)}
				>
					<DefaultDataGrid>
						<DataViewEmpty>
							<DataGridNoResults />
						</DataViewEmpty>

						<DataViewNonEmpty>
							<DataViewLayout name="table">
								<DataGridTableView />
							</DataViewLayout>

							<DataGridTiles>
								{(item: { id: string; data: Record<string, unknown> }) => (
									<DataGridTileCard key={item.id} id={item.id} />
								)}
							</DataGridTiles>
						</DataViewNonEmpty>
					</DefaultDataGrid>
				</DataGrid>
			</FieldLabelFormatterProvider>
		</div>
	)
}

function DataGridTableView(): ReactElement {
	const { columns, entityType, selectionMeta } = useDataViewContext()
	const { store } = useBindxContext()

	return (
		<DataViewKeyboardEventHandler>
			<DataGridTableWrapper data-testid="datagrid-table">
				<DataGridTable>
					<DataGridThead>
						<DataGridHeaderRow data-testid="datagrid-header">
							{columns.map((col, i) => {
								const name = col.fieldName ?? `col-${i}`
								return (
									<DataViewElement key={name} name={name}>
										<DataGridHeaderCell data-testid={`datagrid-header-${name}`}>
											<DataGridColumnHeaderUI
												sortingField={col.sortable && col.fieldRef ? col.fieldRef : undefined}
												hidingName={col.fieldName ?? undefined}
											>
												{col.type === 'hasOne'
													? <DataViewHasOneLabel field={col.fieldName!} />
													: col.type === 'hasMany'
														? <DataViewHasManyLabel field={col.fieldName!} />
														: col.fieldName
															? <DataViewFieldLabel field={col.fieldName} />
															: col.header}
											</DataGridColumnHeaderUI>
										</DataGridHeaderCell>
									</DataViewElement>
								)
							})}
						</DataGridHeaderRow>
					</DataGridThead>
					<DataGridTbody data-testid="datagrid-body">
						<DataViewEachRow>
							{(item, rowIndex) => (
								<DataViewHighlightRow key={item.id} index={rowIndex}>
									<DataGridRow data-testid={`datagrid-row-${rowIndex}`}>
										{columns.map((col, colIndex) => {
											const name = col.fieldName ?? `col-${colIndex}`
											const accessor = createRuntimeAccessor(entityType, item.id, store, () => {}, [], selectionMeta)
											return (
												<DataViewElement key={name} name={name}>
													<DataGridCell data-testid={`datagrid-cell-${name}`}>
														<CellContent col={col} accessor={accessor} />
													</DataGridCell>
												</DataViewElement>
											)
										})}
									</DataGridRow>
								</DataViewHighlightRow>
							)}
						</DataViewEachRow>
					</DataGridTbody>
				</DataGridTable>
			</DataGridTableWrapper>
		</DataViewKeyboardEventHandler>
	)
}

function CellContent({ col, accessor }: { col: any; accessor: any }): ReactElement {
	if (col.type === 'hasOne' && col.fieldName) {
		const ref = accessor[col.fieldName]
		const rendered = col.relationRenderer ? col.relationRenderer(ref) : null
		const id = ref?.$state === 'connected' ? ref?.id : null
		return (
			<DataGridHasOneCell field={col.fieldName} id={id}>
				{rendered}
			</DataGridHasOneCell>
		)
	}

	if (col.type === 'hasMany' && col.fieldName) {
		const ref = accessor[col.fieldName]
		const items = ref?.items ?? []
		return (
			<div className="flex flex-wrap gap-1">
				{items.map((item: any) => {
					const rendered = col.relationRenderer ? col.relationRenderer(item) : null
					const id = item?.id ?? (typeof item === 'object' && item !== null && 'id' in item ? item.id : '')
					return (
						<DataGridHasManyCell key={id} field={col.fieldName} id={id}>
							{rendered}
						</DataGridHasManyCell>
					)
				})}
			</div>
		)
	}

	return <>{renderCellValue(col, accessor)}</>
}

function DataGridTileCard({ id }: { id: string }): ReactElement {
	const { entityType, selectionMeta, columns } = useDataViewContext()
	const { store } = useBindxContext()
	const accessor = createRuntimeAccessor(entityType, id, store, () => {}, [], selectionMeta)

	const titleCol = columns.find(c => c.fieldName === 'title')
	const authorCol = columns.find(c => c.fieldName === 'author')

	const title = titleCol ? renderCellValue(titleCol, accessor) : id
	const authorRef = authorCol?.fieldName ? (accessor as any)[authorCol.fieldName] : null
	const authorName = authorCol?.relationRenderer && authorRef ? authorCol.relationRenderer(authorRef) : null

	return (
		<div className="rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow" data-testid={`datagrid-tile-${id}`}>
			<div className="font-medium text-sm" data-testid="tile-title">{title}</div>
			{authorName && <div className="text-xs text-gray-500 mt-1" data-testid="tile-author">{authorName}</div>}
		</div>
	)
}
