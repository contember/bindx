/**
 * Regression test for https://github.com/contember/bindx/issues/114
 *
 * `useDataViewElements()` used to derive the visibility list with
 * `columns.filter(c => c.fieldName !== null)`, standing in for a property that
 * did not exist: whether a leaf is a column at all. That dropped every computed
 * column (composed from several fields, so bound to none) and kept every leaf
 * registered only to pull a field into full-text search.
 *
 * `virtual` now says it outright. A virtual leaf registers its field and is not
 * a column — neither the table nor the visibility list shows it — while every
 * real column is offered whether or not it binds a field of its own.
 */
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup } from '@testing-library/react'
import React, { type ReactElement } from 'react'
import { BindxProvider, MockAdapter } from '@contember/bindx-react'
import {
	DataGrid,
	DataGridNumberColumn,
	DataGridTextColumn,
	QUERY_FILTER_NAME,
	useDataViewContext,
	useDataViewElements,
} from '@contember/bindx-dataview'
import { DataGridAutoTable } from '@contember/bindx-ui'
import { createMockData, schema, testSchema } from '../../shared/index.js'

afterEach(() => {
	cleanup()
})

function ElementNamesProbe(): ReactElement {
	const elements = useDataViewElements()
	return <div data-testid="element-names">{elements.map(it => it.name).join(',')}</div>
}

function FilterNamesProbe(): ReactElement {
	const { filtering } = useDataViewContext()
	return <div data-testid="filter-names">{[...filtering.filters.keys()].join(',')}</div>
}

describe('virtual DataGrid columns', () => {
	test('should register the field for full-text search without becoming a column', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<DataGridNumberColumn field={it.views} header="Views" />
							{/* Only here so the toolbar search covers the title. */}
							<DataGridTextColumn field={it.title} virtual />
							<DataGridAutoTable />
							<ElementNamesProbe />
							<FilterNamesProbe />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(container.querySelector('[data-testid="datagrid-cell-views"]')).not.toBeNull()
		})

		// The point of the leaf: it is the only text-searchable field, so the
		// query filter exists only because it registered.
		expect(container.querySelector('[data-testid="filter-names"]')!.textContent).toContain(QUERY_FILTER_NAME)

		// …without it becoming a row in the visibility list…
		expect(container.querySelector('[data-testid="element-names"]')!.textContent).toBe('views')

		// …or an empty column in the table.
		expect(container.querySelector('[data-testid="datagrid-header-title"]')).toBeNull()
		expect(container.querySelector('[data-testid="datagrid-cell-title"]')).toBeNull()
		expect(container.querySelectorAll('[data-testid="datagrid-header"] th')).toHaveLength(1)
	})
})
