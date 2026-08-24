/**
 * Regression: a DataGrid column whose `field` is a NESTED ref (`it.hasOne.scalar`)
 * must survive the runtime column re-analysis added in "bind relation cells to
 * live rows".
 *
 * The collection pass walks a collector proxy, whose `FIELD_REF_META` carries
 * `fullPath` — so `extractFieldName` returns the dotted `"author.name"`. The
 * runtime pass walks a live `FieldHandle`, which has no `fullPath`, so the same
 * helper returns the bare `"name"`. The positional guard compares those two and
 * throws, killing the whole grid route.
 */
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter } from '@contember/bindx-react'
import { DataGrid } from '@contember/bindx-dataview'
import { DataGridTextColumn } from '@contember/bindx-ui'
import { schema, testSchema } from '../../shared/index.js'
import { TestTable, queryByTestId } from './helpers.js'

afterEach(() => {
	cleanup()
})

describe('nested field ref column', () => {
	test('renders a column over a nested has-one scalar', async () => {
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
							<DataGridTextColumn field={it.title} header="Title" />
							<DataGridTextColumn field={it.author.name} header="Author" />
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-table')).not.toBeNull()
		})

		expect(container.textContent).toContain('Alice')
	})
})
