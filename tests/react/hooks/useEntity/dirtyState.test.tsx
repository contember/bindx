import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, useEntity } from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, schema, testSchema } from '../../../shared'

afterEach(() => {
	cleanup()
})

describe('useEntity hook - dirty state tracking', () => {
	test('isDirty should be false initially', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity(schema.Article, { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) {
				return <div>Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div>Error</div>
			}

			return <div data-testid="dirty">{article.isDirty ? 'dirty' : 'clean'}</div>
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'dirty')).not.toBeNull()
		})

		expect(getByTestId(container, 'dirty').textContent).toBe('clean')
	})

	test('isDirty should be true after setValue', async () => {
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
					<span data-testid="dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
					<button
						data-testid="update-btn"
						onClick={() => article.title.setValue('New Title')}
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
			expect(queryByTestId(container, 'dirty')).not.toBeNull()
		})

		expect(getByTestId(container, 'dirty').textContent).toBe('clean')

		act(() => {
			;(getByTestId(container, 'update-btn') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'dirty').textContent).toBe('dirty')
	})

	test('isDirty should be false after setting value back to original', async () => {
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
					<span data-testid="dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
					<button
						data-testid="update-btn"
						onClick={() => article.title.setValue('New Title')}
					>
						Update
					</button>
					<button
						data-testid="revert-btn"
						onClick={() => article.title.setValue('Hello World')}
					>
						Revert
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
			expect(queryByTestId(container, 'dirty')).not.toBeNull()
		})

		act(() => {
			;(getByTestId(container, 'update-btn') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'dirty').textContent).toBe('dirty')

		act(() => {
			;(getByTestId(container, 'revert-btn') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'dirty').textContent).toBe('clean')
	})

	test('serverValue should remain unchanged after setValue', async () => {
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
					<span data-testid="value">{article.title.value}</span>
					<span data-testid="server-value">{article.title.serverValue}</span>
					<button
						data-testid="update-btn"
						onClick={() => article.title.setValue('New Title')}
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
			expect(queryByTestId(container, 'value')).not.toBeNull()
		})

		act(() => {
			;(getByTestId(container, 'update-btn') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'value').textContent).toBe('New Title')
		expect(getByTestId(container, 'server-value').textContent).toBe('Hello World')
	})
})
