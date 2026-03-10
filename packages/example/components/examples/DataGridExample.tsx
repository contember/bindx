import {
	DataGrid,
	DataGridTextColumn,
	DataGridDateColumn,
	DataGridHasOneColumn,
	DataGridHasManyColumn,
	DataViewLayout,
	DataViewEmpty,
	DataViewNonEmpty,
	type DataViewItem,
} from '@contember/bindx-dataview'
import {
	DefaultDataGrid,
	DataGridAutoTable,
	DataGridNoResults,
	DataGridTiles,
	DataGridTextFilter,
	DataGridDateFilterUI,
	DataViewFieldLabel,
	FieldLabelFormatterProvider,
} from '@contember/bindx-ui'
import { schema } from '../../generated/index.js'
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
 * - Table layout uses DataGridAutoTable (auto-renders from column metadata)
 * - Tiles layout uses direct field access on items (no column context)
 */
export function DataGridExample(): ReactElement {
	return (
		<div data-testid="datagrid-example">
			<FieldLabelFormatterProvider formatter={labelFormatter}>
				<DataGrid
					entity={schema.Article}
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
								<DataGridAutoTable />
							</DataViewLayout>

							<DataGridTiles>
								{(item: DataViewItem) => (
									<DataGridTileCard key={item.id} item={item} />
								)}
							</DataGridTiles>
						</DataViewNonEmpty>
					</DefaultDataGrid>
				</DataGrid>
			</FieldLabelFormatterProvider>
		</div>
	)
}

function DataGridTileCard({ item }: { item: DataViewItem }): ReactElement {
	const accessor = item as unknown as Record<string, any>
	const title = accessor['title']?.value ?? item.id
	const author = accessor['author']?.name?.value ?? null

	return (
		<div className="rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow" data-testid={`datagrid-tile-${item.id}`}>
			<div className="font-medium text-sm" data-testid="tile-title">{title}</div>
			{author && <div className="text-xs text-gray-500 mt-1" data-testid="tile-author">{author}</div>}
		</div>
	)
}
