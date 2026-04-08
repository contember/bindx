import type { ReactElement, ReactNode } from 'react'
import { DataGridToolbarContent } from '@contember/bindx-dataview'
import {
	HasManyDataGrid,
	TextColumn,
	DateColumn,
	DataGridTextFilter,
	FieldLabelFormatterProvider,
} from '@contember/bindx-ui'
import { Entity, Field } from '@contember/bindx-react'
import { schema } from '../generated/index.js'

const fieldLabels: Record<string, Record<string, string>> = {
	Article: {
		title: 'Title',
		content: 'Content',
		publishedAt: 'Published',
	},
}

function labelFormatter(entityName: string, fieldName: string): ReactNode | null {
	return fieldLabels[entityName]?.[fieldName] ?? null
}

/**
 * DataGrid for a has-many relation (Author → Articles).
 *
 * Demonstrates:
 * - Entity JSX wrapping a HasManyDataGrid
 * - Nested relation data grid
 */
export function HasManyDataGridPage({ id }: { id: string }): ReactElement {
	return (
		<Entity entity={schema.Author} by={{ id }}>
			{author => (
				<div data-testid="hasmany-datagrid-example">
					<p data-testid="hasmany-datagrid-author">
						Author: <Field field={author.name} />
					</p>
					<FieldLabelFormatterProvider formatter={labelFormatter}>
						<HasManyDataGrid
							field={author.articles}
							itemsPerPage={5}
							initialSorting={{ title: 'asc' }}
						>
							{it => (
								<>
									<TextColumn field={it.title} sortable filter />
									<TextColumn field={it.content} />
									<DateColumn field={it.publishedAt} sortable />

									<DataGridToolbarContent>
										<DataGridTextFilter field={it.title} />
									</DataGridToolbarContent>
								</>
							)}
						</HasManyDataGrid>
					</FieldLabelFormatterProvider>
				</div>
			)}
		</Entity>
	)
}
