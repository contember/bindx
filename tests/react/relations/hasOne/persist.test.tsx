import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	isPlaceholderId,
	useEntity,
	useEntityList,
} from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, entityDefs, schema } from './setup'

afterEach(() => {
	cleanup()
})

describe('HasOne Relations - Persistence', () => {
	test('18. Persist should save hasOne connect to MockAdapter', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().author(a => a.id().name().email()),
			)
			const allAuthors = useEntityList(entityDefs.Author, {}, a => a.id().name().email())

			if (article.isLoading || allAuthors.isLoading) {
				return <div data-testid="loading">Loading...</div>
			}
			if (article.isError || article.isNotFound || allAuthors.isError) {
				return <div>Error</div>
			}

			return (
				<div>
					<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
					<span data-testid="is-dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
					<span data-testid="is-persisting">{article.isPersisting ? 'persisting' : 'idle'}</span>
					<button
						data-testid="connect-author-2"
						onClick={() => article.author.$connect('author-2')}
					>
						Connect Author 2
					</button>
					<button data-testid="persist" onClick={() => article.persist()}>
						Persist
					</button>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'author-id')).not.toBeNull()
		})

		// Initial state
		expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')

		// Connect to different author
		act(() => {
			;(getByTestId(container, 'connect-author-2') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'author-id').textContent).toBe('author-2')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')

		// Persist changes
		await act(async () => {
			;(getByTestId(container, 'persist') as HTMLButtonElement).click()
		})

		// After persist - should be clean
		await waitFor(() => {
			expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
		})

		// Verify MockAdapter store was updated
		const store = adapter.getStore()
		expect(store['Article']?.['article-1']?.['author']).toMatchObject({ id: 'author-2' })
	})

	test('19. Persist should save hasOne disconnect to MockAdapter', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().author(a => a.id().name().email()),
			)

			if (article.isLoading) {
				return <div>Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div data-testid="loading">Loading...</div>
			}

			return (
				<div>
					<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
					<span data-testid="is-dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
					<button data-testid="disconnect" onClick={() => article.author.$disconnect()}>
						Disconnect
					</button>
					<button data-testid="persist" onClick={() => article.persist()}>
						Persist
					</button>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'author-id')).not.toBeNull()
		})

		// Initial state - has author
		expect(getByTestId(container, 'author-id').textContent).toBe('author-1')

		// Disconnect author
		act(() => {
			;(getByTestId(container, 'disconnect') as HTMLButtonElement).click()
		})
		expect(isPlaceholderId(getByTestId(container, 'author-id').textContent!)).toBe(true)
		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')

		// Persist changes
		await act(async () => {
			;(getByTestId(container, 'persist') as HTMLButtonElement).click()
		})

		// After persist - should be clean
		await waitFor(() => {
			expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
		})

		// Verify MockAdapter store was updated - author should be null
		const store = adapter.getStore()
		expect(store['Article']?.['article-1']?.['author']).toBeNull()
	})
})
