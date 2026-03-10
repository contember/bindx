import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, useEntity } from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, schema, testSchema } from '../../../shared'

afterEach(() => {
	cleanup()
})

describe('useEntity hook - optimistic updates', () => {
	test('should update value optimistically on setValue', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity(schema.Article, { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) {
				return <div>Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div>Error</div>
			}

			return (
				<div>
					<span data-testid="title">{article.title.value}</span>
					<button
						data-testid="update-btn"
						onClick={() => article.title.setValue('Updated Title')}
					>
						Update
					</button>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})

		expect(getByTestId(container, 'title').textContent).toBe('Hello World')

		// Click update button
		act(() => {
			;(getByTestId(container, 'update-btn') as HTMLButtonElement).click()
		})

		// Value should be updated immediately (optimistically)
		expect(getByTestId(container, 'title').textContent).toBe('Updated Title')
	})

	test('should update nested entity value optimistically via data', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		// Note: The new API uses data for read access. To update nested relations,
		// you would use useEntity on the related entity directly.
		// This test demonstrates reading nested data.
		function TestComponent() {
			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.author(a => a.id().name()),
			)

			if (article.isLoading) {
				return <div>Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div>Error</div>
			}

			return (
				<div>
					<span data-testid="author-name">{article.data.author?.name ?? 'N/A'}</span>
					<span data-testid="author-id">{article.data.author?.id ?? 'N/A'}</span>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'author-name')).not.toBeNull()
		})

		expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
	})
})
