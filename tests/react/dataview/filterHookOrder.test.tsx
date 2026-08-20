import '../../setup'
import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React, { type ReactElement } from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
} from '@contember/bindx-react'
import {
	DataGrid,
	DataViewFilterScope,
	DataViewTextFilterMatchModeLabel,
	useDataViewContext,
} from '@contember/bindx-dataview'
import {
	DataGridColumnHeaderUI,
	DataGridNullFilter,
} from '@contember/bindx-ui'
import { DataGridFilterMobileHiding } from '../../../packages/bindx-ui/src/datagrid/filters/mobile.js'

afterEach(() => {
	cleanup()
})

interface Article {
	id: string
	title: string
}

const localSchema = defineSchema<{ Article: Article }>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
			},
		},
	},
})

const articleEntity = entityDef<Article>('Article')
const adapter = new MockAdapter({ Article: {} }, { delay: 0 })

function LoaderState(): ReactElement {
	const { loaderState } = useDataViewContext()
	return <span data-testid="loader-state">{loaderState}</span>
}

function Harness({ children }: { children: ReactElement }): ReactElement {
	return (
		<BindxProvider adapter={adapter} schema={localSchema}>
			<DataGrid entity={articleEntity}>
				{() => <>{children}<LoaderState /></>}
			</DataGrid>
		</BindxProvider>
	)
}

describe('filter components with optional names', () => {
	test('composable filter components can switch from a context name to an explicit name', async () => {
		const renderHarness = (explicit: boolean): ReactElement => (
			<Harness>
				<DataViewFilterScope name="title">
					<DataViewTextFilterMatchModeLabel name={explicit ? 'title' : undefined} />
				</DataViewFilterScope>
			</Harness>
		)

		const errorSpy = spyOn(console, 'error').mockImplementation(() => {})
		try {
			const { container, getByTestId, rerender } = render(renderHarness(false))
			await waitFor(() => expect(getByTestId('loader-state').textContent).toBe('loaded'))
			expect(container.textContent).toContain('Contains')
			await act(async () => rerender(renderHarness(true)))
			expect(container.textContent).toContain('Contains')
			expect(errorSpy.mock.calls.some(call => call.some(value =>
				typeof value === 'string' && value.includes('change in the order of Hooks'),
			))).toBe(false)
		} finally {
			errorSpy.mockRestore()
		}
	})

	test('null filters can switch from a context name to an explicit name', async () => {
		const renderHarness = (explicit: boolean): ReactElement => (
			<Harness>
				<DataViewFilterScope name="title">
					<DataGridNullFilter name={explicit ? 'title' : undefined} />
				</DataViewFilterScope>
			</Harness>
		)

		const errorSpy = spyOn(console, 'error').mockImplementation(() => {})
		try {
			const { getByTestId, rerender } = render(renderHarness(false))
			await waitFor(() => expect(getByTestId('loader-state').textContent).toBe('loaded'))
			await act(async () => rerender(renderHarness(true)))
			expect(errorSpy.mock.calls.some(call => call.some(value =>
				typeof value === 'string' && value.includes('change in the order of Hooks'),
			))).toBe(false)
		} finally {
			errorSpy.mockRestore()
		}
	})

	test('mobile filter wrappers can switch from a context name to an explicit name', async () => {
		const renderHarness = (explicit: boolean): ReactElement => (
			<Harness>
				<DataViewFilterScope name="title">
					<DataGridFilterMobileHiding name={explicit ? 'title' : undefined}>
						<span>Filter</span>
					</DataGridFilterMobileHiding>
				</DataViewFilterScope>
			</Harness>
		)

		const errorSpy = spyOn(console, 'error').mockImplementation(() => {})
		try {
			const { container, getByTestId, rerender } = render(renderHarness(false))
			await waitFor(() => expect(getByTestId('loader-state').textContent).toBe('loaded'))
			expect(container.textContent).toContain('Filter')
			await act(async () => rerender(renderHarness(true)))
			expect(container.textContent).toContain('Filter')
			expect(errorSpy.mock.calls.some(call => call.some(value =>
				typeof value === 'string' && value.includes('change in the order of Hooks'),
			))).toBe(false)
		} finally {
			errorSpy.mockRestore()
		}
	})

	test('column headers can add a filter name after the first render', async () => {
		const renderHarness = (filtered: boolean): ReactElement => (
			<Harness>
				<DataGridColumnHeaderUI filterName={filtered ? 'title' : undefined} filter={<span>Filter</span>}>
					Title
				</DataGridColumnHeaderUI>
			</Harness>
		)

		const errorSpy = spyOn(console, 'error').mockImplementation(() => {})
		try {
			const { container, getByTestId, rerender } = render(renderHarness(false))
			await waitFor(() => expect(getByTestId('loader-state').textContent).toBe('loaded'))
			expect(container.textContent).toContain('Title')
			await act(async () => rerender(renderHarness(true)))
			expect(container.textContent).toContain('Title')
			expect(errorSpy.mock.calls.some(call => call.some(value =>
				typeof value === 'string' && value.includes('change in the order of Hooks'),
			))).toBe(false)
		} finally {
			errorSpy.mockRestore()
		}
	})
})
