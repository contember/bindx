import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, useEntity } from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, schema, testSchema } from '../../../shared'

afterEach(() => {
	cleanup()
})

describe('useEntity hook - persist functionality', () => {
	test('persist should call adapter and commit changes', async () => {
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 0 })

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
					<span data-testid="server-value">{article.title.serverValue}</span>
					<span data-testid="dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
					<button
						data-testid="update-btn"
						onClick={() => article.title.setValue('Persisted Title')}
					>
						Update
					</button>
					<button data-testid="persist-btn" onClick={() => article.persist()}>
						Persist
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

		// Update value
		act(() => {
			;(getByTestId(container, 'update-btn') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'dirty').textContent).toBe('dirty')

		// Persist
		await act(async () => {
			;(getByTestId(container, 'persist-btn') as HTMLButtonElement).click()
			// Wait for persist to complete
			await new Promise(resolve => setTimeout(resolve, 50))
		})

		// After persist, serverValue should be updated and isDirty should be false
		expect(getByTestId(container, 'title').textContent).toBe('Persisted Title')
		expect(getByTestId(container, 'server-value').textContent).toBe('Persisted Title')
		expect(getByTestId(container, 'dirty').textContent).toBe('clean')

		// Verify the store was actually updated
		expect(mockData.Article['article-1']!.title).toBe('Persisted Title')
	})

	test('isPersisting should be true during persist', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 100 })

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
					<span data-testid="persisting">{article.isPersisting ? 'persisting' : 'idle'}</span>
					<button
						data-testid="update-btn"
						onClick={() => article.title.setValue('New Title')}
					>
						Update
					</button>
					<button data-testid="persist-btn" onClick={() => article.persist()}>
						Persist
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
			expect(queryByTestId(container, 'persisting')).not.toBeNull()
		})

		act(() => {
			;(getByTestId(container, 'update-btn') as HTMLButtonElement).click()
		})

		// Start persist (don't await)
		act(() => {
			;(getByTestId(container, 'persist-btn') as HTMLButtonElement).click()
		})

		// Should show persisting state
		expect(getByTestId(container, 'persisting').textContent).toBe('persisting')

		// Wait for persist to complete
		await waitFor(() => {
			expect(getByTestId(container, 'persisting').textContent).toBe('idle')
		})
	})
})
