// Regression test for https://github.com/contember/bindx/issues/136
//
// A nullable has-one with no related entity still yields a handle whose `id`
// is a disconnected placeholder id. The cell must not offer include/exclude
// actions on it: a filter on that id cannot match anything, and a server
// rejects it as an invalid id.
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter } from '@contember/bindx-react'
import { DataGrid } from '@contember/bindx-dataview'
import { DataGridAutoTable, DataGridHasOneColumn } from '@contember/bindx-ui'
import { schema, testSchema } from '../../shared/index.js'

afterEach(async () => {
	await act(async () => {
		cleanup()
		await new Promise(resolve => setTimeout(resolve, 0))
	})
})

function renderGrid(): HTMLElement {
	const adapter = new MockAdapter({
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'With author',
				content: '',
				author: { id: 'author-1', name: 'Alice', email: 'alice@example.com' },
				tags: [],
			},
			'article-2': {
				id: 'article-2',
				title: 'Without author',
				content: '',
				author: null,
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
							{author => author.name.value ?? '—'}
						</DataGridHasOneColumn>
						<DataGridAutoTable />
					</>
				)}
			</DataGrid>
		</BindxProvider>,
	)
	return container
}

function authorCells(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>('[data-testid="datagrid-cell-author"]'))
}

describe('has-one column cell filter affordance', () => {
	test('should not offer include/exclude on a cell whose relation is empty', async () => {
		const container = renderGrid()

		await waitFor(() => {
			expect(authorCells(container)).toHaveLength(2)
		})

		const connectedCell = authorCells(container).find(cell => cell.textContent?.includes('Alice'))
		const emptyCell = authorCells(container).find(cell => cell.textContent?.includes('—'))
		expect(connectedCell).toBeDefined()
		expect(emptyCell).toBeDefined()

		expect(connectedCell!.querySelector('[data-bindx-tooltip]')).not.toBeNull()
		expect(emptyCell!.querySelector('[data-bindx-tooltip]')).toBeNull()
	})
})
