import type { ReactElement, ReactNode } from 'react'
import { DataGridToolbarContent, DataGridLayout } from '@contember/bindx-dataview'
import {
	DefaultDataGrid,
	DataGridTextColumn,
	DataGridDateColumn,
	DataGridHasOneColumn,
	DataGridHasManyColumn,
	DataGridTextFilter,
	DataGridDateFilterUI,
	FieldLabelFormatterProvider,
} from '@contember/bindx-ui'
import { Field, HasOne } from '@contember/bindx-react'
import { schema } from '../generated/index.js'

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
 * DataGrid with filtering, sorting, pagination, and multiple layouts.
 *
 * Demonstrates:
 * - DataGrid with marker-based columns
 * - Table layout (auto-rendered from column metadata)
 * - Grid and rows custom layouts via DataGridLayout marker
 * - Toolbar content with filters
 */
export function DataGridPage(): ReactElement {
	return (
		<div data-testid="datagrid-example">
			<FieldLabelFormatterProvider formatter={labelFormatter}>
				<DefaultDataGrid
					entity={schema.Article}
					itemsPerPage={5}
					initialSorting={{ title: 'asc' }}
				>
					{it => (
						<>
							<DataGridTextColumn field={it.title} sortable filter />
							<DataGridTextColumn field={it.content} />
							<DataGridDateColumn field={it.publishedAt} sortable filter />
							<DataGridHasOneColumn field={it.author}>
								{author => author.name.value ?? '\u2014'}
							</DataGridHasOneColumn>
							<DataGridHasManyColumn field={it.tags}>
								{tag => tag.name.value ?? ''}
							</DataGridHasManyColumn>

							<DataGridLayout name="grid" label="Grid" item={it}>
								{item => (
									<div
										className="rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
										data-testid={`datagrid-tile-${item.id}`}
									>
										<div className="font-medium text-sm" data-testid="tile-title">
											<Field field={item.title} />
										</div>
										<div className="text-xs text-gray-500 mt-1" data-testid="tile-author">
											<HasOne field={item.author}>
												{author => <Field field={author.name} />}
											</HasOne>
										</div>
									</div>
								)}
							</DataGridLayout>

							<DataGridLayout name="rows" label="Rows" item={it}>
								{item => (
									<div
										className="flex items-center gap-4 border-b border-gray-100 py-2"
										data-testid={`datagrid-row-item-${item.id}`}
									>
										<span className="font-medium"><Field field={item.title} /></span>
										<span className="text-sm text-gray-500">
											<HasOne field={item.author}>
												{author => <Field field={author.name} />}
											</HasOne>
										</span>
									</div>
								)}
							</DataGridLayout>

							<DataGridToolbarContent>
								<DataGridTextFilter field={it.title} />
								<DataGridDateFilterUI field={it.publishedAt} />
							</DataGridToolbarContent>
						</>
					)}
				</DefaultDataGrid>
			</FieldLabelFormatterProvider>
		</div>
	)
}
