// HasManyDataGrid coverage for https://github.com/contember/bindx/issues/127 when the relation
// reports no total: the grid infers it from the pages it loads for the current query only.
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, Entity, MockAdapter, defineSchema, entityDef, hasMany, scalar } from '@contember/bindx-react'
import type { BackendAdapter, Query, QueryResult, QueryOptions } from '@contember/bindx'
import { DataGridTextColumn, HasManyDataGrid, type StateStorage } from '@contember/bindx-dataview'
import { TestTable, TestPagination, getByTestId, queryByTestId, getRowCount, getCellText } from './helpers.js'

afterEach(cleanup)

interface Article {
	id: string
	title: string
}

interface Author {
	id: string
	articles: Article[]
}

const schema = defineSchema<{ Article: Article; Author: Author }>({
	entities: {
		Article: { fields: { id: scalar(), title: scalar() } },
		Author: { fields: { id: scalar(), articles: hasMany('Article') } },
	},
})
const authorDef = entityDef<Author>('Author')

/** Records the offset of every relation page and drops the relation's total from the response. */
class TotallessRelationAdapter implements BackendAdapter {
	public readonly relationOffsets: (number | undefined)[] = []

	constructor(private readonly inner: MockAdapter) {}

	async query(queries: readonly Query[], options?: QueryOptions): Promise<QueryResult[]> {
		for (const query of queries) {
			const relationField = query.type === 'get' ? query.spec.fields.find(field => field.isArray) : undefined
			if (relationField) this.relationOffsets.push(relationField.offset)
		}
		const results = await this.inner.query(queries, options)
		return results.map(result => result.type === 'get' && result.data !== null ? { type: 'get', data: withoutRelationTotals(result.data) } : result)
	}

	persist(...args: Parameters<BackendAdapter['persist']>): ReturnType<BackendAdapter['persist']> {
		return this.inner.persist(...args)
	}
}

/** Copying an array keeps its rows and drops the non-enumerable `totalCount` the relation carries. */
function withoutRelationTotals(data: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]))
}

function createStorageWithPageIndex(key: string, pageIndex: number): StateStorage {
	const serialized = new Map<string, string>([[key, JSON.stringify(pageIndex)]])
	return {
		get: <T,>(storedKey: string): T | undefined => {
			const raw = serialized.get(storedKey)
			return raw === undefined ? undefined : JSON.parse(raw)
		},
		set: (storedKey: string, value: unknown): void => {
			serialized.set(storedKey, JSON.stringify(value))
		},
		remove: (storedKey: string): void => {
			serialized.delete(storedKey)
		},
	}
}

describe('HasManyDataGrid — page index beyond the last page', () => {
	test('a stored page past the end bisects to the last page when the relation reports no total', async () => {
		const articles = Array.from({ length: 7 }, (_, i) => ({ id: `a${i + 1}`, title: `Article ${i + 1}` }))
		const adapter = new TotallessRelationAdapter(new MockAdapter({
			Article: Object.fromEntries(articles.map(article => [article.id, article])),
			Author: { author: { id: 'author', articles } },
		}, { delay: 0 }))

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Entity entity={authorDef} by={{ id: 'author' }}>
					{author => (
						<HasManyDataGrid
							field={author.articles}
							itemsPerPage={2}
							currentPageStateStorage={createStorageWithPageIndex('Author:articles:pageIndex', 14)}
						>
							{it => (
								<>
									<DataGridTextColumn field={it.title} header="Title" />
									<TestTable />
									<TestPagination />
								</>
							)}
						</HasManyDataGrid>
					)}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => expect(getByTestId(container, 'datagrid-pagination-info').textContent).toBe('Page 4 of 4'))
		await waitFor(() => expect(getRowCount(container)).toBe(1))
		expect(getCellText(container, 0, 'title')).toBe('Article 7')
		expect(queryByTestId(container, 'datagrid-pagination-total')?.textContent).toBe('7 total')
		expect(adapter.relationOffsets.filter(offset => offset !== undefined)).toEqual([28, 14, 6])
	})
})
