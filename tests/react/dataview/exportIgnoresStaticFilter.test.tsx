// Regression test for <issue-url — filled in after filing>
//
// `DataViewExportTrigger` builds its unpaged export query from
// `filtering.resolvedWhere` only. The grid's static `filter` prop — which
// scopes every row the operator actually sees — never reaches the export
// query, so the exported file contains rows from OUTSIDE the grid's scope
// (a data leak on grids like "sessions of this program" or "non-archived
// contacts"). The same gap makes HasManyDataGrid exports query the whole
// target table unscoped to the parent record.
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act, fireEvent } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	scalar,
} from '@contember/bindx-react'
import { entityDef, type ListQuery } from '@contember/bindx'
import {
	DataGrid,
	DataGridTextColumn,
	DataViewExportTrigger,
} from '@contember/bindx-dataview'
import { queryByTestId, TestTable } from './helpers.js'

afterEach(() => {
	cleanup()
})

interface Article {
	id: string
	title: string
	status: string
}

interface TestSchema {
	Article: Article
}

const localSchema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				status: scalar(),
			},
		},
	},
})

const articleDef = entityDef<Article>('Article')

const mockData = {
	Article: {
		'a1': { id: 'a1', title: 'Published article', status: 'published' },
		'a2': { id: 'a2', title: 'Draft article', status: 'draft' },
	},
}

class QuerySpyAdapter extends MockAdapter {
	readonly listQueries: ListQuery[] = []

	override async query(queries: readonly ListQuery[]): Promise<Awaited<ReturnType<MockAdapter['query']>>> {
		this.listQueries.push(...queries.filter(q => q.type === 'list'))
		return super.query(queries)
	}
}

describe('DataViewExportTrigger with a static grid filter', () => {
	test('should constrain the export query by the static filter', async () => {
		const adapter = new QuerySpyAdapter(mockData, { delay: 0 })
		const staticFilter = { status: { eq: 'published' } }

		const originalCreateObjectURL = URL.createObjectURL
		const originalRevokeObjectURL = URL.revokeObjectURL
		URL.createObjectURL = () => 'blob:test'
		URL.revokeObjectURL = () => {}

		try {
			const { container, getByTestId } = render(
				<BindxProvider adapter={adapter} schema={localSchema}>
					<DataGrid entity={articleDef} filter={staticFilter}>
						{it => (
							<>
								<DataGridTextColumn field={it.title} header="Title" />
								<DataViewExportTrigger>
									<button type="button" data-testid="export-trigger">Export</button>
								</DataViewExportTrigger>
								<TestTable />
							</>
						)}
					</DataGrid>
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
			})

			// Sanity: the grid's own data load IS scoped by the static filter.
			const dataQuery = adapter.listQueries.find(q => q.limit !== undefined)
			expect(JSON.stringify(dataQuery?.filter ?? {})).toContain('published')

			const before = adapter.listQueries.length
			await act(async () => {
				fireEvent.click(getByTestId('export-trigger'))
			})
			await waitFor(() => {
				expect(adapter.listQueries.length).toBeGreaterThan(before)
			})

			const exportQuery = adapter.listQueries[adapter.listQueries.length - 1]!
			// The export must not reach rows the grid never shows — its query has
			// to carry the same static scope as the data load above.
			expect(JSON.stringify(exportQuery.filter ?? {})).toContain('published')
		} finally {
			URL.createObjectURL = originalCreateObjectURL
			URL.revokeObjectURL = originalRevokeObjectURL
		}
	})
})
