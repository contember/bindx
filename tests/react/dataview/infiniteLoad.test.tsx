// Issue #146: DataViewInfiniteLoadProvider replaced the rows with each page instead of accumulating them,
// and never cleared its loading flag, so no page past the second could be loaded.
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import React, { type ReactElement } from 'react'
import { BindxProvider, MockAdapter, defineSchema, entityDef, hasOne, scalar, useEntity } from '@contember/bindx-react'
import {
	DataViewEachRow,
	DataViewInfiniteLoadProvider,
	DataViewInfiniteLoadTrigger,
	QUERY_FILTER_NAME,
	Select,
	SelectDataView,
	useDataViewContext,
	useDataViewReload,
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

const TAG_COUNT = 106

function tagId(i: number): string {
	return `t${String(i).padStart(3, '0')}`
}

// 106 tags; every tenth one also matches "ten".
function createAdapter(): MockAdapter {
	const Tag: Record<string, Record<string, unknown>> = {}
	for (let i = 1; i <= TAG_COUNT; i++) {
		Tag[tagId(i)] = { id: tagId(i), name: `Tag ${String(i).padStart(3, '0')}${i % 10 === 0 ? ' ten' : ''}` }
	}
	return new MockAdapter({ Tag, Article: { a1: { id: 'a1', tag: null } } }, { delay: 10 })
}

function SearchButton(): ReactElement {
	const { filtering } = useDataViewContext()
	return (
		<button
			data-testid="search-ten"
			onClick={() => filtering.setArtifact(QUERY_FILTER_NAME, { mode: 'contains', query: 'ten' })}
		>
			Search
		</button>
	)
}

function ReloadButton(): ReactElement {
	const reload = useDataViewReload()
	return <button data-testid="reload" onClick={reload}>Reload</button>
}

function renderPicker(adapter: MockAdapter): HTMLElement {
	function Picker(): ReactElement {
		const article = useEntity(articleDef, { by: { id: 'a1' } }, e => e.id().tag(t => t.id().name()))
		if (article.$status !== 'ready') return <span data-testid="loading" />
		return (
			<Select relation={article.tag} options={tagDef}>
				<SelectDataView queryField={['name']} initialSorting={{ name: 'asc' }}>
					<DataViewInfiniteLoadProvider>
						<DataViewEachRow>
							{(item, index) => <span key={item.id} data-testid="option" data-id={item.id} data-index={index} />}
						</DataViewEachRow>
						<DataViewInfiniteLoadTrigger>
							<button data-testid="load-more">More</button>
						</DataViewInfiniteLoadTrigger>
						<SearchButton />
						<ReloadButton />
					</DataViewInfiniteLoadProvider>
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

function optionIds(container: HTMLElement): string[] {
	return Array.from(container.querySelectorAll('[data-testid="option"]')).map(el => el.getAttribute('data-id') ?? '')
}

function loadMoreButton(container: HTMLElement): HTMLButtonElement | null {
	const button = queryByTestId(container, 'load-more')
	return button instanceof HTMLButtonElement ? button : null
}

async function loadMore(container: HTMLElement): Promise<void> {
	await waitFor(() => expect(loadMoreButton(container)?.disabled).toBe(false))
	await act(async () => {
		fireEvent.click(getByTestId(container, 'load-more'))
	})
}

const expectedIds = (count: number): string[] => Array.from({ length: count }, (_, i) => tagId(i + 1))

describe('DataViewInfiniteLoadProvider', () => {
	test('each loaded page is appended, page after page, until the list ends', async () => {
		const container = renderPicker(createAdapter())
		await waitFor(() => expect(optionIds(container)).toHaveLength(50))

		await loadMore(container)
		await waitFor(() => expect(optionIds(container)).toHaveLength(100))
		expect(optionIds(container)).toEqual(expectedIds(100))

		await loadMore(container)
		await waitFor(() => expect(optionIds(container)).toHaveLength(TAG_COUNT))
		expect(optionIds(container)).toEqual(expectedIds(TAG_COUNT))
		const indices = Array.from(container.querySelectorAll('[data-testid="option"]')).map(el => el.getAttribute('data-index'))
		expect(indices).toEqual(Array.from({ length: TAG_COUNT }, (_, i) => String(i)))

		await waitFor(() => expect(loadMoreButton(container)).toBeNull())
	})

	test('two calls before the next render load one page', async () => {
		const container = renderPicker(createAdapter())
		await waitFor(() => expect(optionIds(container)).toHaveLength(50))
		await waitFor(() => expect(loadMoreButton(container)?.disabled).toBe(false))

		await act(async () => {
			fireEvent.click(getByTestId(container, 'load-more'))
			fireEvent.click(getByTestId(container, 'load-more'))
		})
		await waitFor(() => expect(optionIds(container)).toHaveLength(100))
		expect(optionIds(container)).toEqual(expectedIds(100))
	})

	test('a new search drops the pages of the previous one', async () => {
		const container = renderPicker(createAdapter())
		await waitFor(() => expect(optionIds(container)).toHaveLength(50))
		await loadMore(container)
		await waitFor(() => expect(optionIds(container)).toHaveLength(100))

		await act(async () => {
			fireEvent.click(getByTestId(container, 'search-ten'))
		})
		await waitFor(() => expect(optionIds(container)).toEqual(Array.from({ length: 10 }, (_, i) => tagId((i + 1) * 10))))
	})

	test('reload() loads the list again from the first page', async () => {
		const adapter = createAdapter()
		const container = renderPicker(adapter)
		await waitFor(() => expect(optionIds(container)).toHaveLength(50))
		await loadMore(container)
		await waitFor(() => expect(optionIds(container)).toHaveLength(100))

		delete adapter.getStore()['Tag']?.[tagId(1)]
		await act(async () => {
			fireEvent.click(getByTestId(container, 'reload'))
		})

		await waitFor(() => expect(optionIds(container)).toEqual(expectedIds(51).slice(1)))
	})
})
