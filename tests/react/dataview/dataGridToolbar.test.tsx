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
import { TestToolbar, TestPagination, getByTestId, queryByTestId } from './helpers'

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
	const articles: Record<string, Record<string, unknown>> = {}
	// Create 25 articles for pagination testing
	for (let i = 1; i <= 25; i++) {
		articles[`a${i}`] = {
			id: `a${i}`,
			title: `Article ${i}`,
			status: i % 3 === 0 ? 'archived' : i % 2 === 0 ? 'draft' : 'published',
			published: i % 2 === 1,
			views: i * 10,
		}
	}
	return { Article: articles }
}

// ============================================================================
// Tests: Toolbar
// ============================================================================

describe('DataGridToolbar', () => {
	test('renders filter controls for filterable columns', async () => {
		const adapter = new MockAdapter({ Article: {} }, { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid
					entity={schema.Article}
					columns={it => (
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
					)}
				>
					<TestToolbar />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// Toolbar should be rendered
		expect(queryByTestId(container, 'datagrid-toolbar')).not.toBeNull()

		// Should have filter controls for title (text) and status (enum)
		expect(queryByTestId(container, 'datagrid-filter-title')).not.toBeNull()
		expect(queryByTestId(container, 'datagrid-filter-status')).not.toBeNull()

		// views doesn't have filter=true, so no filter control
		expect(queryByTestId(container, 'datagrid-filter-views')).toBeNull()
	})

	test('text filter input works', async () => {
		const adapter = new MockAdapter({ Article: {} }, { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid
					entity={schema.Article}
					columns={it => (
						<DataGridTextColumn field={it.title} header="Title" filter />
					)}
				>
					<TestToolbar />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-toolbar')).not.toBeNull()
		})

		const input = getByTestId(container, 'datagrid-filter-title-input') as HTMLInputElement
		expect(input.value).toBe('')

		// Type into the filter
		await act(async () => {
			fireEvent.change(input, { target: { value: 'hello' } })
		})

		expect(input.value).toBe('hello')

		// Reset button should appear
		expect(queryByTestId(container, 'datagrid-filter-title-reset')).not.toBeNull()
	})

	test('text filter mode selector works', async () => {
		const adapter = new MockAdapter({ Article: {} }, { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid
					entity={schema.Article}
					columns={it => (
						<DataGridTextColumn field={it.title} header="Title" filter />
					)}
				>
					<TestToolbar />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-toolbar')).not.toBeNull()
		})

		const modeSelect = getByTestId(container, 'datagrid-filter-title-mode') as HTMLSelectElement
		expect(modeSelect.value).toBe('contains')

		await act(async () => {
			fireEvent.change(modeSelect, { target: { value: 'startsWith' } })
		})

		expect(modeSelect.value).toBe('startsWith')
	})

	test('enum filter options render', async () => {
		const adapter = new MockAdapter({ Article: {} }, { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid
					entity={schema.Article}
					columns={it => (
						<DataGridEnumColumn
							field={it.status}
							header="Status"
							options={['published', 'draft', 'archived']}
							filter
						/>
					)}
				>
					<TestToolbar />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-toolbar')).not.toBeNull()
		})

		// All three enum options should be rendered
		expect(queryByTestId(container, 'datagrid-filter-status-option-published')).not.toBeNull()
		expect(queryByTestId(container, 'datagrid-filter-status-option-draft')).not.toBeNull()
		expect(queryByTestId(container, 'datagrid-filter-status-option-archived')).not.toBeNull()
	})

	test('enum filter checkbox toggles selection', async () => {
		const adapter = new MockAdapter({ Article: {} }, { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid
					entity={schema.Article}
					columns={it => (
						<DataGridEnumColumn
							field={it.status}
							header="Status"
							options={['published', 'draft', 'archived']}
							filter
						/>
					)}
				>
					<TestToolbar />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-toolbar')).not.toBeNull()
		})

		const publishedCheckbox = getByTestId(container, 'datagrid-filter-status-option-published') as HTMLInputElement
		expect(publishedCheckbox.checked).toBe(false)

		await act(async () => {
			fireEvent.click(publishedCheckbox)
		})

		expect(publishedCheckbox.checked).toBe(true)

		// Reset button should appear
		expect(queryByTestId(container, 'datagrid-filter-status-reset')).not.toBeNull()
	})

	test('boolean filter buttons toggle value', async () => {
		const adapter = new MockAdapter({ Article: {} }, { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid
					entity={schema.Article}
					columns={it => (
						<DataGridBooleanColumn field={it.published} header="Published" filter />
					)}
				>
					<TestToolbar />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-toolbar')).not.toBeNull()
		})

		const trueBtn = getByTestId(container, 'datagrid-filter-published-true')
		const falseBtn = getByTestId(container, 'datagrid-filter-published-false')

		// Initially no selection
		expect(trueBtn.getAttribute('data-active')).toBe('false')
		expect(falseBtn.getAttribute('data-active')).toBe('false')

		// Click True
		await act(async () => {
			fireEvent.click(trueBtn)
		})

		expect(trueBtn.getAttribute('data-active')).toBe('true')
		expect(falseBtn.getAttribute('data-active')).toBe('false')

		// Click True again to deselect
		await act(async () => {
			fireEvent.click(trueBtn)
		})

		expect(trueBtn.getAttribute('data-active')).toBe('false')
	})

	test('clear all filters button resets all', async () => {
		const adapter = new MockAdapter({ Article: {} }, { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid
					entity={schema.Article}
					columns={it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" filter />
							<DataGridBooleanColumn field={it.published} header="Published" filter />
						</>
					)}
				>
					<TestToolbar />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-toolbar')).not.toBeNull()
		})

		// Initially no "clear all" button (no active filters)
		expect(queryByTestId(container, 'datagrid-toolbar-reset')).toBeNull()

		// Activate a filter
		const input = getByTestId(container, 'datagrid-filter-title-input') as HTMLInputElement
		await act(async () => {
			fireEvent.change(input, { target: { value: 'test' } })
		})

		// Now "clear all" should appear
		expect(queryByTestId(container, 'datagrid-toolbar-reset')).not.toBeNull()

		// Click clear all
		await act(async () => {
			fireEvent.click(getByTestId(container, 'datagrid-toolbar-reset'))
		})

		// Filter should be reset
		expect(input.value).toBe('')
		expect(queryByTestId(container, 'datagrid-toolbar-reset')).toBeNull()
	})
})

// ============================================================================
// Tests: Pagination
// ============================================================================

describe('DataGridPagination', () => {
	test('renders pagination controls', async () => {
		const adapter = new MockAdapter({ Article: {} }, { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid
					entity={schema.Article}
					itemsPerPage={10}
					columns={it => (
						<DataGridTextColumn field={it.title} header="Title" />
					)}
				>
					<TestPagination />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-pagination')).not.toBeNull()
		})

		// All navigation buttons should be rendered
		expect(queryByTestId(container, 'datagrid-pagination-first')).not.toBeNull()
		expect(queryByTestId(container, 'datagrid-pagination-prev')).not.toBeNull()
		expect(queryByTestId(container, 'datagrid-pagination-next')).not.toBeNull()
		expect(queryByTestId(container, 'datagrid-pagination-last')).not.toBeNull()

		// Page info
		expect(getByTestId(container, 'datagrid-pagination-info').textContent).toContain('Page 1')

		// Page size selector
		expect(queryByTestId(container, 'datagrid-pagination-pagesize')).not.toBeNull()
	})

	test('first/prev buttons are disabled on page 1', async () => {
		const adapter = new MockAdapter({ Article: {} }, { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid
					entity={schema.Article}
					columns={it => (
						<DataGridTextColumn field={it.title} header="Title" />
					)}
				>
					<TestPagination />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-pagination')).not.toBeNull()
		})

		const firstBtn = getByTestId(container, 'datagrid-pagination-first') as HTMLButtonElement
		const prevBtn = getByTestId(container, 'datagrid-pagination-prev') as HTMLButtonElement

		expect(firstBtn.disabled).toBe(true)
		expect(prevBtn.disabled).toBe(true)
	})

	test('page size selector changes items per page', async () => {
		const adapter = new MockAdapter({ Article: {} }, { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid
					entity={schema.Article}
					itemsPerPage={10}
					columns={it => (
						<DataGridTextColumn field={it.title} header="Title" />
					)}
				>
					<TestPagination />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-pagination')).not.toBeNull()
		})

		const pageSizeSelect = getByTestId(container, 'datagrid-pagination-pagesize') as HTMLSelectElement
		expect(pageSizeSelect.value).toBe('10')

		await act(async () => {
			fireEvent.change(pageSizeSelect, { target: { value: '50' } })
		})

		expect(pageSizeSelect.value).toBe('50')
	})
})
