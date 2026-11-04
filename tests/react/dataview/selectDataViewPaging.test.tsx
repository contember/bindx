// Issue #145: a narrowed search in SelectDataView kept the page index of the previous search,
// and judged `hasNext` by a total that did not belong to the rows on screen.
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import React, { type ReactElement } from 'react'
import { BindxProvider, MockAdapter, defineSchema, entityDef, hasOne, scalar, useEntity } from '@contember/bindx-react'
import type { BackendAdapter, Query, QueryOptions, QueryResult } from '@contember/bindx'
import {
	DataViewEachRow,
	QUERY_FILTER_NAME,
	Select,
	SelectDataView,
	useDataViewContext,
} from '@contember/bindx-dataview'
import { getByTestId, queryByTestId } from './helpers.js'

afterEach(cleanup)

interface Tag {
	id: string
	name: string
}

interface Article {
	id: string
	tag: Tag | null
}

const schema = defineSchema<{ Tag: Tag; Article: Article }>({
	entities: {
		Tag: { fields: { id: scalar(), name: scalar() } },
		Article: { fields: { id: scalar(), tag: hasOne('Tag') } },
	},
})
const tagDef = entityDef<Tag>('Tag')
const articleDef = entityDef<Article>('Article')

// 120 tags named "Tag 001" … "Tag 120"; three of them also match "special".
function createStore(): Record<string, Record<string, Record<string, unknown>>> {
	const Tag: Record<string, Record<string, unknown>> = {}
	for (let i = 1; i <= 120; i++) {
		const id = `t${String(i).padStart(3, '0')}`
		const special = i % 40 === 0 ? ' special' : ''
		Tag[id] = { id, name: `Tag ${String(i).padStart(3, '0')}${special}` }
	}
	return { Tag, Article: { a1: { id: 'a1', tag: null } } }
}

interface ListRequest {
	readonly filter: string
	readonly offset: number | undefined
}

/** Records every list request; can answer count queries with the unfiltered total, as a count that lags behind would. */
class SpyAdapter implements BackendAdapter {
	readonly listRequests: ListRequest[] = []

	constructor(private readonly inner: MockAdapter, private readonly countIgnoresFilter = false) {}

	async query(queries: readonly Query[], options?: QueryOptions): Promise<QueryResult[]> {
		for (const query of queries) {
			if (query.type === 'list' && query.entityType === 'Tag') {
				this.listRequests.push({ filter: JSON.stringify(query.filter ?? {}), offset: query.offset })
			}
		}
		const forwarded = this.countIgnoresFilter
			? queries.map(query => query.type === 'count' ? { ...query, filter: undefined } : query)
			: queries
		return this.inner.query(forwarded, options)
	}

	persist(...args: Parameters<BackendAdapter['persist']>): ReturnType<BackendAdapter['persist']> {
		return this.inner.persist(...args)
	}
}

function Controls(): ReactElement {
	const { filtering, paging, items, loaderState } = useDataViewContext()
	return (
		<>
			<button data-testid="next" onClick={() => paging.next()}>Next</button>
			<button
				data-testid="search-special"
				onClick={() => filtering.setArtifact(QUERY_FILTER_NAME, { mode: 'contains', query: 'special' })}
			>
				Search
			</button>
			<span data-testid="page">{paging.state.pageIndex}</span>
			<span data-testid="has-next">{String(paging.hasNext)}</span>
			<span data-testid="item-count">{items.length}</span>
			<span data-testid="loader-state">{loaderState}</span>
		</>
	)
}

function renderPicker(adapter: BackendAdapter): HTMLElement {
	function Picker(): ReactElement {
		const article = useEntity(articleDef, { by: { id: 'a1' } }, e => e.id().tag(t => t.id().name()))
		if (article.$status !== 'ready') return <span data-testid="loading" />
		return (
			<Select relation={article.tag} options={tagDef}>
				<SelectDataView queryField={['name']}>
					<DataViewEachRow>{item => <span key={item.id} data-testid="option" />}</DataViewEachRow>
					<Controls />
				</SelectDataView>
			</Select>
		)
	}
	const { container } = render(
		<BindxProvider adapter={adapter} schema={schema}>
			<Picker />
		</BindxProvider>,
	)
	return container
}

const text = (container: HTMLElement, testId: string): string | null => getByTestId(container, testId).textContent

async function click(container: HTMLElement, testId: string): Promise<void> {
	await act(async () => {
		fireEvent.click(getByTestId(container, testId))
	})
}

describe('SelectDataView paging', () => {
	test('a new search starts on the first page', async () => {
		const adapter = new SpyAdapter(new MockAdapter(createStore(), { delay: 0 }))
		const container = renderPicker(adapter)
		await waitFor(() => expect(queryByTestId(container, 'item-count')?.textContent).toBe('50'))

		await click(container, 'next')
		await waitFor(() => expect(text(container, 'page')).toBe('1'))
		await waitFor(() => expect(text(container, 'loader-state')).toBe('loaded'))

		await click(container, 'search-special')
		await waitFor(() => expect(text(container, 'item-count')).toBe('3'))

		expect(text(container, 'page')).toBe('0')
		const searchRequests = adapter.listRequests.filter(request => request.filter.includes('special'))
		expect(searchRequests.map(request => request.offset)).toEqual([0])
	})

	test('a short page has no next page, whatever the counted total says', async () => {
		const adapter = new SpyAdapter(new MockAdapter(createStore(), { delay: 0 }), true)
		const container = renderPicker(adapter)
		await waitFor(() => expect(queryByTestId(container, 'item-count')?.textContent).toBe('50'))
		expect(text(container, 'has-next')).toBe('true')

		await click(container, 'search-special')
		await waitFor(() => expect(text(container, 'item-count')).toBe('3'))
		await waitFor(() => expect(text(container, 'loader-state')).toBe('loaded'))

		expect(text(container, 'has-next')).toBe('false')
	})
})
