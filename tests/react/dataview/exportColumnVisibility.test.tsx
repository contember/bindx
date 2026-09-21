import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter } from '@contember/bindx-react'
import {
	DataGrid,
	DataGridTextColumn,
	DataViewExportTrigger,
	type ExportFactory,
	type ExportFactoryArgs,
	type ExportResult,
} from '@contember/bindx-dataview'
import { createMockData, schema, testSchema } from '../../shared/index.js'
import { TestTable } from './helpers.js'

afterEach(cleanup)

class CapturingExportFactory implements ExportFactory {
	readonly exports: ExportFactoryArgs[] = []

	create(args: ExportFactoryArgs): ExportResult {
		this.exports.push(args)
		return { blob: new Blob([]), extension: 'csv' }
	}
}

describe('DataViewExportTrigger column visibility', () => {
	test.each([true, false])('should respect declared names and omit virtual columns (onlyVisible=%s)', async onlyVisible => {
		const exportFactory = new CapturingExportFactory()
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const originalCreateObjectURL = URL.createObjectURL
		const originalRevokeObjectURL = URL.revokeObjectURL
		URL.createObjectURL = () => 'blob:test'
		URL.revokeObjectURL = () => {}

		try {
			const { getByText, queryByTestId } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<DataGrid entity={schema.Article} initialSelection={{ visibility: { 'title.hidden': false } }}>
						{it => (
							<>
								<DataGridTextColumn field={it.title} name="title.hidden" header="Hidden title" />
								<DataGridTextColumn field={it.title} name="title.visible" header="Visible title" />
								<DataGridTextColumn field={it.content} header="Search only" virtual />
								<DataViewExportTrigger onlyVisible={onlyVisible} exportFactory={exportFactory}>
									<button>Export</button>
								</DataViewExportTrigger>
								<TestTable />
							</>
						)}
					</DataGrid>
				</BindxProvider>,
			)

			await waitFor(() => expect(queryByTestId('datagrid-row-0')).not.toBeNull())
			expect(queryByTestId('datagrid-header-title.hidden')).toBeNull()
			expect(queryByTestId('datagrid-header-title.visible')).not.toBeNull()
			expect(queryByTestId('datagrid-header-content')).toBeNull()

			await act(async () => {
				fireEvent.click(getByText('Export'))
			})
			await waitFor(() => expect(exportFactory.exports).toHaveLength(1))
			expect(exportFactory.exports[0]?.columns).toEqual(onlyVisible
				? [{ name: 'Visible title', fieldName: 'title' }]
				: [
					{ name: 'Hidden title', fieldName: 'title' },
					{ name: 'Visible title', fieldName: 'title' },
				])
		} finally {
			URL.createObjectURL = originalCreateObjectURL
			URL.revokeObjectURL = originalRevokeObjectURL
		}
	})
})
