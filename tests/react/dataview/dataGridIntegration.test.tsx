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
import { schema } from '../../shared/index.js'
import {
	DataGrid,
	DataGridTextColumn,
	DataGridEnumColumn,
	DataGridBooleanColumn,
	DataGridNumberColumn,
} from '@contember/bindx-dataview'
import { TestTable, TestToolbar, TestPagination, getByTestId, queryByTestId, getRowCount } from './helpers.js'

afterEach(() => {
	cleanup()
})

// ============================================================================
// Schema & Data
// ============================================================================

interface Article {
	id: string
	title: string
	status: string
	published: boolean
	views: number
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
				published: scalar(),
				views: scalar(),
			},
		},
	},
})

function createMockData(): Record<string, Record<string, Record<string, unknown>>> {
	return {
		Article: {
			'a1': { id: 'a1', title: 'Alpha Article', status: 'published', published: true, views: 100 },
			'a2': { id: 'a2', title: 'Beta Post', status: 'draft', published: false, views: 50 },
			'a3': { id: 'a3', title: 'Charlie Blog', status: 'published', published: true, views: 200 },
			'a4': { id: 'a4', title: 'Delta News', status: 'archived', published: false, views: 10 },
			'a5': { id: 'a5', title: 'Echo Report', status: 'draft', published: false, views: 75 },
		},
	}
}

// ============================================================================
// Integration Tests: Toolbar + Pagination within DataGrid
// ============================================================================

describe('DataGrid with toolbar and pagination', () => {
	test('toolbar renders filter controls', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article} columns={it => (
					<>
						<DataGridTextColumn field={it.title} header="Title" filter />
						<DataGridEnumColumn
							field={it.status}
							header="Status"
							options={['published', 'draft', 'archived']}
							filter
						/>
						<DataGridNumberColumn field={it.views} header="Views" />
					</>
				)}>
					<TestToolbar />
					<TestTable />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// Data should be rendered
		expect(getRowCount(container)).toBe(5)

		// Toolbar should be rendered
		expect(queryByTestId(container, 'datagrid-toolbar')).not.toBeNull()
		expect(queryByTestId(container, 'datagrid-toolbar-filters')).not.toBeNull()

		// Filter controls for title and status
		expect(queryByTestId(container, 'datagrid-filter-title')).not.toBeNull()
		expect(queryByTestId(container, 'datagrid-filter-status')).not.toBeNull()

		// No filter for views (filter=false by default)
		expect(queryByTestId(container, 'datagrid-filter-views')).toBeNull()
	})

	test('pagination renders pagination controls', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article} itemsPerPage={10} columns={it => (
					<DataGridTextColumn field={it.title} header="Title" />
				)}>
					<TestTable />
					<TestPagination />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// Pagination should be rendered
		expect(queryByTestId(container, 'datagrid-pagination')).not.toBeNull()
		expect(getByTestId(container, 'datagrid-pagination-info').textContent).toContain('Page 1')
	})

	test('toolbar and pagination together', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article} itemsPerPage={10} columns={it => (
					<>
						<DataGridTextColumn field={it.title} header="Title" filter sortable />
						<DataGridEnumColumn
							field={it.status}
							header="Status"
							options={['published', 'draft', 'archived']}
							filter
						/>
					</>
				)}>
					<TestToolbar />
					<TestTable />
					<TestPagination />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// All parts should be present
		expect(queryByTestId(container, 'datagrid-toolbar')).not.toBeNull()
		expect(queryByTestId(container, 'datagrid-table')).not.toBeNull()
		expect(queryByTestId(container, 'datagrid-pagination')).not.toBeNull()

		// Data should be rendered
		expect(getRowCount(container)).toBe(5)

		// Sort indicator on title
		const titleHeader = getByTestId(container, 'datagrid-header-title')
		expect(titleHeader.querySelector('[data-testid="sort-indicator"]')).not.toBeNull()
	})

	test('no toolbar/pagination when not included as children', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article} columns={it => (
					<DataGridTextColumn field={it.title} header="Title" filter />
				)}>
					<TestTable />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// No toolbar or pagination
		expect(queryByTestId(container, 'datagrid-toolbar')).toBeNull()
		expect(queryByTestId(container, 'datagrid-pagination')).toBeNull()
	})

	test('sorting via column header click works with data', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article} columns={it => (
					<DataGridTextColumn field={it.title} header="Title" sortable />
				)}>
					<TestTable />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		const titleHeader = getByTestId(container, 'datagrid-header-title')
		const getDirection = (): string => {
			return titleHeader.querySelector('[data-testid="sort-indicator"]')!.getAttribute('data-direction')!
		}

		expect(getDirection()).toBe('none')

		// Click to sort asc
		await act(async () => {
			fireEvent.click(titleHeader)
		})

		// Wait for re-render after sort change triggers data refetch
		await waitFor(() => {
			expect(getDirection()).toBe('asc')
		})
	})

	test('text filter typing updates filter state', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article} columns={it => (
					<DataGridTextColumn field={it.title} header="Title" filter />
				)}>
					<TestToolbar />
					<TestTable />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		expect(getRowCount(container)).toBe(5)

		// Type into the title filter
		const input = getByTestId(container, 'datagrid-filter-title-input') as HTMLInputElement
		await act(async () => {
			fireEvent.change(input, { target: { value: 'Alpha' } })
		})

		// The filter state changes, which triggers a re-fetch.
		// MockAdapter applies filters, so we should see filtered results.
		// Wait for data to reload
		await waitFor(() => {
			// The "clear all" button should appear since filter is active
			expect(queryByTestId(container, 'datagrid-toolbar-reset')).not.toBeNull()
		})
	})

	test('enum filter checkbox updates filter state', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article} columns={it => (
					<DataGridEnumColumn
						field={it.status}
						header="Status"
						options={['published', 'draft', 'archived']}
						filter
					/>
				)}>
					<TestToolbar />
					<TestTable />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// Click "published" checkbox
		const checkbox = getByTestId(container, 'datagrid-filter-status-option-published') as HTMLInputElement
		await act(async () => {
			fireEvent.click(checkbox)
		})

		expect(checkbox.checked).toBe(true)

		// Clear all should appear
		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-toolbar-reset')).not.toBeNull()
		})
	})

	test('clear all filters resets everything', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article} columns={it => (
					<>
						<DataGridTextColumn field={it.title} header="Title" filter />
						<DataGridBooleanColumn field={it.published} header="Published" filter />
					</>
				)}>
					<TestToolbar />
					<TestTable />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// Activate text filter
		const input = getByTestId(container, 'datagrid-filter-title-input') as HTMLInputElement
		await act(async () => {
			fireEvent.change(input, { target: { value: 'test' } })
		})

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-toolbar-reset')).not.toBeNull()
		})

		// Click "clear all"
		await act(async () => {
			fireEvent.click(getByTestId(container, 'datagrid-toolbar-reset'))
		})

		// Input should be cleared
		expect(input.value).toBe('')

		// "Clear all" should disappear
		expect(queryByTestId(container, 'datagrid-toolbar-reset')).toBeNull()
	})
})
