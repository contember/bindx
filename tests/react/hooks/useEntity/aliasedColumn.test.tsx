import '../../../setup'
// An aliased column (`title({ as: 'headline' })`) is one value: the store keeps it under
// its schema field name and `$data` shows it under its alias, across read, write and persist.
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, FieldHandle, MockAdapter, useBindxContext, useEntity, usePersist } from '@contember/bindx-react'
import type { PersistResult } from '@contember/bindx'
import { createMockData, queryByTestId, schema, testSchema } from '../../../shared'

afterEach(() => {
	cleanup()
})

interface Persisted {
	entityType: string
	changes: Record<string, unknown>
}

/** MockAdapter that records the changes the persister sends. */
class RecordingAdapter extends MockAdapter {
	readonly persisted: Persisted[] = []

	override async persist(entityType: string, id: string, changes: Record<string, unknown>): Promise<PersistResult> {
		this.persisted.push({ entityType, changes })
		return super.persist(entityType, id, changes)
	}
}

interface Probe {
	articleData: () => unknown
	articleColumns: () => unknown
	headline: () => unknown
	isDirty: () => boolean
	setHeadline: (value: string) => void
	addTag: () => void
	addedTagData: () => unknown[]
	addedTagColumns: () => unknown[]
	setAddedTagLabel: (value: string) => void
	persistAll: () => Promise<unknown>
}

const loadedTagIds = new Set(['tag-1', 'tag-2'])

/** The accessor of a column selected under an alias; the accessor types know only schema field names. */
function aliasedField(entity: object, alias: string): FieldHandle<unknown> {
	const field: unknown = Reflect.get(entity, alias)
	if (!(field instanceof FieldHandle)) throw new Error(`'${alias}' is not a field accessor`)
	return field
}

function Article({ publish }: { publish: (probe: Probe) => void }): React.ReactElement {
	const article = useEntity(
		schema.Article,
		{ by: { id: 'article-1' } },
		e => e.id().title({ as: 'headline' }).tags(t => t.id().name({ as: 'label' })),
	)
	const { store } = useBindxContext()
	const { persistAll } = usePersist()
	if (article.$isLoading || article.$isError || article.$isNotFound) return <div>Loading…</div>
	const addedTags = (): typeof article.tags.items => article.tags.items.filter(tag => !loadedTagIds.has(tag.id))
	publish({
		articleData: () => article.$data,
		articleColumns: () => store.getEntitySnapshot('Article', 'article-1')?.data,
		headline: () => aliasedField(article, 'headline').value,
		isDirty: () => article.$isDirty,
		setHeadline: value => aliasedField(article, 'headline').setValue(value),
		addTag: () => {
			article.tags.add()
		},
		addedTagData: () => addedTags().map(tag => tag.$data),
		addedTagColumns: () => addedTags().map(tag => store.getEntitySnapshot('Tag', tag.id)?.data),
		setAddedTagLabel: value => {
			for (const tag of addedTags()) aliasedField(tag, 'label').setValue(value)
		},
		persistAll,
	})
	return <span data-testid="loaded">loaded</span>
}

async function mount(): Promise<{ adapter: RecordingAdapter; probe: () => Probe }> {
	const adapter = new RecordingAdapter(createMockData(), { delay: 0 })
	let probe: Probe | null = null
	const { container } = render(
		<BindxProvider adapter={adapter} schema={testSchema}>
			<Article publish={next => { probe = next }} />
		</BindxProvider>,
	)
	await waitFor(() => expect(queryByTestId(container, 'loaded')).not.toBeNull())
	return {
		adapter,
		probe: () => {
			if (probe === null) throw new Error('The article has not rendered yet')
			return probe
		},
	}
}

function keysOf(value: unknown): string[] {
	return typeof value === 'object' && value !== null ? Object.keys(value).sort() : []
}

describe('an aliased column', () => {
	test('should be stored under its field name and shown in $data under its alias when read', async () => {
		const { probe } = await mount()

		expect(probe().articleColumns()).toMatchObject({ title: 'Hello World' })
		expect(keysOf(probe().articleColumns())).not.toContain('headline')
		expect(probe().articleData()).toMatchObject({ headline: 'Hello World' })
		expect(keysOf(probe().articleData())).not.toContain('title')
		expect(probe().headline()).toBe('Hello World')
	})

	test('should keep one key in the store and in $data after setValue', async () => {
		const { probe } = await mount()

		act(() => probe().setHeadline('Changed'))

		expect(probe().articleColumns()).toMatchObject({ title: 'Changed' })
		expect(keysOf(probe().articleColumns())).not.toContain('headline')
		expect(probe().articleData()).toMatchObject({ headline: 'Changed' })
		expect(keysOf(probe().articleData())).not.toContain('title')
		expect(probe().headline()).toBe('Changed')
		expect(probe().isDirty()).toBe(true)
	})

	test('should persist under its field name and keep one key afterwards', async () => {
		const { adapter, probe } = await mount()

		act(() => probe().setHeadline('Changed'))
		await act(async () => {
			await probe().persistAll()
		})

		expect(adapter.persisted).toEqual([{ entityType: 'Article', changes: { title: 'Changed' } }])
		expect(adapter.getStore()['Article']?.['article-1']?.['title']).toBe('Changed')
		expect(probe().isDirty()).toBe(false)
		expect(keysOf(probe().articleColumns())).not.toContain('headline')
		expect(probe().articleData()).toMatchObject({ headline: 'Changed' })
		expect(keysOf(probe().articleData())).not.toContain('title')
	})

	test('should not be sent when set back to the value it was read with', async () => {
		const { adapter, probe } = await mount()

		act(() => probe().setHeadline('Changed'))
		act(() => probe().setHeadline('Hello World'))
		await act(async () => {
			await probe().persistAll()
		})

		expect(probe().isDirty()).toBe(false)
		expect(adapter.persisted).toEqual([])
	})

	test('should keep one key on an added entity across unset, setValue and persist', async () => {
		const { adapter, probe } = await mount()

		act(() => probe().addTag())
		expect(probe().addedTagData()).toEqual([{ id: expect.any(String), label: null }])

		act(() => probe().setAddedTagLabel('New tag'))
		expect(probe().addedTagData()).toEqual([{ id: expect.any(String), label: 'New tag' }])
		expect(probe().addedTagColumns()).toEqual([{ id: expect.any(String), name: 'New tag' }])

		await act(async () => {
			await probe().persistAll()
		})

		expect(adapter.persisted).toEqual([{
			entityType: 'Article',
			changes: { tags: [{ create: { name: 'New tag' }, alias: expect.any(String) }] },
		}])
		expect(probe().addedTagData()).toEqual([{ id: expect.any(String), label: 'New tag' }])
	})
})
