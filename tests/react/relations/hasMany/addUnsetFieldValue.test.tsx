import '../../../setup'
// Regression tests for https://github.com/contember/bindx/issues/175
// (a field the add() call did not set read `undefined` on the created entity,
// although FieldHandle.value is typed `T | null`)
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, useEntity, usePersist } from '@contember/bindx-react'
import type { PersistResult } from '@contember/bindx'
import { createMockData, entityDefs, queryByTestId, schema } from './setup'

afterEach(() => {
	cleanup()
})

/** MockAdapter that records the changes the persister sends. */
class RecordingAdapter extends MockAdapter {
	readonly persisted: Record<string, unknown>[] = []

	override async persist(entityType: string, id: string, changes: Record<string, unknown>): Promise<PersistResult> {
		this.persisted.push(changes)
		return super.persist(entityType, id, changes)
	}
}

interface AddedTag {
	color: unknown
	serverColor: unknown
	isColorDirty: boolean
}

interface Probe {
	add: () => void
	persistAll: () => Promise<unknown>
	/** The `color` field of every tag that is not one of the loaded ones, as read through `$fields`. */
	addedTags: () => AddedTag[]
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
		addedTags: () => article.tags.items
			.filter(tag => tag.id !== 'tag-1' && tag.id !== 'tag-2')
			.map(tag => ({
				color: tag.$fields.color.value,
				serverColor: tag.$fields.color.serverValue,
				isColorDirty: tag.$fields.color.isDirty,
			})),
	})
	return <span data-testid="tag-count">{article.tags.length}</span>
}

async function mount(): Promise<{ adapter: RecordingAdapter; probe: () => Probe }> {
	const adapter = new RecordingAdapter(createMockData(), { delay: 0 })
	let probe: Probe | null = null
	const { container } = render(
		<BindxProvider adapter={adapter} schema={schema}>
			<Article publish={next => { probe = next }} />
		</BindxProvider>,
	)
	await waitFor(() => expect(queryByTestId(container, 'tag-count')).not.toBeNull())
	return { adapter, probe: () => probe! }
}

describe('HasMany add() — a field the call did not set', () => {
	test('reads null, as its type says, before the entity is persisted', async () => {
		const { probe } = await mount()
		act(() => probe().add())
		expect(probe().addedTags()).toEqual([{ color: null, serverColor: null, isColorDirty: false }])
	})

	test('reads null, as its type says, after the entity is persisted', async () => {
		const { probe } = await mount()
		act(() => probe().add())
		await act(async () => {
			await probe().persistAll()
		})
		expect(probe().addedTags()).toEqual([{ color: null, serverColor: null, isColorDirty: false }])
	})

	test('is left out of the create mutation', async () => {
		const { adapter, probe } = await mount()
		act(() => probe().add())
		await act(async () => {
			await probe().persistAll()
		})
		// Strict, so a `color: undefined` key would fail too, not only an explicit null.
		expect(adapter.persisted).toStrictEqual([{ tags: [{ alias: expect.any(String), create: { name: 'New tag' } }] }])
	})
})
