/**
 * Regression test for https://github.com/contember/bindx/issues/115
 *
 * A column's `name` is its identity: the key its visibility is stored under and
 * the key `bindx-ui`'s auto-table gives its header and cells. It used to be
 * derived from the bound field with no way to override it, so two columns
 * rendering different parts of one relation (`<DataGridHasOneColumn
 * field={it.author}>` twice — first name, last name) were one switch and one
 * React key.
 *
 * Columns now take a `name` prop. Left to derive, two columns of one field still
 * share a name — that is reported, and the visibility list offers the shared
 * name once instead of as rows that look independent and are not.
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
import { entityDef } from '@contember/bindx'
import {
	DataGrid,
	DataGridHasOneColumn,
	DataGridTextColumn,
	DataViewElement,
	useDataViewContext,
	useDataViewElements,
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

const schema = {
	Article: entityDef<Article>('Article'),
	Author: entityDef<Author>('Author'),
} as const

function ColumnNamesProbe(): ReactElement {
	const { columns } = useDataViewContext()
	return <div data-testid="column-names">{columns.map(it => it.name).join(',')}</div>
}

function ElementNamesProbe(): ReactElement {
	const elements = useDataViewElements()
	return <div data-testid="element-names">{elements.map(it => it.name).join(',')}</div>
}

async function collectWarnings(run: () => Promise<void>): Promise<string[]> {
	const warnings: string[] = []
	const original = console.warn
	console.warn = (...args: unknown[]): void => {
		warnings.push(args.join(' '))
	}
	try {
		await run()
	} finally {
		console.warn = original
	}
	return warnings
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
							<DataGridHasOneColumn field={it.author} name="author.firstName" header="First name">
								{author => <>{author.firstName}</>}
							</DataGridHasOneColumn>
							<DataGridHasOneColumn field={it.author} name="author.lastName" header="Last name">
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

		const names = container.querySelector('[data-testid="column-names"]')!.textContent
		expect(names).toBe('title,author.firstName,author.lastName')
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
							<DataGridHasOneColumn field={it.author} name="author.firstName" header="First name">
								{author => <>{author.firstName}</>}
							</DataGridHasOneColumn>
							<DataGridHasOneColumn field={it.author} name="author.lastName" header="Last name">
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
		expect(container.querySelector('[data-testid="last-name-cell"]')).not.toBeNull()
	})

	test('should report two columns left sharing a derived name, and offer that name once', async () => {
		const adapter = new MockAdapter({ Article: {}, Author: {} }, { delay: 0 })

		let container: HTMLElement | undefined
		const warnings = await collectWarnings(async () => {
			const rendered = render(
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
								<ElementNamesProbe />
							</>
						)}
					</DataGrid>
				</BindxProvider>,
			)
			container = rendered.container
			await waitFor(() => {
				expect(container!.querySelector('[data-testid="element-names"]')).not.toBeNull()
			})
		})

		expect(warnings.some(it => it.includes('share the name "author"'))).toBe(true)
		// One name can only carry one visibility flag, so the list says so rather
		// than showing two rows that move together.
		expect(container!.querySelector('[data-testid="element-names"]')!.textContent).toBe('title,author')
	})
})
