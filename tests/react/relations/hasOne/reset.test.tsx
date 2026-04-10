import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	useEntity,
} from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, entityDefs, schema } from './setup'

afterEach(() => {
	cleanup()
})

describe('HasOne Relations - Reset Operations', () => {
	test('6. Reset after connect - should return to original entity', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().author(a => a.id().name()),
			)

			if (article.$isLoading) {
				return <div>Loading...</div>
			}
			if (article.$isError || article.$isNotFound) {
				return <div data-testid="loading">Loading...</div>
			}

			const authorHandle = article.$hasOne('author')

			return (
				<div>
					<span data-testid="author-id">{article.author?.$id ?? 'null'}</span>
					<span data-testid="is-dirty">{authorHandle.$isDirty ? 'dirty' : 'clean'}</span>
					<button
						data-testid="connect-author-2"
						onClick={() => authorHandle.$connect('author-2')}
					>
						Connect
					</button>
					<button data-testid="reset" onClick={() => authorHandle.$reset()}>
						Reset
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

		// Connect to author-2
		act(() => {
			;(getByTestId(container, 'connect-author-2') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'author-id').textContent).toBe('author-2')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')

		// Reset
		act(() => {
			;(getByTestId(container, 'reset') as HTMLButtonElement).click()
		})

		// Should be back to author-1
		expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
	})

	test('7. Reset after disconnect - should return to original entity', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().author(a => a.id().name()),
			)

			if (article.$isLoading) {
				return <div>Loading...</div>
			}
			if (article.$isError || article.$isNotFound) {
				return <div data-testid="loading">Loading...</div>
			}

			const authorHandle = article.$hasOne('author')

			return (
				<div>
					<span data-testid="author-id">{article.author?.$id ?? 'null'}</span>
					<span data-testid="is-dirty">{authorHandle.$isDirty ? 'dirty' : 'clean'}</span>
					<button
						data-testid="disconnect"
						onClick={() => authorHandle.$disconnect()}
					>
						Disconnect
					</button>
					<button data-testid="reset" onClick={() => authorHandle.$reset()}>
						Reset
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

		// Disconnect
		act(() => {
			;(getByTestId(container, 'disconnect') as HTMLButtonElement).click()
		})

		// Nullable has-one returns null when disconnected
		expect(getByTestId(container, 'author-id').textContent).toBe('null')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')

		// Reset
		act(() => {
			;(getByTestId(container, 'reset') as HTMLButtonElement).click()
		})

		// Should be back to author-1
		expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
	})
})
