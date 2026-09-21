// Regression test for <issue-url>
//
// Since the relation cell's filter affordance became a Radix popover (#116),
// keyboard focus on the cell label is moved into the panel. The panel then
// keeps Tab to itself and drops focus on Escape, so a keyboard user can neither
// reach what the cell renders (a link, say) nor carry on through the grid.
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter } from '@contember/bindx-react'
import { DataGrid } from '@contember/bindx-dataview'
import { DataGridAutoTable, DataGridHasOneColumn } from '@contember/bindx-ui'
import { schema, testSchema } from '../../shared/index.js'
import { getByTestId, queryByTestId } from './helpers.js'

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
							{author => <a href="/authors/author-1">{author.name.value}</a>}
						</DataGridHasOneColumn>
						<DataGridAutoTable />
					</>
				)}
			</DataGrid>
		</BindxProvider>,
	)
	return container
}

/** Focuses the cell label the way Tab would, and waits for the panel to take focus. */
async function openPanelFromKeyboard(container: HTMLElement): Promise<{ cell: HTMLElement; label: HTMLElement }> {
	await waitFor(() => {
		expect(queryByTestId(container, 'datagrid-cell-author')).not.toBeNull()
	})
	const cell = getByTestId(container, 'datagrid-cell-author')
	const label = cell.querySelector<HTMLElement>('[tabindex="0"]')!
	act(() => label.focus())
	await waitFor(() => expect(document.activeElement?.textContent).toBe('Filter'))
	return { cell, label }
}

describe('relation column filter affordance — keyboard', () => {
	test('should let Tab leave the panel when focus is on its last action', async () => {
		const container = renderGrid()
		await openPanelFromKeyboard(container)

		const exclude = Array.from(document.querySelectorAll('[data-bindx-tooltip-panel] button')).find(it => it.textContent?.trim() === 'Exclude') as HTMLElement
		act(() => exclude.focus())

		// `fireEvent` returns false when a handler called preventDefault. A panel
		// that swallows Tab on its last action and wraps to the first one leaves
		// the keyboard user cycling Filter ↔ Exclude with no way on to the link
		// inside the cell or to the next cell.
		let notPrevented = true
		act(() => {
			notPrevented = fireEvent.keyDown(exclude, { key: 'Tab', code: 'Tab' })
		})

		expect(notPrevented).toBe(true)
		expect(document.activeElement?.textContent).not.toBe('Filter')
	})

	test('should return focus to the cell when Escape closes a keyboard-opened panel', async () => {
		const container = renderGrid()
		const { cell } = await openPanelFromKeyboard(container)

		act(() => {
			fireEvent.keyDown(document.activeElement!, { key: 'Escape', code: 'Escape' })
		})
		await waitFor(() => expect(document.querySelector('[data-bindx-tooltip-panel]')).toBeNull())

		// Focus dropped on <body> restarts keyboard navigation from the top of the page.
		expect(document.activeElement === document.body).toBe(false)
		expect(cell.contains(document.activeElement)).toBe(true)
	})
})
