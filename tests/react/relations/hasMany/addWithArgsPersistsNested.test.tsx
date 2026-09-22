import '../../../setup'
// Regression tests for https://github.com/contember/bindx/issues/121
// (a has-many selected WITH args was stored under its query alias, so everything
// that addresses the relation by its schema field name — the persister above all —
// never found the pending writes)
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, useEntity, usePersist, usePersistEntity } from '@contember/bindx-react'
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

/**
 * What a loaded article lets a test do. Deliberately actions rather than accessors:
 * each variant keeps its own fully-inferred selection type and publishes only these.
 */
interface ArticleActions {
	addTag: () => void
	removeTag: (id: string) => void
	dirtyRelations: () => readonly string[]
	persistAll: () => Promise<unknown>
	persistTagsRelation: () => Promise<unknown>
}

/** The minimal has-many surface these tests drive. */
interface TagList {
	add: (data: { name: string }) => unknown
	remove: (id: string) => void
}

type ArticleProps = { publish: (actions: ArticleActions) => void }

interface Harness {
	readonly adapter: RecordingAdapter
	/** Runs a gesture inside act(). */
	act: (gesture: (actions: ArticleActions) => void) => void
	run: (gesture: (actions: ArticleActions) => Promise<unknown>) => Promise<void>
}

/** Renders the given article component and waits for article-1 to load. */
async function mount(Article: React.ComponentType<ArticleProps>): Promise<Harness> {
	const adapter = new RecordingAdapter(createMockData(), { delay: 0 })
	let actions: ArticleActions | null = null

	const { container } = render(
		<BindxProvider adapter={adapter} schema={schema}>
			<Article publish={next => { actions = next }} />
		</BindxProvider>,
	)
	await waitFor(() => expect(queryByTestId(container, 'tag-count')).not.toBeNull())

	return {
		adapter,
		act: gesture => {
			act(() => {
				gesture(actions!)
			})
		},
		run: async gesture => {
			await act(async () => {
				await gesture(actions!)
			})
		},
	}
}

/** Everything both variants share — all of it except the selection itself. */
function usePublishedActions(publish: (actions: ArticleActions) => void, tags: TagList): void {
	const persist = usePersist()
	const entityPersist = usePersistEntity('Article', 'article-1')

	publish({
		addTag: () => { tags.add({ name: 'New Tag' }) },
		removeTag: id => { tags.remove(id) },
		dirtyRelations: () => entityPersist.dirtyRelations,
		persistAll: () => persist.persistAll(),
		persistTagsRelation: () => persist.persistScope({
			type: 'relation',
			entityType: 'Article',
			entityId: 'article-1',
			relationName: 'tags',
		}),
	})
}

/** Stand-in while the article is still loading — hooks must run unconditionally. */
const NO_TAGS: TagList = { add: () => undefined, remove: () => undefined }

function ArticleWithoutArgs({ publish }: ArticleProps) {
	const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.id().title().tags(t => t.id().name()))
	const ready = article.$status === 'ready' ? article : null
	usePublishedActions(publish, ready ? ready.tags : NO_TAGS)

	if (!ready) return <div>Loading</div>
	return <span data-testid="tag-count">{ready.tags.length}</span>
}

function ArticleWithOrderBy({ publish }: ArticleProps) {
	const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.id().title().tags({ orderBy: [{ name: 'asc' }] }, t => t.id().name()))
	const ready = article.$status === 'ready' ? article : null
	usePublishedActions(publish, ready ? ready.tags : NO_TAGS)

	if (!ready) return <div>Loading</div>
	return <span data-testid="tag-count">{ready.tags.length}</span>
}

/** The operations the article update carried for its `tags` relation. */
const tagOperations = (harness: Harness): unknown[] =>
	harness.adapter.calls
		.filter((call): call is Extract<RecordedCall, { kind: 'persist' }> => call.kind === 'persist' && call.entityType === 'Article')
		.flatMap(call => (Array.isArray(call.changes['tags']) ? (call.changes['tags'] as unknown[]) : []))

const operationsOfKind = (harness: Harness, kind: string): unknown[] =>
	tagOperations(harness).filter(op => typeof op === 'object' && op !== null && kind in op)

// Selection args only shape the read. They never change what the parent owns, so
// both variants must persist identically. With args the relation is fetched under a
// generated alias (`tags_<hash>`) instead of its field name — that is the whole
// difference this file is about.
const variants = [
	{ label: 'without args', Article: ArticleWithoutArgs },
	{ label: 'with orderBy', Article: ArticleWithOrderBy },
]

describe('has-many persist is independent of the selection args', () => {
	for (const { label, Article } of variants) {
		describe(label, () => {
			test('add() nests the new item under its parent', async () => {
				const harness = await mount(Article)

				harness.act(actions => actions.addTag())
				await harness.run(actions => actions.persistAll())

				// A standalone create would lose the relation to the article; against a
				// Contember project with a non-null inverse it fails outright with
				// "Validation has failed: … Field is required".
				expect(operationsOfKind(harness, 'create')).toHaveLength(1)
				expect(harness.adapter.calls.filter(call => call.kind === 'create')).toHaveLength(0)
			})

			test('remove() disconnects the item', async () => {
				const harness = await mount(Article)

				harness.act(actions => actions.removeTag('tag-1'))
				await harness.run(actions => actions.persistAll())

				expect(operationsOfKind(harness, 'disconnect')).toEqual([
					{ disconnect: { id: 'tag-1' }, alias: 'tag-1' },
				])
			})

			test('the relation reports dirty under its schema field name', async () => {
				const harness = await mount(Article)

				harness.act(actions => actions.addTag())

				// usePersistEntity exposes this to application code, and persistScope
				// matches RelationScope.relationName against it.
				harness.act(actions => {
					expect(actions.dirtyRelations()).toContain('tags')
				})
			})

			test('persistScope on the relation saves it', async () => {
				const harness = await mount(Article)

				harness.act(actions => actions.addTag())
				await harness.run(actions => actions.persistTagsRelation())

				expect(operationsOfKind(harness, 'create')).toHaveLength(1)
			})
		})
	}
})
