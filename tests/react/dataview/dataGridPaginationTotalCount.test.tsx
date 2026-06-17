// Regression test for <issue-url — filled in after the issue is created>
//
// Top-level <DataGrid> never issues a COUNT query. DataGrid.tsx only sets the
// total count lazily, when the *current* page returns fewer rows than the page
// size (`itemCount < queryLimit`) — i.e. only on a partial last page. On any
// list that spans more than one full page, the first page is full, the
// condition is never met, and `paging.info.totalCount` / `totalPages` stay
// `null`. Downstream that means: no row count shown, no "page X of Y", and the
// "jump to last page" control is permanently disabled (it short-circuits on
// `totalPages === null`).
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, defineSchema, scalar } from '@contember/bindx-react'
import { schema } from '../../shared/index.js'
import { DataGrid, DataGridTextColumn } from '@contember/bindx-dataview'
import { TestTable, TestPagination, getByTestId, queryByTestId, getRowCount } from './helpers.js'

afterEach(() => {
	cleanup()
})

interface Article {
	id: string
	title: string
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
			},
		},
	},
})

// 5 articles → at itemsPerPage=2 the list spans 3 pages (2 + 2 + 1).
function createData(): Record<string, Record<string, Record<string, unknown>>> {
	const Article: Record<string, Record<string, unknown>> = {}
	for (let i = 1; i <= 5; i++) {
		Article[`a${i}`] = { id: `a${i}`, title: `Article ${i}` }
	}
	return { Article }
}

function renderGrid(itemsPerPage: number) {
	const adapter = new MockAdapter(createData(), { delay: 0 })
	return render(
		<BindxProvider adapter={adapter} schema={localSchema}>
			<DataGrid entity={schema.Article} itemsPerPage={itemsPerPage}>
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

describe('DataGrid pagination — total count on multi-page lists', () => {
	test('should expose totalCount for a list spanning multiple pages', async () => {
		const { container } = renderGrid(2)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-table')).not.toBeNull()
		})

		// First page is full (2 === itemsPerPage), but there are 5 rows in total.
		expect(getRowCount(container)).toBe(2)

		// EXPECTED: the grid knows the total is 5.
		// ACTUAL (bug): totalCount stays null, so the total element is never rendered.
		expect(queryByTestId(container, 'datagrid-pagination-total')?.textContent).toBe('5 total')
	})

	test('should report totalPages so "jump to last page" is usable', async () => {
		const { container } = renderGrid(2)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-table')).not.toBeNull()
		})

		// EXPECTED: "Page 1 of 3".
		// ACTUAL (bug): "Page 1" — totalPages is null.
		expect(getByTestId(container, 'datagrid-pagination-info').textContent).toBe('Page 1 of 3')

		// EXPECTED: the last-page button is actionable.
		// ACTUAL (bug): totalPages === null disables it (and paging.last() is a no-op).
		expect((getByTestId(container, 'datagrid-pagination-last') as HTMLButtonElement).disabled).toBe(false)
	})

	// Control — documents the one case that DOES work today: a single partial
	// page (row count below the page size) satisfies the lazy heuristic, so the
	// total is reported. This is why small tables look fine while larger ones
	// silently lose their count.
	test('control — single partial page exposes totalCount', async () => {
		const { container } = renderGrid(50)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-table')).not.toBeNull()
		})

		expect(getRowCount(container)).toBe(5)
		expect(queryByTestId(container, 'datagrid-pagination-total')?.textContent).toBe('5 total')
	})
})
