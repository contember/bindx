// Regression test for <issue-url — filled in after the issue is filed>
//
// The search box in a relation column's header filter must query only the
// text fields the cell renders. The column's related selection also holds the
// relation's `id`, and a `containsCI` on an id column is not a valid Contember
// condition, so the engine rejects the options query and the list goes empty.
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter } from '@contember/bindx-react'
import { DataGrid } from '@contember/bindx-dataview'
import { DataGridAutoTable, DataGridHasManyColumn, DataGridHasOneColumn } from '@contember/bindx-ui'
import { schema, testSchema } from '../../shared/index.js'

afterEach(async () => {
	await act(async () => {
		cleanup()
		await new Promise(resolve => setTimeout(resolve, 0))
	})
})

function renderGrid(): { optionFilters: (entityType: string) => unknown[] } {
	const adapter = new MockAdapter({
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'First',
				content: '',
				author: { id: 'author-1', name: 'Alice', email: 'alice@example.com' },
				tags: [{ id: 'tag-1', name: 'News', color: 'red' }],
			},
		},
		Author: {
			'author-1': { id: 'author-1', name: 'Alice', email: 'alice@example.com' },
		},
		Tag: {
			'tag-1': { id: 'tag-1', name: 'News', color: 'red' },
		},
		Location: {},
	}, { delay: 0 })

	const listFilters: Array<{ entityType: string; filter: unknown }> = []
	const query = adapter.query.bind(adapter)
	adapter.query = (queries, options) => {
		for (const q of queries) {
			if (q.type === 'list') listFilters.push({ entityType: q.entityType, filter: q.filter })
		}
		return query(queries, options)
	}

	render(
		<BindxProvider adapter={adapter} schema={testSchema}>
			<DataGrid entity={schema.Article}>
				{it => (
					<>
						<DataGridHasOneColumn field={it.author} header="Author">
							{author => author.name.value}
						</DataGridHasOneColumn>
						<DataGridHasManyColumn field={it.tags} header="Tags">
							{tag => tag.name.value}
						</DataGridHasManyColumn>
						<DataGridAutoTable />
					</>
				)}
			</DataGrid>
		</BindxProvider>,
	)

	return {
		optionFilters: entityType => listFilters.filter(entry => entry.entityType === entityType).map(entry => entry.filter),
	}
}

async function searchInHeaderFilter(header: string, text: string): Promise<void> {
	const trigger = await waitFor(() => {
		const button = Array.from(document.querySelectorAll('button')).find(candidate => candidate.textContent?.trim() === header)
		if (!button) throw new Error(`no header button ${header}`)
		return button
	})
	fireEvent.click(trigger)
	const search = await waitFor(() => {
		const input = document.querySelector<HTMLInputElement>('input[placeholder="Search…"]')
		if (!input) throw new Error('no search input')
		return input
	})
	fireEvent.change(search, { target: { value: text } })
}

describe('relation column header filter search', () => {
	test('should search a has-one column by the rendered text field only', async () => {
		const { optionFilters } = renderGrid()
		await searchInHeaderFilter('Author', 'Al')

		await waitFor(() => {
			expect(optionFilters('Author').at(-1)).toEqual({ name: { containsCI: 'Al' } })
		})
	})

	test('should search a has-many column by the rendered text field only', async () => {
		const { optionFilters } = renderGrid()
		await searchInHeaderFilter('Tags', 'Ne')

		await waitFor(() => {
			expect(optionFilters('Tag').at(-1)).toEqual({ name: { containsCI: 'Ne' } })
		})
	})
})
