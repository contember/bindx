/**
 * Regression test for <issue-url>
 *
 * A column's `name` is derived from the field it binds, and the column
 * components take no `name` prop, so two columns that render different parts of
 * one relation (`<DataGridHasOneColumn field={it.author}>` twice — first name,
 * last name) end up with the same `name`. That name is the key of the column's
 * visibility state and the key `bindx-ui`'s auto-table gives its cells, so the
 * two columns are one switch, they cannot be told apart in React's key space,
 * and a consumer counting visible columns counts one column twice.
 */
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { act, fireEvent, render, waitFor, cleanup } from '@testing-library/react'
import React, { type ReactElement } from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	scalar,
	hasOne,
} from '@contember/bindx-react'
import {
	DataGrid,
	DataGridHasOneColumn,
	DataGridTextColumn,
	DataViewElement,
	useDataViewContext,
} from '@contember/bindx-dataview'

afterEach(() => {
	cleanup()
})

interface Author {
	id: string
	firstName: string
	lastName: string
}

interface Article {
	id: string
	title: string
	author: Author
}

interface TestSchema {
	Article: Article
	Author: Author
}

const localSchema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				author: hasOne('Author'),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				firstName: scalar(),
				lastName: scalar(),
			},
		},
	},
})

const schema = localSchema.entities

function ColumnNamesProbe(): ReactElement {
	const { columns } = useDataViewContext()
	return <div data-testid="column-names">{columns.map(it => it.name).join(',')}</div>
}

describe('DataGrid column names', () => {
	test('should give two columns of the same relation names of their own', async () => {
		const adapter = new MockAdapter({ Article: {}, Author: {} }, { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" />
							<DataGridHasOneColumn field={it.author} header="First name">
								{author => <>{author.firstName}</>}
							</DataGridHasOneColumn>
							<DataGridHasOneColumn field={it.author} header="Last name">
								{author => <>{author.lastName}</>}
							</DataGridHasOneColumn>
							<ColumnNamesProbe />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(container.querySelector('[data-testid="column-names"]')).not.toBeNull()
		})

		const names = container.querySelector('[data-testid="column-names"]')!.textContent!.split(',')
		// The name addresses a column in the visibility state and keys its cells;
		// two columns therefore need two names.
		expect(new Set(names).size).toBe(names.length)
	})

	test('should hide only the column whose visibility was switched off', async () => {
		const adapter = new MockAdapter({ Article: {}, Author: {} }, { delay: 0 })

		function Cells(): ReactElement {
			const { columns, selection } = useDataViewContext()
			const [, firstNameColumn, lastNameColumn] = columns
			return (
				<>
					<button data-testid="hide-first-name" onClick={() => selection.setVisibility(firstNameColumn!.name, false)} />
					<DataViewElement name={firstNameColumn!.name}>
						<span data-testid="first-name-cell">first name</span>
					</DataViewElement>
					<DataViewElement name={lastNameColumn!.name}>
						<span data-testid="last-name-cell">last name</span>
					</DataViewElement>
				</>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" />
							<DataGridHasOneColumn field={it.author} header="First name">
								{author => <>{author.firstName}</>}
							</DataGridHasOneColumn>
							<DataGridHasOneColumn field={it.author} header="Last name">
								{author => <>{author.lastName}</>}
							</DataGridHasOneColumn>
							<Cells />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(container.querySelector('[data-testid="last-name-cell"]')).not.toBeNull()
		})

		await act(async () => {
			fireEvent.click(container.querySelector('[data-testid="hide-first-name"]')!)
		})

		await waitFor(() => {
			expect(container.querySelector('[data-testid="first-name-cell"]')).toBeNull()
		})
		// The two columns share one visibility key, so switching one off takes the
		// other with it.
		expect(container.querySelector('[data-testid="last-name-cell"]')).not.toBeNull()
	})
})
