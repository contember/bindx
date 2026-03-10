import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, useEntity } from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, schema, testSchema } from '../../../shared'

afterEach(() => {
	cleanup()
})

describe('useEntity hook - loading state', () => {
	test('should show loading state initially', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 50 })

		function TestComponent() {
			const article = useEntity(schema.Article, { by: { id: 'article-1' } }, e => e.title())

			if (article.isLoading) {
				return <div data-testid="loading">Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div>Error</div>
			}

			return <div data-testid="title">{article.title.value}</div>
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		// Initially should show loading
		expect(queryByTestId(container, 'loading')).not.toBeNull()

		// Wait for data to load
		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})

		expect(getByTestId(container, 'title').textContent).toBe('Hello World')
	})

	test('isLoading should return true for loading accessor', () => {
		const adapter = new MockAdapter(createMockData(), { delay: 1000 })
		let accessor: ReturnType<typeof useEntity> | null = null

		function TestComponent() {
			accessor = useEntity(schema.Article, { by: { id: 'article-1' } }, e => e.title())
			return null
		}

		render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		expect(accessor).not.toBeNull()
		expect(accessor!.isLoading).toBe(true)
	})
})
