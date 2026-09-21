import '../../../setup'
import { afterEach, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React, { useState } from 'react'
import {
	BindxProvider, MockAdapter, SnapshotStore, defineSchema, entityDef, scalar,
	useEntityList,
} from '@contember/bindx-react'

afterEach(cleanup)

interface Article {
	id: string
	title: string
}

const schema = defineSchema<{ Article: Article }>({
	entities: { Article: { fields: { id: scalar(), title: scalar() } } },
})
const articleDef = entityDef<Article>('Article')
const count = 200

function createRows(): Record<string, { id: string; title: string }> {
	return Object.fromEntries(Array.from({ length: count }, (_, i) => [String(i), { id: String(i), title: `Row ${i}` }]))
}

test('a list response notifies global and entity subscribers only after all rows are loaded', async () => {
	const rows = createRows()
	const store = new SnapshotStore()
	const readLoaded = (): number => Object.keys(rows).filter(id => store.hasEntity('Article', id)).length
	const globalObservations: number[] = []
	const entityObservations: number[] = []
	store.subscribe(() => globalObservations.push(readLoaded()))
	store.subscribeToEntity('Article', '0', () => entityObservations.push(readLoaded()))

	function List(): React.JSX.Element {
		const articles = useEntityList(articleDef, {}, a => a.id().title())
		return <div>{articles.$status === 'ready' ? `Loaded ${articles.items.length}` : 'Loading'}</div>
	}

	const view = render(
		<BindxProvider adapter={new MockAdapter({ Article: rows }, { delay: 0 })} schema={schema} store={store}>
			<List />
		</BindxProvider>,
	)
	await waitFor(() => expect(view.getByText(`Loaded ${count}`)).toBeDefined())
	expect(globalObservations.filter(value => value > 0)).toEqual([count])
	expect(entityObservations).toEqual([count])
})

test('a refetch publishes all refreshed rows to mounted row subscribers at once', async () => {
	const rows = createRows()
	const store = new SnapshotStore()
	let setQueryKey: (key: string) => void = () => {}

	function List(): React.JSX.Element {
		const [queryKey, setKey] = useState('initial')
		setQueryKey = setKey
		const articles = useEntityList(articleDef, { queryKey }, a => a.id().title())
		if (articles.$status !== 'ready' || articles.$isRefetching) return <div>Loading</div>
		return <div>{`Last ${articles.items[count - 1]?.title.value}`}</div>
	}

	const view = render(
		<BindxProvider adapter={new MockAdapter({ Article: rows }, { delay: 0 })} schema={schema} store={store}>
			<List />
		</BindxProvider>,
	)
	await waitFor(() => expect(view.getByText(`Last Row ${count - 1}`)).toBeDefined())

	for (const row of Object.values(rows)) row.title = `New ${row.id}`
	const readRefreshed = (): number => Object.keys(rows)
		.filter(id => store.getEntitySnapshot<Article>('Article', id)?.data.title === `New ${id}`)
		.length
	const rowObservations: number[] = []
	const globalObservations: number[] = []
	store.subscribeToEntity('Article', '0', () => rowObservations.push(readRefreshed()))
	store.subscribeToEntity('Article', String(count - 1), () => rowObservations.push(readRefreshed()))
	store.subscribe(() => globalObservations.push(readRefreshed()))

	act(() => setQueryKey('refetch'))
	await waitFor(() => expect(view.getByText(`Last New ${count - 1}`)).toBeDefined())
	expect(rowObservations).toEqual([count, count])
	expect(globalObservations.filter(value => value > 0)).toEqual([count])
})
