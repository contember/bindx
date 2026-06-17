// Covers the count-query mechanism behind DataGrid pagination (issue #44):
//  - the total reflects the active filter (not the whole table),
//  - jumping to the last page is enabled and lands on the right rows,
//  - the count is keyed on the filter only, so paging does NOT re-issue it.
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act, fireEvent } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, defineSchema, scalar } from '@contember/bindx-react'
import type { BackendAdapter, Query, QueryResult, QueryOptions } from '@contember/bindx'
import { schema } from '../../shared/index.js'
import { DataGrid, DataGridTextColumn } from '@contember/bindx-dataview'
import { TestTable, TestPagination, getByTestId, queryByTestId, getRowCount, getCellText } from './helpers.js'

afterEach(() => {
	cleanup()
})

interface Article {
	id: string
	title: string
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
				published: scalar(),
			},
		},
	},
})

// 6 articles, 4 of them published.
function createData(): Record<string, Record<string, Record<string, unknown>>> {
	const Article: Record<string, Record<string, unknown>> = {}
	for (let i = 1; i <= 6; i++) {
		Article[`a${i}`] = { id: `a${i}`, title: `Article ${i}`, published: i % 2 === 0 ? false : true }
	}
	// published === true for a1, a3, a5 (3 rows); false for a2, a4, a6 (3 rows)
	return { Article }
}

/** Wraps MockAdapter and records how many count queries were issued. */
class CountSpyAdapter implements BackendAdapter {
	public countQueries = 0
	constructor(private readonly inner: MockAdapter) {}

	async query(queries: readonly Query[], options?: QueryOptions): Promise<QueryResult[]> {
		this.countQueries += queries.filter(q => q.type === 'count').length
		return this.inner.query(queries, options)
	}
	persist(...args: Parameters<BackendAdapter['persist']>): ReturnType<BackendAdapter['persist']> {
		return this.inner.persist(...args)
	}
}

function renderGrid(adapter: BackendAdapter, itemsPerPage: number, staticFilter?: Record<string, unknown>) {
	return render(
		<BindxProvider adapter={adapter} schema={localSchema}>
			<DataGrid entity={schema.Article} itemsPerPage={itemsPerPage} filter={staticFilter}>
				{it => (
					<>
						<DataGridTextColumn field={it.title} header="Title" />
						<TestTable />
						<TestPagination />
					</>
				)}
			</DataGrid>
		</BindxProvider>,
	)
}

describe('DataGrid count query', () => {
	test('total reflects the active filter, not the whole table', async () => {
		const adapter = new MockAdapter(createData(), { delay: 0 })
		// Only published === true → 3 of 6 rows. With itemsPerPage=2 that is 2 pages.
		const { container } = renderGrid(adapter, 2, { published: { eq: true } })

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-table')).not.toBeNull()
		})

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-pagination-total')?.textContent).toBe('3 total')
		})
		expect(getByTestId(container, 'datagrid-pagination-info').textContent).toBe('Page 1 of 2')
	})

	test('jump to last page is enabled and lands on the final partial page', async () => {
		const adapter = new MockAdapter(createData(), { delay: 0 })
		const { container } = renderGrid(adapter, 4) // 6 rows → 2 pages (4 + 2)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-pagination-total')?.textContent).toBe('6 total')
		})

		const last = getByTestId(container, 'datagrid-pagination-last') as HTMLButtonElement
		expect(last.disabled).toBe(false)

		await act(async () => {
			fireEvent.click(last)
		})

		await waitFor(() => {
			expect(getByTestId(container, 'datagrid-pagination-info').textContent).toBe('Page 2 of 2')
		})
		// Second page holds the remaining 2 rows.
		expect(getRowCount(container)).toBe(2)
		expect(getCellText(container, 0, 'title')).toBe('Article 5')
	})

	test('count is keyed on the filter — paging does not re-issue it', async () => {
		const spy = new CountSpyAdapter(new MockAdapter(createData(), { delay: 0 }))
		const { container } = renderGrid(spy, 2) // 6 rows → 3 pages

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-pagination-total')?.textContent).toBe('6 total')
		})

		const countAfterInitialLoad = spy.countQueries
		expect(countAfterInitialLoad).toBeGreaterThan(0)

		// Navigate forward two pages — the filter is unchanged, so no new count query.
		await act(async () => {
			fireEvent.click(getByTestId(container, 'datagrid-pagination-next'))
		})
		await waitFor(() => {
			expect(getByTestId(container, 'datagrid-pagination-info').textContent).toBe('Page 2 of 3')
		})
		await act(async () => {
			fireEvent.click(getByTestId(container, 'datagrid-pagination-next'))
		})
		await waitFor(() => {
			expect(getByTestId(container, 'datagrid-pagination-info').textContent).toBe('Page 3 of 3')
		})

		// Total still correct, and the count query did not fire again for paging.
		expect(getByTestId(container, 'datagrid-pagination-total').textContent).toBe('6 total')
		expect(spy.countQueries).toBe(countAfterInitialLoad)
	})
})
