/**
 * Regression test for https://github.com/contember/bindx/issues/114
 *
 * `useDataViewElements()` is what the toolbar's column-visibility list is built
 * from. Without a layout it falls back to `columns.filter(c => c.fieldName !== null)`,
 * so a column whose cell is computed from several fields (and which therefore has
 * no single `fieldName`) is never offered, even though the table hides it by
 * `col.name` like any other column.
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
} from '@contember/bindx-react'
import { schema } from '../../shared/index.js'
import {
	ColumnLeaf,
	type ColumnLeafProps,
	DataGrid,
	DataGridTextColumn,
	DataViewElement,
	useDataViewContext,
	useDataViewElements,
} from '@contember/bindx-dataview'

afterEach(() => {
	cleanup()
})

interface Article {
	id: string
	title: string
	subtitle: string
}

interface TestSchema {
	Article: Article
}

const localSchema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				subtitle: scalar(),
			},
		},
	},
})

/**
 * A column whose cell is composed from more than one field, so it binds to none.
 * This is the shape every "computed" column ends up with: an action cell, a facet,
 * a cell derived from a relation.
 */
const ComposedColumn = Object.assign(
	function ComposedColumn(_props: { header: React.ReactNode }): null {
		return null
	},
	{
		staticRender: ({ header }: { header: React.ReactNode }): ReactElement => {
			const leafProps: ColumnLeafProps = {
				name: 'composed',
				fieldName: null,
				fieldRef: null,
				sortingField: null,
				filterName: null,
				filterHandler: undefined,
				isTextSearchable: false,
				header,
				renderCell: () => 'composed cell',
			}
			return <ColumnLeaf {...leafProps} />
		},
	},
)

function ElementNamesProbe(): ReactElement {
	const elements = useDataViewElements()
	return <div data-testid="element-names">{elements.map(it => it.name).join(',')}</div>
}

function ColumnNamesProbe(): ReactElement {
	const { columns } = useDataViewContext()
	return <div data-testid="column-names">{columns.map(it => it.name).join(',')}</div>
}

describe('useDataViewElements', () => {
	test('should offer a column with no field of its own when deriving elements from columns', async () => {
		const adapter = new MockAdapter({ Article: {} }, { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" />
							<ComposedColumn header="Composed" />
							<ElementNamesProbe />
							<ColumnNamesProbe />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(container.querySelector('[data-testid="column-names"]')).not.toBeNull()
		})

		const columnNames = container.querySelector('[data-testid="column-names"]')!.textContent
		const elementNames = container.querySelector('[data-testid="element-names"]')!.textContent

		expect(columnNames).toBe('title,composed')
		// The visibility list is the only way to reach a column, so it has to list
		// every column the view registers.
		expect(elementNames).toBe('title,composed')
	})

	test('should hide a column with no field of its own once its element is toggled off', async () => {
		const adapter = new MockAdapter({ Article: {} }, { delay: 0 })

		function HiddenComposedCell(): ReactElement {
			const { selection } = useDataViewContext()
			// The table wraps each cell in a DataViewElement keyed by `col.name`;
			// visibility therefore works for a field-less column already.
			return (
				<>
					<button data-testid="hide-composed" onClick={() => selection.setVisibility('composed', false)} />
					<DataViewElement name="composed">
						<span data-testid="composed-cell">composed cell</span>
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
							<ComposedColumn header="Composed" />
							<HiddenComposedCell />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(container.querySelector('[data-testid="composed-cell"]')).not.toBeNull()
		})

		await act(async () => {
			fireEvent.click(container.querySelector('[data-testid="hide-composed"]')!)
		})

		await waitFor(() => {
			expect(container.querySelector('[data-testid="composed-cell"]')).toBeNull()
		})
	})
})
