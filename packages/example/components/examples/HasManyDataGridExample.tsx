import { DataGridToolbarContent } from '@contember/bindx-dataview'
import {
	DefaultHasManyDataGrid,
	DataGridTextColumn,
	DataGridDateColumn,
	DataGridTextFilter,
	FieldLabelFormatterProvider,
} from '@contember/bindx-ui'
import { Entity, Field } from '@contember/bindx-react'
import { schema } from '../../generated/index.js'
import type { ReactElement, ReactNode } from 'react'

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

export function HasManyDataGridExample({ id }: { id: string }): ReactElement {
	return (
		<Entity entity={schema.Author} by={{ id }}>
			{author => (
				<div data-testid="hasmany-datagrid-example">
					<p data-testid="hasmany-datagrid-author">
						Author: <Field field={author.name} />
					</p>
					<FieldLabelFormatterProvider formatter={labelFormatter}>
						<DefaultHasManyDataGrid
							field={author.articles}
							itemsPerPage={5}
							initialSorting={{ title: 'asc' }}
						>
							{it => (
								<>
									<DataGridTextColumn field={it.title} sortable filter />
									<DataGridTextColumn field={it.content} />
									<DataGridDateColumn field={it.publishedAt} sortable />

									<DataGridToolbarContent>
										<DataGridTextFilter field={it.title} />
									</DataGridToolbarContent>
								</>
							)}
						</DefaultHasManyDataGrid>
					</FieldLabelFormatterProvider>
				</div>
			)}
		</Entity>
	)
}
