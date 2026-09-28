import '../../../setup'
import { afterEach, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React, { useState } from 'react'
import { BindxProvider, MockAdapter, defineSchema, entityDef, scalar, useEntityList } from '@contember/bindx-react'

afterEach(cleanup)

interface Article {
	id: string
	title: string
}

const schema = defineSchema<{ Article: Article }>({
	entities: { Article: { fields: { id: scalar(), title: scalar() } } },
})
const articleDef = entityDef<Article>('Article')

interface RenderObservation {
	readonly offset: number
	readonly isRefetching: boolean
	readonly titles: readonly string[]
}

test('items of the previous offset are reported as refetching from the render that changes the offset', async () => {
	const rows = Object.fromEntries(['a', 'b', 'c', 'd'].map(id => [id, { id, title: `Title ${id}` }]))
	const observations: RenderObservation[] = []
	let setOffset: (offset: number) => void = () => {}

	function List(): React.JSX.Element {
		const [offset, setOffsetState] = useState(0)
		setOffset = setOffsetState
		const articles = useEntityList(articleDef, { limit: 2, offset, orderBy: [{ id: 'asc' }] }, a => a.id().title())
		if (articles.$status !== 'ready') return <div>Loading</div>
		const titles = articles.items.map(item => item.title.value ?? '')
		observations.push({ offset, isRefetching: articles.$isRefetching, titles })
		return <div>{`${offset}: ${titles.join(', ')}`}</div>
	}

	const view = render(
		<BindxProvider adapter={new MockAdapter({ Article: rows }, { delay: 0 })} schema={schema}>
			<List />
		</BindxProvider>,
	)
	await waitFor(() => expect(view.getByText('0: Title a, Title b')).toBeDefined())

	act(() => {
		setOffset(2)
	})
	await waitFor(() => expect(view.getByText('2: Title c, Title d')).toBeDefined())

	const settledAtOffsetTwo = observations.filter(observation => observation.offset === 2 && !observation.isRefetching)
	expect(settledAtOffsetTwo.length).toBeGreaterThan(0)
	for (const observation of settledAtOffsetTwo) {
		expect(observation.titles).toEqual(['Title c', 'Title d'])
	}
})
