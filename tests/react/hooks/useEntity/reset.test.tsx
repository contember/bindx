import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, useEntity } from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, schema, testSchema } from '../../../shared'

afterEach(() => {
	cleanup()
})

describe('useEntity hook - reset functionality', () => {
	test('reset should revert value to serverValue', async () => {
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
					<span data-testid="dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
					<button
						data-testid="update-btn"
						onClick={() => article.title.setValue('New Title')}
					>
						Update
					</button>
					<button data-testid="reset-btn" onClick={() => article.reset()}>
						Reset
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

		act(() => {
			;(getByTestId(container, 'update-btn') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'title').textContent).toBe('New Title')
		expect(getByTestId(container, 'dirty').textContent).toBe('dirty')

		act(() => {
			;(getByTestId(container, 'reset-btn') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		expect(getByTestId(container, 'dirty').textContent).toBe('clean')
	})
})
