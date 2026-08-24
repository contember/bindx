import '../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	defineSchema,
	entityDef,
	MockAdapter,
	scalar,
	useBindxContext,
	useEntity,
	useOnEntityEvent,
} from '@contember/bindx-react'
import type { EntityPersistedEvent, EntityPersistingEvent } from '@contember/bindx'

afterEach(() => {
	cleanup()
})

// ============================================================================
// Reproduces an upstream gap: `entity:persisting` interceptors and
// `entity:persisted` / `entity:persistFailed` listeners are publicly
// advertised on `EntityHandle.intercept(...)` / `EntityHandle.onPersisted(...)`
// and via the React `useOnEntityEvent('entity:persisted', ...)` hook (the
// hook's own JSDoc literally documents `useOnEntityEvent('entity:persisted',
// 'Article', articleId, ...)` as the canonical example) — but at runtime
// the events are never actually emitted.
//
// The reason: `BatchPersister` dispatches `setPersisting(...)` (action type
// `SET_PERSISTING`), but `events/eventFactory.ts` `createBeforeEvent` /
// `createAfterEvent` switch statements have NO case for `SET_PERSISTING`,
// so they return `null`, so the `EventEmitter` never gets a before/after
// event to fan out. Same gap exists for `DELETE_ENTITY` (→ `entity:deleting`
// / `entity:deleted`). Only `entity:resetting` / `entity:reset` have the
// matching factory case today.
//
// Downstream impact: any bindx consumer that wires a "before save" hook
// for normalization (e.g. populating `normalizedName` for search), an
// "after save" toast, or a delete confirmation interceptor sees their
// callback silently never fire. It compiles, runs without warnings, and
// just does nothing.
// ============================================================================

interface Article {
	id: string
	title: string
}

interface TestSchema {
	Article: Article
}

const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
			},
		},
	},
})

const articleDef = entityDef<Article>('Article')

function createMockData() {
	return {
		Article: {
			'article-1': { id: 'article-1', title: 'Initial' },
		},
	}
}

function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

describe('Entity persist lifecycle events', () => {
	test('FAILING: `entity:persisting` interceptor fires before BatchPersister sends mutations', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const persistingCalls: EntityPersistingEvent[] = []

		function TestComponent() {
			const { dispatcher } = useBindxContext()
			const article = useEntity(articleDef, { by: { id: 'article-1' } }, e => e.id().title())

			React.useEffect(() => {
				const emitter = dispatcher.getEventEmitter()
				return emitter.interceptEntity(
					'entity:persisting',
					'Article',
					'article-1',
					event => {
						persistingCalls.push(event)
						return { action: 'continue' }
					},
				)
			}, [dispatcher])

			if (article.$isLoading) return <div>Loading…</div>
			if (article.$isError || article.$isNotFound) return <div>Error</div>

			return (
				<div>
					<button data-testid="dirty" onClick={() => article.title.setValue('Updated')}>Dirty</button>
					<button data-testid="persist" onClick={() => article.$persist()}>Persist</button>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'persist')).toBeTruthy()
		})

		act(() => {
			(getByTestId(container, 'dirty') as HTMLButtonElement).click()
		})

		await act(async () => {
			(getByTestId(container, 'persist') as HTMLButtonElement).click()
			await new Promise(r => setTimeout(r, 50))
		})

		// Currently fails — interceptor is never invoked because
		// `eventFactory.createBeforeEvent` returns `null` for `SET_PERSISTING`.
		expect(persistingCalls).toHaveLength(1)
		expect(persistingCalls[0]?.entityType).toBe('Article')
		expect(persistingCalls[0]?.entityId).toBe('article-1')
		expect(persistingCalls[0]?.isNew).toBe(false)
	})

	test('FAILING: `entity:persisted` listener fires after a successful persist', async () => {
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 0 })
		const persistedCalls: EntityPersistedEvent[] = []

		function TestComponent() {
			const article = useEntity(articleDef, { by: { id: 'article-1' } }, e => e.id().title())

			useOnEntityEvent('entity:persisted', 'Article', 'article-1', event => {
				persistedCalls.push(event)
			})

			if (article.$isLoading) return <div>Loading…</div>
			if (article.$isError || article.$isNotFound) return <div>Error</div>

			return (
				<div>
					<button data-testid="dirty" onClick={() => article.title.setValue('Updated')}>Dirty</button>
					<button data-testid="persist" onClick={() => article.$persist()}>Persist</button>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'persist')).toBeTruthy()
		})

		act(() => {
			(getByTestId(container, 'dirty') as HTMLButtonElement).click()
		})

		await act(async () => {
			(getByTestId(container, 'persist') as HTMLButtonElement).click()
			await new Promise(r => setTimeout(r, 50))
		})

		// Persist actually succeeded — the store reflects the new value:
		expect(mockData.Article['article-1']!.title).toBe('Updated')

		// …but the after-event listener never fires because
		// `eventFactory.createAfterEvent` has no case for `SET_PERSISTING`.
		expect(persistedCalls).toHaveLength(1)
		expect(persistedCalls[0]?.entityType).toBe('Article')
		expect(persistedCalls[0]?.entityId).toBe('article-1')
		expect(persistedCalls[0]?.isNew).toBe(false)
		expect(persistedCalls[0]?.persistedId).toBe('article-1')
	})

	// Note on `entity:persistFailed`: same root cause — `createAfterEvent` in
	// `events/eventFactory.ts` has no case for `SET_PERSISTING` (the action
	// fired by `BatchPersister` after a mutation result is processed).
	// Adding a failure-injection knob to `MockAdapter` is out of scope for
	// this reproducer; once the fix lands for `entity:persisting` /
	// `entity:persisted`, mirroring the fix for the failure path is a
	// one-line addition to the BatchPersister's catch branch.
})
