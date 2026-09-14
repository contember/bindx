// Regression test for <issue-url — filled in after the issue is filed>
import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, useEntity } from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, entityDefs, schema } from './setup'

afterEach(() => {
	cleanup()
})

describe('HasOne Relations - create through placeholder on a relation loaded as null', () => {
	test('should keep the created entity connected after persist when the parent was fetched with the relation null', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-no-author' } }, e =>
				e.id().title().author(a => a.id().name()),
			)

			if (article.$isLoading) {
				return <div>Loading...</div>
			}
			if (article.$isError || article.$isNotFound) {
				return <div>Error</div>
			}

			return (
				<div>
					<span data-testid="author-state">{article.author.$state}</span>
					<span data-testid="author-name">{article.author.name.value ?? 'empty'}</span>
					<span data-testid="dirty">{article.$isDirty ? 'dirty' : 'clean'}</span>
					<button data-testid="write" onClick={() => article.author.name.setValue('Created Author')}>write</button>
					<button data-testid="persist" onClick={() => article.$persist()}>persist</button>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'author-state')).not.toBeNull()
		})
		expect(getByTestId(container, 'author-state').textContent).toBe('disconnected')

		// Writing into the disconnected placeholder stages a nested create.
		act(() => {
			;(getByTestId(container, 'write') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'author-name').textContent).toBe('Created Author')

		await act(async () => {
			;(getByTestId(container, 'persist') as HTMLButtonElement).click()
		})

		await waitFor(() => {
			expect(getByTestId(container, 'dirty').textContent).toBe('clean')
		})

		// The relation now points at the created entity. It must not be reset to the
		// `author: null` the parent carried from its initial fetch.
		expect(getByTestId(container, 'author-state').textContent).toBe('connected')
		expect(getByTestId(container, 'author-name').textContent).toBe('Created Author')
	})
})
