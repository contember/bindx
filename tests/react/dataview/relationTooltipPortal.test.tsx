// Regression test for https://github.com/contember/bindx/issues/116
//
// The relation cell's filter affordance used to render its panel as an
// `absolute` box inside the trigger wrapper, so any clipping ancestor of the
// trigger swallowed the panel whole — the affordance was visible and its
// buttons were not reachable. The panel is now portaled.
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter } from '@contember/bindx-react'
import { DataGrid } from '@contember/bindx-dataview'
import { DataGridAutoTable, DataGridHasOneColumn } from '@contember/bindx-ui'
import { schema, testSchema } from '../../shared/index.js'
import { getByTestId, queryByTestId } from './helpers.js'

afterEach(() => {
	cleanup()
})

/** Comfortably past the panel's close delay, so a missed `cancel` would show. */
const PAST_CLOSE_DELAY_MS = 300

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * The panel of the relation cell's filter affordance carries exactly the two
 * action buttons of `DataGridRelationFieldTooltipInner` — „Filter" and
 * „Exclude" (`dict.datagrid`).
 */
function filterAffordanceButtons(root: ParentNode): Element[] {
	return Array.from(root.querySelectorAll('button')).filter(button => ['Filter', 'Exclude'].includes((button.textContent ?? '').trim()))
}

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
							{author => author.name.value}
						</DataGridHasOneColumn>
						<DataGridAutoTable />
					</>
				)}
			</DataGrid>
		</BindxProvider>,
	)
	return container
}

describe('relation column filter affordance', () => {
	test('should render the tooltip panel outside the cell', async () => {
		const container = renderGrid()

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-cell-author')).not.toBeNull()
		})

		const cell = getByTestId(container, 'datagrid-cell-author')
		expect(cell.textContent).toContain('Alice')

		// At rest the panel is closed, so nothing of it is mounted anywhere.
		expect(filterAffordanceButtons(document.body)).toHaveLength(0)

		const trigger = cell.querySelector('[data-bindx-tooltip]')!
		expect(trigger).not.toBeNull()
		fireEvent.pointerEnter(trigger)

		// Hovering reveals the panel…
		await waitFor(() => {
			expect(filterAffordanceButtons(document.body).length).toBeGreaterThan(0)
		})

		// …outside the cell, which is free to clip its own content: a clipping
		// ancestor swallows an absolutely positioned descendant whatever its
		// z-index, so the panel belongs in a portal.
		expect(filterAffordanceButtons(cell)).toHaveLength(0)
		expect(document.querySelector('[data-bindx-tooltip-panel]')).not.toBeNull()
		expect(cell.querySelector('[data-bindx-tooltip-panel]')).toBeNull()
	})

	test('should keep the panel open while the pointer is on it', async () => {
		const container = renderGrid()

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-cell-author')).not.toBeNull()
		})

		const cell = getByTestId(container, 'datagrid-cell-author')
		const trigger = cell.querySelector('[data-bindx-tooltip]')!

		fireEvent.pointerEnter(trigger)
		await waitFor(() => {
			expect(document.querySelector('[data-bindx-tooltip-panel]')).not.toBeNull()
		})

		// The pointer leaves the trigger to cross the gap to the panel — the panel
		// must survive the trip, or its buttons can never be clicked.
		const panel = document.querySelector('[data-bindx-tooltip-panel]')!
		fireEvent.pointerLeave(trigger)
		fireEvent.pointerEnter(panel)
		await act(async () => {
			await sleep(PAST_CLOSE_DELAY_MS)
		})

		expect(document.querySelector('[data-bindx-tooltip-panel]')).not.toBeNull()
		expect(filterAffordanceButtons(document.body).length).toBeGreaterThan(0)

		// Leaving the panel itself does close it.
		fireEvent.pointerLeave(panel)
		await act(async () => {
			await sleep(PAST_CLOSE_DELAY_MS)
		})

		expect(document.querySelector('[data-bindx-tooltip-panel]')).toBeNull()
	})
})
