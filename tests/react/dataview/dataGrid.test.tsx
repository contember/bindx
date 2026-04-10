import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	scalar,
	hasOne,
	hasMany,
} from '@contember/bindx-react'
import { schema } from '../../shared/index.js'
import { DataGrid, DataGridTextColumn, DataGridHasOneColumn, DataGridHasManyColumn } from '@contember/bindx-dataview'
import { TestTable, getByTestId, queryByTestId } from './helpers.js'

afterEach(() => {
	cleanup()
})

// ============================================================================
// Schema
// ============================================================================

interface Author {
	id: string
	name: string
	email: string
}

interface Tag {
	id: string
	name: string
	color: string
}

interface Article {
	id: string
	title: string
	content: string
	status: string
	publishedAt: string | null
	author: Author | null
	tags: Tag[]
}

interface TestSchema {
	Article: Article
	Author: Author
	Tag: Tag
}

const localSchema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				content: scalar(),
				status: scalar(),
				publishedAt: scalar(),
				author: hasOne('Author', { nullable: true }),
				tags: hasMany('Tag'),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				email: scalar(),
			},
		},
		Tag: {
			fields: {
				id: scalar(),
				name: scalar(),
				color: scalar(),
			},
		},
	},
})

const ArticleDataGrid = DataGrid

function createArticleMockData() {
	return {
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'Hello World',
				content: 'Content 1',
				status: 'published',
				publishedAt: '2024-01-15',
				author: { id: 'author-1', name: 'John', email: 'john@test.com' },
				tags: [
					{ id: 'tag-1', name: 'JS', color: '#f7df1e' },
					{ id: 'tag-2', name: 'React', color: '#61dafb' },
				],
			},
			'article-2': {
				id: 'article-2',
				title: 'Second Post',
				content: 'Content 2',
				status: 'draft',
				publishedAt: null,
				author: { id: 'author-2', name: 'Jane', email: 'jane@test.com' },
				tags: [],
			},
			'article-3': {
				id: 'article-3',
				title: 'Third Post',
				content: 'Content 3',
				status: 'published',
				publishedAt: '2024-03-10',
				author: null,
				tags: [{ id: 'tag-1', name: 'JS', color: '#f7df1e' }],
			},
		},
		Author: {
			'author-1': { id: 'author-1', name: 'John', email: 'john@test.com' },
			'author-2': { id: 'author-2', name: 'Jane', email: 'jane@test.com' },
		},
		Tag: {
			'tag-1': { id: 'tag-1', name: 'JS', color: '#f7df1e' },
			'tag-2': { id: 'tag-2', name: 'React', color: '#61dafb' },
		},
	}
}

// ============================================================================
// Tests
// ============================================================================

describe('DataGrid', () => {
	describe('basic rendering', () => {
		test('renders entity list with text columns', async () => {
			const adapter = new MockAdapter(createArticleMockData(), { delay: 0 })

			const { container } = render(
				<BindxProvider adapter={adapter} schema={localSchema}>
					<ArticleDataGrid entity={schema.Article}>
						{it => (
							<>
								<DataGridTextColumn field={it.title} header="Title" />
								<DataGridTextColumn field={it.content} header="Content" />
								<TestTable />
							</>
						)}
					</ArticleDataGrid>
				</BindxProvider>,
			)

			// Should show loading initially
			expect(queryByTestId(container, 'datagrid-loading')).not.toBeNull()

			// Wait for data to load
			await waitFor(() => {
				expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
			})

			// Should render 3 rows
			const rows = container.querySelectorAll('tbody tr[data-testid^="datagrid-row-"]')
			expect(rows.length).toBe(3)

			// Check cell content
			expect(getByTestId(container, 'datagrid-row-0-col-title').textContent).toBe('Hello World')
			expect(getByTestId(container, 'datagrid-row-1-col-title').textContent).toBe('Second Post')
			expect(getByTestId(container, 'datagrid-row-2-col-title').textContent).toBe('Third Post')
		})

		test('renders hasOne column', async () => {
			const adapter = new MockAdapter(createArticleMockData(), { delay: 0 })

			const { container } = render(
				<BindxProvider adapter={adapter} schema={localSchema}>
					<ArticleDataGrid entity={schema.Article}>
						{it => (
							<>
								<DataGridTextColumn field={it.title} header="Title" />
								<DataGridHasOneColumn field={it.author} header="Author">
									{(author: any) => author.name}
								</DataGridHasOneColumn>
								<TestTable />
							</>
						)}
					</ArticleDataGrid>
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
			})

			// Check author column renders
			expect(getByTestId(container, 'datagrid-row-0-col-author').textContent).toBe('John')
			expect(getByTestId(container, 'datagrid-row-1-col-author').textContent).toBe('Jane')
			// article-3 has no author
			expect(getByTestId(container, 'datagrid-row-2-col-author').textContent).toBe('')
		})

		test('renders hasMany column', async () => {
			const adapter = new MockAdapter(createArticleMockData(), { delay: 0 })

			const { container } = render(
				<BindxProvider adapter={adapter} schema={localSchema}>
					<ArticleDataGrid entity={schema.Article}>
						{it => (
							<>
								<DataGridTextColumn field={it.title} header="Title" />
								<DataGridHasManyColumn field={it.tags} header="Tags">
									{(tag: any) => tag.name}
								</DataGridHasManyColumn>
								<TestTable />
							</>
						)}
					</ArticleDataGrid>
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
			})

			// article-1 has 2 tags
			expect(getByTestId(container, 'datagrid-row-0-col-tags').textContent).toContain('JS')
			expect(getByTestId(container, 'datagrid-row-0-col-tags').textContent).toContain('React')
			// article-2 has no tags
			expect(getByTestId(container, 'datagrid-row-1-col-tags').textContent).toBe('')
		})

		test('renders empty state', async () => {
			const adapter = new MockAdapter({ Article: {}, Author: {}, Tag: {} }, { delay: 0 })

			const { container } = render(
				<BindxProvider adapter={adapter} schema={localSchema}>
					<ArticleDataGrid entity={schema.Article}>
						{it => (
							<>
								<DataGridTextColumn field={it.title} header="Title" />
								<TestTable />
								<div data-testid="empty">No articles</div>
							</>
						)}
					</ArticleDataGrid>
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
			})

			expect(queryByTestId(container, 'empty')).not.toBeNull()
		})
	})
})
