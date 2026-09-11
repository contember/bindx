import '../../../setup'
import { afterEach, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider, MockAdapter, SnapshotStore, defineSchema, entityDef, scalar,
	useEntity,
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

test('a loaded entity is published together with its success state', async () => {
	const store = new SnapshotStore()
	const observations: string[] = []
	store.subscribe(() => {
		const title = store.getEntitySnapshot<Article>('Article', 'a')?.data.title ?? '-'
		observations.push(`${store.getLoadState('Article', 'a')?.status}:${title}`)
	})

	function Detail(): React.JSX.Element {
		const article = useEntity(articleDef, { by: { id: 'a' } }, e => e.title())
		return <div>{article.$isLoading ? 'Loading' : `Title ${article.$isError || article.$isNotFound ? '-' : article.title.value}`}</div>
	}

	const view = render(
		<BindxProvider adapter={new MockAdapter({ Article: { a: { id: 'a', title: 'A' } } }, { delay: 0 })} schema={schema} store={store}>
			<Detail />
		</BindxProvider>,
	)
	await waitFor(() => expect(view.getByText('Title A')).toBeDefined())
	expect(observations).toEqual(['loading:-', 'success:A'])
})
