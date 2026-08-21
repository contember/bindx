import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
} from '@contember/bindx-react'
import {
	DataGrid,
	DataGridHasManyColumn,
	DataGridHasOneColumn,
} from '@contember/bindx-dataview'
import { schema, testSchema } from '../../shared/index.js'
import { TestTable, getByTestId, queryByTestId } from './helpers.js'

afterEach(() => {
	cleanup()
})

describe('relation column runtime row binding', () => {
	test('binds has-one and has-many renderers to each live row and caches its leaves', async () => {
		const adapter = new MockAdapter({
			Article: {
				'article-1': {
					id: 'article-1',
					title: 'First',
					content: '',
					author: { id: 'author-1', name: 'Alice', email: 'alice@example.com' },
					tags: [{ id: 'tag-1', name: 'Red', color: '#f00' }],
				},
				'article-2': {
					id: 'article-2',
					title: 'Second',
					content: '',
					author: { id: 'author-2', name: 'Bob', email: 'bob@example.com' },
					tags: [{ id: 'tag-2', name: 'Blue', color: '#00f' }],
				},
			},
			Author: {
				'author-1': { id: 'author-1', name: 'Alice', email: 'alice@example.com' },
				'author-2': { id: 'author-2', name: 'Bob', email: 'bob@example.com' },
			},
			Tag: {
				'tag-1': { id: 'tag-1', name: 'Red', color: '#f00' },
				'tag-2': { id: 'tag-2', name: 'Blue', color: '#00f' },
			},
			Location: {},
		}, { delay: 0 })
		let childrenCalls = 0

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<DataGrid entity={schema.Article}>
					{it => {
						childrenCalls++
						return (
							<>
								<DataGridHasOneColumn field={it.author} header="Author">
									{author => `${author.name.value}/${it.title.value}`}
								</DataGridHasOneColumn>
								<DataGridHasManyColumn field={it.tags} header="Tags">
									{tag => `${tag.name.value}/${it.title.value}`}
								</DataGridHasManyColumn>
								<TestTable />
							</>
						)
					}}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		expect(getByTestId(container, 'datagrid-row-0-col-author').textContent).toBe('Alice/First')
		expect(getByTestId(container, 'datagrid-row-1-col-author').textContent).toBe('Bob/Second')
		expect(getByTestId(container, 'datagrid-row-0-col-tags').textContent).toBe('Red/First')
		expect(getByTestId(container, 'datagrid-row-1-col-tags').textContent).toBe('Blue/Second')
		expect(childrenCalls).toBe(3)
	})
})
