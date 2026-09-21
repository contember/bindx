// Regression test for https://github.com/contember/bindx/issues/116
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter } from '@contember/bindx-react'
import { DataGrid } from '@contember/bindx-dataview'
import { DataGridAutoTable, DataGridHasOneColumn } from '@contember/bindx-ui'
import { schema, testSchema } from '../../shared/index.js'
import { getByTestId, queryByTestId } from './helpers.js'

afterEach(() => {
	cleanup()
})

/**
 * The panel of the relation cell's filter affordance carries exactly the two
 * action buttons of `DataGridRelationFieldTooltipInner` — „Filter" and
 * „Exclude" (`dict.datagrid`).
 */
function filterAffordanceButtons(root: ParentNode): Element[] {
	return Array.from(root.querySelectorAll('button')).filter(button => ['Filter', 'Exclude'].includes((button.textContent ?? '').trim()))
}

describe('relation column filter affordance', () => {
	test('should render the tooltip panel outside the cell when a has-one cell carries the filter affordance', async () => {
		const adapter = new MockAdapter({
			Article: {
				'article-1': {
					id: 'article-1',
					title: 'First',
					content: '',
					author: { id: 'author-1', name: 'Alice', email: 'alice@example.com' },
					tags: [],
				},
			},
			Author: {
				'author-1': { id: 'author-1', name: 'Alice', email: 'alice@example.com' },
			},
			Tag: {},
			Location: {},
		}, { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<DataGridHasOneColumn field={it.author} header="Author">
								{author => author.name.value}
							</DataGridHasOneColumn>
							<DataGridAutoTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-cell-author')).not.toBeNull()
		})

		const cell = getByTestId(container, 'datagrid-cell-author')
		expect(cell.textContent).toContain('Alice')

		// The affordance is mounted — the tooltip panel is always in the DOM, hover only reveals it.
		expect(filterAffordanceButtons(document.body).length).toBeGreaterThan(0)

		// …and it must not live inside the cell: a cell is free to clip its own
		// content (a line clamp needs `overflow: hidden`), and a clipping
		// ancestor swallows an absolutely positioned descendant that is
		// positioned against a box inside it. The panel belongs in a portal.
		expect(filterAffordanceButtons(cell)).toHaveLength(0)
	})
})
