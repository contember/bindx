import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act, fireEvent } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	scalar,
	hasOne,
	hasMany,
} from '@contember/bindx-react'
import { entityDef } from '@contember/bindx'
import {
	DataGrid,
	DataGridTextColumn,
	DataGridEnumColumn,
	DataGridBooleanColumn,
	DataGridNumberColumn,
	DataGridDateColumn,
	useDataViewContext,
} from '@contember/bindx-dataview'
import type { TextFilterArtifact, EnumFilterArtifact, BooleanFilterArtifact } from '@contember/bindx'
import { TestTable, getByTestId, queryByTestId, getRowCount } from './helpers.js'

afterEach(() => {
	cleanup()
})

// ============================================================================
// Schema
// ============================================================================

interface Author {
	id: string
	name: string
}

interface Article {
	id: string
	title: string
	status: string
	published: boolean
	views: number
	publishedAt: string | null
	author: Author | null
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
				published: scalar(),
				views: scalar(),
				publishedAt: scalar(),
				author: hasOne('Author', { nullable: true }),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
			},
		},
	},
})

const localEntityDefs = {
	Article: entityDef<Article>('Article'),
	Author: entityDef<Author>('Author'),
} as const

function createMockData(): Record<string, Record<string, Record<string, unknown>>> {
	return {
		Article: {
			'a1': { id: 'a1', title: 'Alpha Article', status: 'published', published: true, views: 100, publishedAt: '2024-01-15', author: { id: 'auth-1', name: 'John' } },
			'a2': { id: 'a2', title: 'Beta Post', status: 'draft', published: false, views: 50, publishedAt: null, author: { id: 'auth-2', name: 'Jane' } },
			'a3': { id: 'a3', title: 'Charlie Blog', status: 'published', published: true, views: 200, publishedAt: '2024-03-10', author: null },
			'a4': { id: 'a4', title: 'Delta News', status: 'archived', published: false, views: 10, publishedAt: '2024-02-20', author: { id: 'auth-1', name: 'John' } },
		},
		Author: {
			'auth-1': { id: 'auth-1', name: 'John' },
			'auth-2': { id: 'auth-2', name: 'Jane' },
		},
	}
}

// ============================================================================
// Tests: Sorting
// ============================================================================

describe('DataGrid sorting', () => {
	test('renders sort indicators on sortable columns', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={localEntityDefs.Article}>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" sortable />
							<DataGridTextColumn field={it.status} header="Status" sortable={false} />
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// Title column should have a sort indicator
		const titleHeader = getByTestId(container, 'datagrid-header-title')
		const indicator = titleHeader.querySelector('[data-testid="sort-indicator"]')
		expect(indicator).not.toBeNull()
		expect(indicator!.getAttribute('data-direction')).toBe('none')

		// Status column should NOT have a sort indicator (sortable=false)
		const statusHeader = getByTestId(container, 'datagrid-header-status')
		const statusIndicator = statusHeader.querySelector('[data-testid="sort-indicator"]')
		expect(statusIndicator).toBeNull()
	})

	test('clicking sortable header toggles sort direction', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={localEntityDefs.Article}>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" sortable />
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		const titleHeader = getByTestId(container, 'datagrid-header-title')
		const getDirection = (): string => {
			const ind = titleHeader.querySelector('[data-testid="sort-indicator"]')!
			return ind.getAttribute('data-direction')!
		}

		expect(getDirection()).toBe('none')

		// Click: none → asc
		await act(async () => {
			fireEvent.click(titleHeader)
		})
		expect(getDirection()).toBe('asc')

		// Click: asc → desc
		await act(async () => {
			fireEvent.click(titleHeader)
		})
		expect(getDirection()).toBe('desc')

		// Click: desc → none
		await act(async () => {
			fireEvent.click(titleHeader)
		})
		expect(getDirection()).toBe('none')
	})

	test('passes sort orderBy to the adapter query', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid
					entity={localEntityDefs.Article}
					initialSorting={{ title: 'asc' }}
				>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" sortable />
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// The initial sorting should set the sort indicator to asc
		const titleHeader = getByTestId(container, 'datagrid-header-title')
		const indicator = titleHeader.querySelector('[data-testid="sort-indicator"]')!
		expect(indicator.getAttribute('data-direction')).toBe('asc')
	})
})

// ============================================================================
// Tests: Column Types
// ============================================================================

describe('DataGrid column types', () => {
	test('renders number column', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={localEntityDefs.Article}>
					{it => (
						<>
							<DataGridNumberColumn field={it.views} header="Views" />
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		expect(getRowCount(container)).toBe(4)
		expect(getByTestId(container, 'datagrid-row-0-col-views').textContent).toBe('100')
	})

	test('renders boolean column', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={localEntityDefs.Article}>
					{it => (
						<>
							<DataGridBooleanColumn field={it.published} header="Published" />
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		expect(getByTestId(container, 'datagrid-row-0-col-published').textContent).toBe('true')
		expect(getByTestId(container, 'datagrid-row-1-col-published').textContent).toBe('false')
	})

	test('renders date column', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={localEntityDefs.Article}>
					{it => (
						<>
							<DataGridDateColumn field={it.publishedAt} header="Published At" />
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		expect(getByTestId(container, 'datagrid-row-0-col-publishedAt').textContent).toBe('2024-01-15')
		// a2 has null publishedAt
		expect(getByTestId(container, 'datagrid-row-1-col-publishedAt').textContent).toBe('')
	})

	test('renders enum column with options', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={localEntityDefs.Article}>
					{it => (
						<>
							<DataGridEnumColumn
								field={it.status}
								header="Status"
								options={{ draft: 'Draft', published: 'Published', archived: 'Archived' }}
							/>
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		expect(getByTestId(container, 'datagrid-row-0-col-status').textContent).toBe('published')
		expect(getByTestId(container, 'datagrid-row-1-col-status').textContent).toBe('draft')
	})

	test('custom cell renderer works on number column', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={localEntityDefs.Article}>
					{it => (
						<>
							<DataGridNumberColumn field={it.views} header="Views">
								{(views: number | null) => <strong>{views} views</strong>}
							</DataGridNumberColumn>
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		const cell = getByTestId(container, 'datagrid-row-0-col-views')
		expect(cell.querySelector('strong')).not.toBeNull()
		expect(cell.textContent).toBe('100 views')
	})
})

// ============================================================================
// Tests: DataView Context
// ============================================================================

describe('DataGrid context', () => {
	test('provides DataView context to children via useDataViewContext', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		let contextAvailable = false

		function ContextProbe(): React.ReactElement | null {
			const ctx = useDataViewContext()
			contextAvailable = ctx !== null
			return null
		}

		render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={localEntityDefs.Article}>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" />
							<ContextProbe />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(contextAvailable).toBe(true)
		})
	})
})

// ============================================================================
// Tests: Filter integration with text column
// ============================================================================

describe('DataGrid text filter', () => {
	test('text column with filter=true registers a filter handler', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		let filteringState: { hasActiveFilters: boolean } | null = null

		function FilterProbe(): React.ReactElement | null {
			const { filtering } = useDataViewContext()
			filteringState = { hasActiveFilters: filtering.hasActiveFilters }
			return <span data-testid="filter-count">{filtering.filters.size}</span>
		}

		render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={localEntityDefs.Article}>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" filter />
							<DataGridTextColumn field={it.status} header="Status" />
							<FilterProbe />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(filteringState).not.toBeNull()
		})

		// title has filter=true (1 column filter) + auto-registered query filter across text columns
		const filterCount = queryByTestId(document.body, 'filter-count')
		expect(filterCount?.textContent).toBe('2')
		expect(filteringState!.hasActiveFilters).toBe(false)
	})
})

// ============================================================================
// Tests: Static filter prop
// ============================================================================

describe('DataGrid static filter', () => {
	test('static filter prop restricts results', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid
					entity={localEntityDefs.Article}
					filter={{ status: { eq: 'published' } }}
				>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" />
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// Only published articles (a1 and a3)
		expect(getRowCount(container)).toBe(2)
	})
})
