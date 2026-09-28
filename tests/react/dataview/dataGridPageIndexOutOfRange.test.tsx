// DataGrid-level coverage for https://github.com/contember/bindx/issues/127: a page index past the
// last page — restored from storage or left behind by a narrower filter — lands on the last page with rows.
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act, fireEvent } from '@testing-library/react'
import React, { type ReactElement } from 'react'
import { BindxProvider, MockAdapter, defineSchema, scalar } from '@contember/bindx-react'
import type { BackendAdapter, Query, QueryResult, QueryOptions } from '@contember/bindx'
import { schema } from '../../shared/index.js'
import { DataGrid, DataGridTextColumn, type StateStorage } from '@contember/bindx-dataview'
import { TestTable, TestPagination, getByTestId, queryByTestId, getRowCount, getCellText } from './helpers.js'

afterEach(() => {
	cleanup()
})

interface Article {
	id: string
	title: string
	published: boolean
}

const localSchema = defineSchema<{ Article: Article }>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				published: scalar(),
			},
		},
	},
})

const PUBLISHED_ONLY = { published: { eq: true } }

/** `rowCount` articles; the first three are published. */
function createData(rowCount: number): Record<string, Record<string, Record<string, unknown>>> {
	const Article: Record<string, Record<string, unknown>> = {}
	for (let i = 1; i <= rowCount; i++) {
		const id = `a${String(i).padStart(2, '0')}`
		Article[id] = { id, title: `Article ${i}`, published: i <= 3 }
	}
	return { Article }
}

/** Answers count queries without a count, like an adapter that implements none. */
class CountlessAdapter implements BackendAdapter {
	constructor(private readonly inner: MockAdapter) {}

	async query(queries: readonly Query[], options?: QueryOptions): Promise<QueryResult[]> {
		const results = await this.inner.query(queries, options)
		return results.map((result): QueryResult => result.type === 'count' ? { type: 'list', data: [] } : result)
	}

	persist(...args: Parameters<BackendAdapter['persist']>): ReturnType<BackendAdapter['persist']> {
		return this.inner.persist(...args)
	}
}

function createCountingAdapter(rowCount: number): BackendAdapter {
	return new MockAdapter(createData(rowCount), { delay: 0 })
}

function createCountlessAdapter(rowCount: number): BackendAdapter {
	return new CountlessAdapter(new MockAdapter(createData(rowCount), { delay: 0 }))
}

/** Serializes like the web storages do, starting with a page index stored by an earlier visit. */
function createStorageWithPageIndex(pageIndex: number): StateStorage & { readonly written: Map<string, unknown> } {
	const serialized = new Map<string, string>([['dataview:pageIndex', JSON.stringify(pageIndex)]])
	const written = new Map<string, unknown>()
	return {
		written,
		get: <T,>(key: string): T | undefined => {
			const raw = serialized.get(key)
			return raw === undefined ? undefined : JSON.parse(raw)
		},
		set: (key: string, value: unknown): void => {
			serialized.set(key, JSON.stringify(value))
			written.set(key, value)
		},
		remove: (key: string): void => {
			serialized.delete(key)
		},
	}
}

interface GridProps {
	adapter: BackendAdapter
	storage?: StateStorage
	filter?: Record<string, unknown>
}

function Grid({ adapter, storage, filter }: GridProps): ReactElement {
	return (
		<BindxProvider adapter={adapter} schema={localSchema}>
			<DataGrid entity={schema.Article} itemsPerPage={2} currentPageStateStorage={storage} filter={filter}>
				{it => (
					<>
						<DataGridTextColumn field={it.title} header="Title" />
						<TestTable />
						<TestPagination />
					</>
				)}
			</DataGrid>
		</BindxProvider>
	)
}

function pageInfo(container: Element): string | null {
	return getByTestId(container, 'datagrid-pagination-info').textContent
}

function totalInfo(container: Element): string | null | undefined {
	return queryByTestId(container, 'datagrid-pagination-total')?.textContent
}

function isDisabled(container: Element, testId: string): boolean {
	const button = getByTestId(container, testId)
	return button instanceof HTMLButtonElement && button.disabled
}

async function click(container: Element, testId: string): Promise<void> {
	await act(async () => {
		fireEvent.click(getByTestId(container, testId))
	})
}

/** Walks from the first page to the last and returns the titles of every row on the way. */
async function readAllPages(container: Element): Promise<string[]> {
	await click(container, 'datagrid-pagination-first')
	await waitFor(() => expect(pageInfo(container)).toStartWith('Page 1 '))

	const titles: string[] = []
	for (let page = 1; ; page++) {
		await waitFor(() => expect(pageInfo(container)).toStartWith(`Page ${page} `))
		await waitFor(() => expect(getRowCount(container)).toBeGreaterThan(0))
		for (let row = 0; row < getRowCount(container); row++) {
			titles.push(getCellText(container, row, 'title'))
		}
		if (isDisabled(container, 'datagrid-pagination-next')) return titles
		await click(container, 'datagrid-pagination-next')
	}
}

const ALL_SEVEN_TITLES = ['Article 1', 'Article 2', 'Article 3', 'Article 4', 'Article 5', 'Article 6', 'Article 7']

describe('DataGrid — page index beyond the last page', () => {
	test('a stored page past the end lands on the last page when the adapter counts', async () => {
		const storage = createStorageWithPageIndex(14)
		const { container } = render(<Grid adapter={createCountingAdapter(7)} storage={storage} />)

		await waitFor(() => expect(pageInfo(container)).toBe('Page 4 of 4'))
		await waitFor(() => expect(getRowCount(container)).toBe(1))
		expect(getCellText(container, 0, 'title')).toBe('Article 7')
		expect(totalInfo(container)).toBe('7 total')
		expect(storage.written.get('dataview:pageIndex')).toBe(3)
	})

	test('a stored page past the end lands on the last page when the adapter does not count', async () => {
		const storage = createStorageWithPageIndex(14)
		const { container } = render(<Grid adapter={createCountlessAdapter(7)} storage={storage} />)

		await waitFor(() => expect(pageInfo(container)).toBe('Page 4 of 4'))
		await waitFor(() => expect(getRowCount(container)).toBe(1))
		expect(getCellText(container, 0, 'title')).toBe('Article 7')
		expect(totalInfo(container)).toBe('7 total')
		expect(storage.written.get('dataview:pageIndex')).toBe(3)

		expect((await readAllPages(container)).sort()).toEqual(ALL_SEVEN_TITLES)
	})

	test('a narrower filter on the last page moves to the new last page when the adapter does not count', async () => {
		const adapter = createCountlessAdapter(9)
		const { container, rerender } = render(<Grid adapter={adapter} />)

		await waitFor(() => expect(getRowCount(container)).toBe(2))
		for (let page = 2; page <= 5; page++) {
			await click(container, 'datagrid-pagination-next')
			await waitFor(() => expect(pageInfo(container)).toStartWith(`Page ${page}`))
		}
		await waitFor(() => expect(pageInfo(container)).toBe('Page 5 of 5'))

		rerender(<Grid adapter={adapter} filter={PUBLISHED_ONLY} />)

		await waitFor(() => expect(pageInfo(container)).toBe('Page 2 of 2'))
		await waitFor(() => expect(getRowCount(container)).toBe(1))
		expect(getCellText(container, 0, 'title')).toBe('Article 3')
		expect(totalInfo(container)).toBe('3 total')
		expect(isDisabled(container, 'datagrid-pagination-next')).toBe(true)

		expect((await readAllPages(container)).sort()).toEqual(['Article 1', 'Article 2', 'Article 3'])
	})
})
