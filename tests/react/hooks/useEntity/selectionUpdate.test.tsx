import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act } from '@testing-library/react'
import React, { useState } from 'react'
import { BindxProvider, MockAdapter } from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, useEntity } from '../../../shared'

afterEach(() => {
	cleanup()
})

describe('useEntity hook - selection update on definer change', () => {
	test('should update selection when definer changes', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const [includeContent, setIncludeContent] = useState(false)

			const article = useEntity(
				'Article',
				{ by: { id: 'article-1' } },
				includeContent
					? e => e.title().content()
					: e => e.title(),
			)

			if (article.isLoading) {
				return <div data-testid="loading">Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div>Error</div>
			}

			const data = article.data as Record<string, unknown>

			return (
				<div>
					<h1 data-testid="title">{article.title.value}</h1>
					<p data-testid="has-content">{data['content'] !== undefined ? 'yes' : 'no'}</p>
					<button data-testid="toggle" onClick={() => setIncludeContent(true)}>
						Include Content
					</button>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter}>
				<TestComponent />
			</BindxProvider>,
		)

		// Wait for initial load (title only)
		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})

		expect(getByTestId(container, 'title').textContent).toBe('Hello World')

		// Toggle to include content — this should trigger a re-fetch with new selection
		await act(async () => {
			const button = getByTestId(container, 'toggle') as HTMLButtonElement
			button.click()
		})

		// Wait for re-fetch with content included
		await waitFor(() => {
			expect(getByTestId(container, 'has-content').textContent).toBe('yes')
		}, { timeout: 2000 })
	})
})
