import '../../../setup'
// Regression test for <issue-url — filled in after the issue is filed>
// (a field the add() call did not set reads `undefined` on the created entity,
// although FieldHandle.value is typed `T | null`)
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, useEntity, usePersist } from '@contember/bindx-react'
import { createMockData, entityDefs, queryByTestId, schema } from './setup'

afterEach(() => {
	cleanup()
})

interface Probe {
	add: () => void
	persistAll: () => Promise<unknown>
	/** The `color` value of every tag that is not one of the loaded ones, as read through `$fields`. */
	addedColors: () => unknown[]
}

function Article({ publish }: { publish: (probe: Probe) => void }): React.ReactElement {
	const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.id().tags(t => t.id().name().color()))
	const { persistAll } = usePersist()
	if (article.$isLoading || article.$isError || article.$isNotFound) return <div>Loading…</div>
	publish({
		add: () => {
			article.tags.add({ name: 'New tag' })
		},
		persistAll,
		addedColors: () => article.tags.items.filter(tag => tag.id !== 'tag-1' && tag.id !== 'tag-2').map(tag => tag.$fields.color.value),
	})
	return <span data-testid="tag-count">{article.tags.length}</span>
}

async function mount(): Promise<() => Probe> {
	let probe: Probe | null = null
	const { container } = render(
		<BindxProvider adapter={new MockAdapter(createMockData(), { delay: 0 })} schema={schema}>
			<Article publish={next => { probe = next }} />
		</BindxProvider>,
	)
	await waitFor(() => expect(queryByTestId(container, 'tag-count')).not.toBeNull())
	return () => probe!
}

describe('HasMany add() — a field the call did not set', () => {
	test('should read null, as its type says, before the entity is persisted', async () => {
		const probe = await mount()
		act(() => probe().add())
		expect(probe().addedColors()).toEqual([null])
	})

	test('should read null, as its type says, after the entity is persisted', async () => {
		const probe = await mount()
		act(() => probe().add())
		await act(async () => {
			await probe().persistAll()
		})
		expect(probe().addedColors()).toEqual([null])
	})
})
