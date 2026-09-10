// Regression test for https://github.com/contember/bindx/issues/67
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
	Entity,
	MockAdapter,
	defineSchema,
	hasMany,
	scalar,
} from '@contember/bindx-react'
import { entityDef, type GetQuery, type ListQuery, type Query } from '@contember/bindx'
import {
	DataGrid,
	DataGridTextColumn,
	DataViewExportTrigger,
	HasManyDataGrid,
	type ExportFactory,
	type ExportFactoryArgs,
	type ExportResult,
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

interface Author {
	id: string
	name: string
	articles: Article[]
}

interface TestSchema {
	Article: Article
	Author: Author
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
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				articles: hasMany('Article'),
			},
		},
	},
})

const articleDef = entityDef<Article>('Article')
const authorDef = entityDef<Author>('Author')

const ownArticles = [
	{ id: 'a1', title: 'Published article', status: 'published' },
	{ id: 'a2', title: 'Draft article', status: 'draft' },
]

const mockData = {
	Article: {
		'a1': ownArticles[0]!,
		'a2': ownArticles[1]!,
		'b1': { id: 'b1', title: 'Foreign article', status: 'published' },
	},
	Author: {
		'author-1': { id: 'author-1', name: 'Own author', articles: ownArticles },
		'author-2': { id: 'author-2', name: 'Other author', articles: [{ id: 'b1', title: 'Foreign article', status: 'published' }] },
	},
}

class QuerySpyAdapter extends MockAdapter {
	readonly queries: Query[] = []

	override async query(queries: readonly Query[]): Promise<Awaited<ReturnType<MockAdapter['query']>>> {
		this.queries.push(...queries)
		return super.query(queries)
	}

	get listQueries(): ListQuery[] {
		return this.queries.filter((q): q is ListQuery => q.type === 'list')
	}

	get getQueries(): GetQuery[] {
		return this.queries.filter((q): q is GetQuery => q.type === 'get')
	}
}

class CapturingExportFactory implements ExportFactory {
	readonly exports: ExportFactoryArgs[] = []

	create(args: ExportFactoryArgs): ExportResult {
		this.exports.push(args)
		return { blob: new Blob([]), extension: 'csv' }
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

describe('DataViewExportTrigger in a HasManyDataGrid', () => {
	test('should export through the parent record instead of the whole target table', async () => {
		const adapter = new QuerySpyAdapter(mockData, { delay: 0 })
		const exportFactory = new CapturingExportFactory()

		const originalCreateObjectURL = URL.createObjectURL
		const originalRevokeObjectURL = URL.revokeObjectURL
		URL.createObjectURL = () => 'blob:test'
		URL.revokeObjectURL = () => {}

		try {
			const { container, getByTestId } = render(
				<BindxProvider adapter={adapter} schema={localSchema}>
					<Entity entity={authorDef} by={{ id: 'author-1' }}>
						{author => (
							<HasManyDataGrid field={author.articles} filter={{ status: { eq: 'published' } }}>
								{it => (
									<>
										<DataGridTextColumn field={it.title} header="Title" />
										<DataViewExportTrigger exportFactory={exportFactory}>
											<button type="button" data-testid="export-trigger">Export</button>
										</DataViewExportTrigger>
										<TestTable />
									</>
								)}
							</HasManyDataGrid>
						)}
					</Entity>
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
			})

			await act(async () => {
				fireEvent.click(getByTestId('export-trigger'))
			})
			await waitFor(() => {
				expect(exportFactory.exports.length).toBe(1)
			})

			// A root list query would reach every article in the table, including
			// the ones belonging to another author.
			expect(adapter.listQueries).toHaveLength(0)

			const exportQuery = adapter.getQueries[adapter.getQueries.length - 1]!
			expect(exportQuery.entityType).toBe('Author')
			expect(exportQuery.by).toEqual({ id: 'author-1' })

			const relationField = exportQuery.spec.fields.find(f => f.sourcePath[0] === 'articles')!
			expect(relationField.limit).toBeUndefined()
			expect(relationField.offset).toBeUndefined()
			expect(JSON.stringify(relationField.filter ?? {})).toContain('published')

			const exportedTitles = exportFactory.exports[0]!.data.map(row => row['title'])
			expect(exportedTitles).toEqual(['Published article'])
		} finally {
			URL.createObjectURL = originalCreateObjectURL
			URL.revokeObjectURL = originalRevokeObjectURL
		}
	})
})
