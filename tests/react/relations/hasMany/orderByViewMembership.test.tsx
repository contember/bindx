import '../../../setup'
// A has-many selected with args is read under a generated alias, and the store
// classifies that VIEW by whether its args can leave members out. The alias is a
// hash, so only the selection knows — this pins that the selection tells the store.
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, useBindxContext, useEntity } from '@contember/bindx-react'
import type { SnapshotStore } from '@contember/bindx'
import { generateHasManyAlias } from '@contember/bindx'
import { createMockData, entityDefs, queryByTestId, schema } from './setup'

afterEach(() => {
	cleanup()
})

const orderByParams = { orderBy: [{ name: 'asc' as const }] }
const filterParams = { filter: { name: 'React' } }

type Props = { params: object; publish: (store: SnapshotStore) => void }

function Article({ params, publish }: Props) {
	const { store } = useBindxContext()
	const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } },
		e => e.id().title().tags(params, t => t.id().name()))
	publish(store)

	if (article.$status !== 'ready') return <div>Loading</div>
	return <span data-testid="tag-count">{article.tags.length}</span>
}

async function mount(params: object): Promise<SnapshotStore> {
	let store: SnapshotStore | null = null
	const { container } = render(
		<BindxProvider adapter={new MockAdapter(createMockData(), { delay: 0 })} schema={schema}>
			<Article params={params} publish={next => { store = next }} />
		</BindxProvider>,
	)
	await waitFor(() => expect(queryByTestId(container, 'tag-count')).not.toBeNull())
	return store!
}

describe('a has-many view is classified by its args, not by its alias', () => {
	test('an ordering-only view shows a member added elsewhere', async () => {
		const store = await mount(orderByParams)
		const alias = generateHasManyAlias('tags', orderByParams)

		// A connection made through another view of the same relation. `orderBy` cannot
		// exclude anything, so this view contains every member and must show it.
		act(() => {
			store.planHasManyConnection('Article', 'article-1', 'tags', 'tag-9')
		})

		expect(store.getHasManyOrderedIds('Article', 'article-1', 'tags', alias))
			.toEqual(['tag-1', 'tag-2', 'tag-9'])
	})

	test('a filtered view does not', async () => {
		const store = await mount(filterParams)
		const alias = generateHasManyAlias('tags', filterParams)
		const before = store.getHasManyOrderedIds('Article', 'article-1', 'tags', alias)

		act(() => {
			store.planHasManyConnection('Article', 'article-1', 'tags', 'tag-9')
		})

		// The client cannot evaluate the filter, so it must not claim membership.
		expect(store.getHasManyOrderedIds('Article', 'article-1', 'tags', alias)).toEqual(before)
	})
})
