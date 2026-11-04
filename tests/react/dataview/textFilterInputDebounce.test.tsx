// Issue #142: a debounce timer left pending by the text filter input applied a stale query
// after the box was emptied or the filter was reset from outside.
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act, fireEvent } from '@testing-library/react'
import React, { type ReactElement } from 'react'
import { BindxProvider, MockAdapter, defineSchema, scalar } from '@contember/bindx-react'
import { entityDef } from '@contember/bindx'
import type { TextFilterArtifact } from '@contember/bindx'
import {
	DataGrid,
	DataGridTextColumn,
	DataViewTextFilterInput,
	QUERY_FILTER_NAME,
	useDataViewFilter,
} from '@contember/bindx-dataview'
import { getByTestId, queryByTestId, TestTable } from './helpers.js'

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

const ArticleEntity = entityDef<Article>('Article')
const DEBOUNCE_MS = 20

function AppliedQuery(): ReactElement {
	const [state, setFilter] = useDataViewFilter<TextFilterArtifact>(QUERY_FILTER_NAME)
	return (
		<>
			<span data-testid="applied-query">{state?.query ?? ''}</span>
			<button data-testid="reset" onClick={() => setFilter(undefined)}>Reset</button>
		</>
	)
}

function renderGrid(): HTMLElement {
	const adapter = new MockAdapter({
		Article: { a1: { id: 'a1', title: 'Alpha' } },
	}, { delay: 0 })
	const { container } = render(
		<BindxProvider adapter={adapter} schema={localSchema}>
			<DataGrid entity={ArticleEntity}>
				{it => (
					<>
						<DataGridTextColumn field={it.title} header="Title" />
						<DataViewTextFilterInput name={QUERY_FILTER_NAME} debounceMs={DEBOUNCE_MS}>
							<input data-testid="search" />
						</DataViewTextFilterInput>
						<AppliedQuery />
						<TestTable />
					</>
				)}
			</DataGrid>
		</BindxProvider>,
	)
	return container
}

function type(container: HTMLElement, value: string): void {
	fireEvent.change(getByTestId(container, 'search'), { target: { value } })
}

function inputValue(container: HTMLElement): string {
	const input = getByTestId(container, 'search')
	if (!(input instanceof HTMLInputElement)) throw new Error('search is not an input')
	return input.value
}

async function waitPastDebounce(): Promise<void> {
	await act(async () => {
		await new Promise(resolve => setTimeout(resolve, DEBOUNCE_MS * 3))
	})
}

describe('text filter input debounce', () => {
	test('emptying the box within the debounce does not bring the previous letter back', async () => {
		const container = renderGrid()
		await waitFor(() => expect(queryByTestId(container, 'datagrid-table')).not.toBeNull())

		type(container, 'ab')
		await waitFor(() => expect(getByTestId(container, 'applied-query').textContent).toBe('ab'))

		type(container, 'a')
		type(container, '')
		await waitPastDebounce()

		expect(getByTestId(container, 'applied-query').textContent).toBe('')
		expect(inputValue(container)).toBe('')
	})

	test('a reset from outside within the debounce drops the pending value', async () => {
		const container = renderGrid()
		await waitFor(() => expect(queryByTestId(container, 'datagrid-table')).not.toBeNull())

		type(container, 'ab')
		await waitFor(() => expect(getByTestId(container, 'applied-query').textContent).toBe('ab'))

		type(container, 'abc')
		fireEvent.click(getByTestId(container, 'reset'))
		await waitPastDebounce()

		expect(getByTestId(container, 'applied-query').textContent).toBe('')
		expect(inputValue(container)).toBe('')
	})
})
