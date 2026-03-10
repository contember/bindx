/**
 * End-to-end DataGrid tests that verify filtering, sorting, and pagination
 * actually affect the data loaded from the MockAdapter.
 */
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
} from '@contember/bindx-dataview'
import { TestTable, TestToolbar, TestPagination, getByTestId, queryByTestId, getRowCount, getCellText } from './helpers.js'

afterEach(() => {
	cleanup()
})

// ============================================================================
// Schema
// ============================================================================

interface Article {
	id: string
	title: string
	status: string
	published: boolean
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
			},
		},
	},
})

function createData(): Record<string, Record<string, Record<string, unknown>>> {
	return {
		Article: {
			'a1': { id: 'a1', title: 'Alpha', status: 'published', published: true },
			'a2': { id: 'a2', title: 'Beta', status: 'draft', published: false },
			'a3': { id: 'a3', title: 'Charlie', status: 'published', published: true },
			'a4': { id: 'a4', title: 'Delta', status: 'archived', published: false },
			'a5': { id: 'a5', title: 'Echo', status: 'draft', published: true },
		},
	}
}

// ============================================================================
// E2E: Static filter
// ============================================================================

describe('DataGrid E2E: static filter', () => {
	test('filter prop restricts data from adapter', async () => {
		const adapter = new MockAdapter(createData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article} filter={{ status: { eq: 'published' } }} columns={it => (
					<>
						<DataGridTextColumn field={it.title} header="Title" />
						<DataGridTextColumn field={it.status} header="Status" />
					</>
				)}>
					<TestTable />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// Only published articles: Alpha, Charlie
		expect(getRowCount(container)).toBe(2)
		expect(getCellText(container, 0, 'status')).toBe('published')
		expect(getCellText(container, 1, 'status')).toBe('published')
	})

	test('filter with in operator', async () => {
		const adapter = new MockAdapter(createData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article} filter={{ status: { in: ['draft', 'archived'] } }} columns={it => (
					<DataGridTextColumn field={it.title} header="Title" />
				)}>
					<TestTable />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// draft + archived = Beta, Delta, Echo
		expect(getRowCount(container)).toBe(3)
	})
})

// ============================================================================
// E2E: Sorting
// ============================================================================

describe('DataGrid E2E: sorting', () => {
	test('initialSorting orders data from adapter', async () => {
		const adapter = new MockAdapter(createData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article} initialSorting={{ title: 'asc' }} columns={it => (
					<DataGridTextColumn field={it.title} header="Title" sortable />
				)}>
					<TestTable />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// Should be alphabetically sorted
		expect(getCellText(container, 0, 'title')).toBe('Alpha')
		expect(getCellText(container, 1, 'title')).toBe('Beta')
		expect(getCellText(container, 2, 'title')).toBe('Charlie')
		expect(getCellText(container, 3, 'title')).toBe('Delta')
		expect(getCellText(container, 4, 'title')).toBe('Echo')
	})

	test('initialSorting desc', async () => {
		const adapter = new MockAdapter(createData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article} initialSorting={{ title: 'desc' }} columns={it => (
					<DataGridTextColumn field={it.title} header="Title" sortable />
				)}>
					<TestTable />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		expect(getCellText(container, 0, 'title')).toBe('Echo')
		expect(getCellText(container, 4, 'title')).toBe('Alpha')
	})

	test('clicking column header re-sorts data', async () => {
		const adapter = new MockAdapter(createData(), { delay: 0 })

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

		const firstTitleBefore = getCellText(container, 0, 'title')

		// Click to sort ascending
		const header = getByTestId(container, 'datagrid-header-title')
		await act(async () => {
			fireEvent.click(header)
		})

		// Wait for data to reload with sorting
		await waitFor(() => {
			expect(getCellText(container, 0, 'title')).toBe('Alpha')
		})

		// Click again for descending
		await act(async () => {
			fireEvent.click(header)
		})

		await waitFor(() => {
			expect(getCellText(container, 0, 'title')).toBe('Echo')
		})
	})
})

// ============================================================================
// E2E: Dynamic filtering via toolbar
// ============================================================================

describe('DataGrid E2E: dynamic filtering', () => {
	test('text filter reduces results from adapter', async () => {
		const adapter = new MockAdapter(createData(), { delay: 0 })

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

		// Type "al" into title filter (contains mode)
		const input = getByTestId(container, 'datagrid-filter-title-input') as HTMLInputElement
		await act(async () => {
			fireEvent.change(input, { target: { value: 'al' } })
		})

		// Wait for refetch with filter applied
		await waitFor(() => {
			// "Alpha" contains "al" (case-insensitive) → should match
			// Other titles don't contain "al"
			const count = getRowCount(container)
			expect(count).toBeLessThan(5)
		})

		// Verify the filtered result contains "Alpha"
		await waitFor(() => {
			expect(getCellText(container, 0, 'title')).toBe('Alpha')
		})
	})

	test('enum filter restricts results', async () => {
		const adapter = new MockAdapter(createData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article} columns={it => (
					<>
						<DataGridTextColumn field={it.title} header="Title" />
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
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		expect(getRowCount(container)).toBe(5)

		// Select "published" in enum filter
		const checkbox = getByTestId(container, 'datagrid-filter-status-option-published') as HTMLInputElement
		await act(async () => {
			fireEvent.click(checkbox)
		})

		// Wait for refetch with filter
		await waitFor(() => {
			expect(getRowCount(container)).toBe(2) // Alpha and Charlie
		})

		// Verify both are published
		expect(getCellText(container, 0, 'status')).toBe('published')
		expect(getCellText(container, 1, 'status')).toBe('published')
	})

	test('boolean filter restricts results', async () => {
		const adapter = new MockAdapter(createData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article} columns={it => (
					<>
						<DataGridTextColumn field={it.title} header="Title" />
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

		expect(getRowCount(container)).toBe(5)

		// Click "True" for published filter
		const trueBtn = getByTestId(container, 'datagrid-filter-published-true')
		await act(async () => {
			fireEvent.click(trueBtn)
		})

		// Wait for refetch
		await waitFor(() => {
			expect(getRowCount(container)).toBe(3) // Alpha, Charlie, Echo
		})
	})

	test('clearing filter restores all results', async () => {
		const adapter = new MockAdapter(createData(), { delay: 0 })

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

		// Apply a filter
		const input = getByTestId(container, 'datagrid-filter-title-input') as HTMLInputElement
		await act(async () => {
			fireEvent.change(input, { target: { value: 'Alpha' } })
		})

		await waitFor(() => {
			expect(getRowCount(container)).toBe(1)
		})

		// Clear all filters
		await act(async () => {
			fireEvent.click(getByTestId(container, 'datagrid-toolbar-reset'))
		})

		// All results should be back
		await waitFor(() => {
			expect(getRowCount(container)).toBe(5)
		})
	})

	test('combined static + dynamic filter', async () => {
		const adapter = new MockAdapter(createData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid
					entity={schema.Article}
					filter={{ published: { eq: true } }}
					columns={it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" />
							<DataGridEnumColumn
								field={it.status}
								header="Status"
								options={['published', 'draft', 'archived']}
								filter
							/>
						</>
					)}
				>
					<TestToolbar />
					<TestTable />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// Static filter: published=true → Alpha, Charlie, Echo (3)
		expect(getRowCount(container)).toBe(3)

		// Dynamic filter: status=draft
		const draftCheckbox = getByTestId(container, 'datagrid-filter-status-option-draft') as HTMLInputElement
		await act(async () => {
			fireEvent.click(draftCheckbox)
		})

		// Both filters combined: published=true AND status=draft → Echo
		await waitFor(() => {
			expect(getRowCount(container)).toBe(1)
		})

		expect(getCellText(container, 0, 'title')).toBe('Echo')
	})
})

// ============================================================================
// E2E: Pagination
// ============================================================================

describe('DataGrid E2E: pagination', () => {
	test('itemsPerPage limits loaded results', async () => {
		const adapter = new MockAdapter(createData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article} itemsPerPage={2} columns={it => (
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

		// Should show only 2 items
		expect(getRowCount(container)).toBe(2)

		// Pagination should show Page 1
		expect(getByTestId(container, 'datagrid-pagination-info').textContent).toContain('Page 1')
	})

	test('next page loads next batch', async () => {
		const adapter = new MockAdapter(createData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article} itemsPerPage={2} initialSorting={{ title: 'asc' }} columns={it => (
					<DataGridTextColumn field={it.title} header="Title" sortable />
				)}>
					<TestTable />
					<TestPagination />
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// Page 1: Alpha, Beta
		expect(getRowCount(container)).toBe(2)
		expect(getCellText(container, 0, 'title')).toBe('Alpha')
		expect(getCellText(container, 1, 'title')).toBe('Beta')

		// Click next
		await act(async () => {
			fireEvent.click(getByTestId(container, 'datagrid-pagination-next'))
		})

		// Wait for page 2 to load
		await waitFor(() => {
			expect(getByTestId(container, 'datagrid-pagination-info').textContent).toContain('Page 2')
		})

		// Page 2: Charlie, Delta
		await waitFor(() => {
			expect(getCellText(container, 0, 'title')).toBe('Charlie')
		})
		expect(getCellText(container, 1, 'title')).toBe('Delta')
	})
})
