/**
 * Regression test for <issue-url — filled in after the issue is filed>
 *
 * A column type often has to hand the code that consumes `columns` something the
 * leaf has no property for: how an export writes a computed cell, a width, an
 * alignment. `ColumnLeafProps` declares no place for it. An extra prop on a
 * custom leaf does reach `useDataViewContext().columns` today, because
 * `resolveColumnNames` spreads `...leaf`, but that is neither typed nor
 * documented, and the built-in column factories drop every prop they do not know.
 *
 * The contract this asks for: a `meta` slot typed by an interface the consumer
 * augments, carried from a custom leaf and from every built-in column.
 */
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React, { type ReactElement } from 'react'
import { BindxProvider, MockAdapter } from '@contember/bindx-react'
import {
	ColumnLeaf,
	type ColumnLeafProps,
	DataGrid,
	DataGridTextColumn,
	useDataViewContext,
} from '@contember/bindx-dataview'
import { createMockData, schema, testSchema } from '../../shared/index.js'

declare module '@contember/bindx-dataview' {
	interface ColumnLeafMeta {
		readonly exportHeader?: string
	}
}

afterEach(() => {
	cleanup()
})

const ComposedColumn = Object.assign(
	function ComposedColumn(_props: { exportHeader: string }): null {
		return null
	},
	{
		staticRender: ({ exportHeader }: { exportHeader: string }): ReactElement => {
			const leafProps: ColumnLeafProps = {
				name: 'composed',
				fieldName: null,
				fieldRef: null,
				sortingField: null,
				filterName: null,
				filterHandler: undefined,
				isTextSearchable: false,
				header: 'Composed',
				renderCell: () => 'composed cell',
				meta: { exportHeader },
			}
			return <ColumnLeaf {...leafProps} />
		},
	},
)

function ExportHeadersProbe(): ReactElement {
	const { columns } = useDataViewContext()
	return <div data-testid="export-headers">{columns.map(it => `${it.name}:${it.meta?.exportHeader ?? '-'}`).join(',')}</div>
}

async function renderExportHeaders(children: ReactElement): Promise<string | null> {
	const adapter = new MockAdapter(createMockData(), { delay: 0 })
	const { container } = render(
		<BindxProvider adapter={adapter} schema={testSchema}>
			{children}
		</BindxProvider>,
	)
	await waitFor(() => {
		expect(container.querySelector('[data-testid="export-headers"]')).not.toBeNull()
	})
	return container.querySelector('[data-testid="export-headers"]')!.textContent
}

describe('column leaf meta', () => {
	test('should carry the meta of a custom leaf to the view columns', async () => {
		const headers = await renderExportHeaders(
			<DataGrid entity={schema.Article}>
				{() => (
					<>
						<ComposedColumn exportHeader="Composed (export)" />
						<ExportHeadersProbe />
					</>
				)}
			</DataGrid>,
		)

		expect(headers).toBe('composed:Composed (export)')
	})

	test('should carry the meta of a built-in column to the view columns', async () => {
		const headers = await renderExportHeaders(
			<DataGrid entity={schema.Article}>
				{it => (
					<>
						<DataGridTextColumn field={it.title} header="Title" meta={{ exportHeader: 'Title (export)' }} />
						<ExportHeadersProbe />
					</>
				)}
			</DataGrid>,
		)

		expect(headers).toBe('title:Title (export)')
	})
})
