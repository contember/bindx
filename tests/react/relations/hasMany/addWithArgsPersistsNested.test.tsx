import '../../../setup'
// Regression test for <issue-url — filled in after filing>
// (HasManyRef.add() on a has-many selected with args persists a detached create)
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, useEntity, usePersist } from '@contember/bindx-react'
import type { CreateResult, PersistResult } from '@contember/bindx'
import { createMockData, entityDefs, queryByTestId, schema } from './setup'

afterEach(() => {
	cleanup()
})

type RecordedCall =
	| { kind: 'persist'; entityType: string; id: string; changes: Record<string, unknown> }
	| { kind: 'create'; entityType: string; data: Record<string, unknown> }

/** MockAdapter that records what the persister asks it to write. */
class RecordingAdapter extends MockAdapter {
	readonly calls: RecordedCall[] = []

	override async persist(entityType: string, id: string, changes: Record<string, unknown>): Promise<PersistResult> {
		this.calls.push({ kind: 'persist', entityType, id, changes })
		return super.persist(entityType, id, changes)
	}

	override async create(entityType: string, data: Record<string, unknown>): Promise<CreateResult> {
		this.calls.push({ kind: 'create', entityType, data })
		return super.create(entityType, data)
	}
}

type TagsSelection = Parameters<typeof useEntity<typeof entityDefs.Article>>[2]

/** Loads article-1 with the given tags selection, adds a tag and persists everything. */
async function addTagAndPersist(selection: TagsSelection): Promise<RecordingAdapter> {
	const adapter = new RecordingAdapter(createMockData(), { delay: 0 })
	let addTag: (() => string) | null = null
	let persistAll: (() => Promise<unknown>) | null = null

	function TestComponent() {
		const persist = usePersist()
		const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, selection)
		persistAll = () => persist.persistAll()
		if (article.$isLoading) return <div data-testid="loading">Loading</div>
		if (article.$isError || article.$isNotFound) return <div>Error</div>
		addTag = () => article.tags.add({ name: 'New Tag' })
		return <span data-testid="tag-count">{article.tags.length}</span>
	}

	const { container } = render(
		<BindxProvider adapter={adapter} schema={schema}>
			<TestComponent />
		</BindxProvider>,
	)
	await waitFor(() => expect(queryByTestId(container, 'tag-count')).not.toBeNull())

	act(() => {
		addTag!()
	})
	await act(async () => {
		await persistAll!()
	})
	return adapter
}

/** The has-many `create` operations the article update carried, if the persister nested the new tag under its parent. */
const nestedTagCreates = (adapter: RecordingAdapter): unknown[] =>
	adapter.calls
		.filter((call): call is Extract<RecordedCall, { kind: 'persist' }> => call.kind === 'persist' && call.entityType === 'Article')
		.flatMap(call => (Array.isArray(call.changes['tags']) ? (call.changes['tags'] as unknown[]) : []))
		.filter(op => typeof op === 'object' && op !== null && 'create' in op)

describe('HasMany add() + persist with selection args', () => {
	test('should nest the new item under its parent when the has-many is selected without args', async () => {
		const adapter = await addTagAndPersist(e => e.id().title().tags(t => t.id().name()))

		expect(nestedTagCreates(adapter)).toHaveLength(1)
		expect(adapter.calls.filter(call => call.kind === 'create')).toHaveLength(0)
	})

	test('should nest the new item under its parent when the has-many is selected with orderBy', async () => {
		const adapter = await addTagAndPersist(e => e.id().title().tags({ orderBy: [{ name: 'asc' }] }, t => t.id().name()))

		// Same expectation as above — the selection args only order the read, they never
		// change what the parent owns. A standalone create of the tag would lose the
		// relation to the article (on a Contember backend with a not-null inverse it fails
		// with "Field is required").
		expect(nestedTagCreates(adapter)).toHaveLength(1)
		expect(adapter.calls.filter(call => call.kind === 'create')).toHaveLength(0)
	})
})
