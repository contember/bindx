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
	useEntity,
	useInterceptEntity,
	useOnEntityEvent,
} from '@contember/bindx-react'
import type {
	BackendAdapter,
	EntityPersistFailedEvent,
	PersistResult,
	Query,
	QueryOptions,
	QueryResult,
} from '@contember/bindx'

afterEach(() => {
	cleanup()
})

// Covers the hook surface a consumer actually uses for a before-persist hook:
// `useInterceptEntity('entity:persisting', ...)` — writes it makes must go out
// in the same save — and `useOnEntityEvent('entity:persistFailed', ...)`.

interface Article {
	id: string
	title: string
	slug: string
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
				slug: scalar(),
			},
		},
	},
})

const articleDef = entityDef<Article>('Article')

function createMockData(): { Article: Record<string, Record<string, unknown>> } {
	return {
		Article: {
			'article-1': { id: 'article-1', title: 'Initial', slug: 'initial' },
		},
	}
}

interface RecordingAdapter {
	adapter: BackendAdapter
	persistPayloads: Array<Record<string, unknown>>
}

/** Wraps MockAdapter so the test can see exactly what each persist sent. */
function createRecordingAdapter(
	data: { Article: Record<string, Record<string, unknown>> },
	options?: { failWith?: string },
): RecordingAdapter {
	const inner = new MockAdapter(data, { delay: 0 })
	const persistPayloads: Array<Record<string, unknown>> = []

	const adapter: BackendAdapter = {
		query: (queries: readonly Query[], queryOptions?: QueryOptions): Promise<QueryResult[]> =>
			inner.query(queries, queryOptions),
		persist: (entityType: string, id: string, changes: Record<string, unknown>): Promise<PersistResult> => {
			persistPayloads.push(changes)
			if (options?.failWith) {
				return Promise.resolve({ ok: false, errorMessage: options.failWith })
			}
			return inner.persist(entityType, id, changes)
		},
		create: (entityType: string, entityData: Record<string, unknown>) => inner.create(entityType, entityData),
		delete: (entityType: string, id: string) => inner.delete(entityType, id),
	}

	return { adapter, persistPayloads }
}

function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

async function clickAndSettle(container: Element, testId: string): Promise<void> {
	await act(async () => {
		const button = getByTestId(container, testId)
		if (!(button instanceof HTMLButtonElement)) throw new Error(`${testId} is not a button`)
		button.click()
		await new Promise(resolve => setTimeout(resolve, 50))
	})
}

describe('persist lifecycle hooks', () => {
	test('useInterceptEntity write lands in the same persist', async () => {
		const mockData = createMockData()
		const { adapter, persistPayloads } = createRecordingAdapter(mockData)

		function TestComponent(): React.ReactNode {
			const article = useEntity(articleDef, { by: { id: 'article-1' } }, e => e.id().title().slug())

			useInterceptEntity('entity:persisting', 'Article', 'article-1', () => {
				if (article.$isLoading || article.$isError || article.$isNotFound) return
				article.slug.setValue('updated')
				return { action: 'continue' }
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

		await clickAndSettle(container, 'dirty')
		await clickAndSettle(container, 'persist')

		// One round trip carrying both the user's edit and the hook's normalization.
		expect(persistPayloads).toHaveLength(1)
		expect(persistPayloads[0]).toEqual({ title: 'Updated', slug: 'updated' })
		expect(mockData.Article['article-1']?.['slug']).toBe('updated')
	})

	test('useOnEntityEvent receives entity:persistFailed', async () => {
		const mockData = createMockData()
		const { adapter } = createRecordingAdapter(mockData, { failWith: 'Server said no' })
		const failures: EntityPersistFailedEvent[] = []

		function TestComponent(): React.ReactNode {
			const article = useEntity(articleDef, { by: { id: 'article-1' } }, e => e.id().title())

			useOnEntityEvent('entity:persistFailed', 'Article', 'article-1', event => {
				failures.push(event)
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

		await clickAndSettle(container, 'dirty')
		await clickAndSettle(container, 'persist')

		expect(failures).toHaveLength(1)
		expect(failures[0]?.entityId).toBe('article-1')
		expect(failures[0]?.isNew).toBe(false)
		expect(failures[0]?.error.message).toBe('Server said no')
		expect(mockData.Article['article-1']?.['title']).toBe('Initial')
	})
})
