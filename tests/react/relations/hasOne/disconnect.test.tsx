import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	isPlaceholderId,
	useEntity,
} from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, entityDefs, schema } from './setup'

afterEach(() => {
	cleanup()
})

describe('HasOne Relations - Disconnect Operations', () => {
	test('2. Disconnect - entity should become null/placeholder, isDirty=true', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().author(a => a.id().name()),
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
					<span data-testid="is-dirty">{article.author.$isDirty ? 'dirty' : 'clean'}</span>
					<button
						data-testid="disconnect"
						onClick={() => article.author.$disconnect()}
					>
						Disconnect
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

		// Initially author-1
		expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')

		// Disconnect
		act(() => {
			;(getByTestId(container, 'disconnect') as HTMLButtonElement).click()
		})

		// Should now be null
		expect(isPlaceholderId(getByTestId(container, 'author-id').textContent!)).toBe(true)
		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
	})

	test('8. Placeholder fields - can write to placeholder fields when disconnected', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-no-author' } }, e =>
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
					<span data-testid="placeholder-name">
						{article.author.$entity.$fields.name.value ?? 'empty'}
					</span>
					<button
						data-testid="set-name"
						onClick={() => article.author.$entity.$fields.name.setValue('New Author')}
					>
						Set Name
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

		// No author initially
		expect(isPlaceholderId(getByTestId(container, 'author-id').textContent!)).toBe(true)
		expect(getByTestId(container, 'placeholder-name').textContent).toBe('empty')

		// Set placeholder name
		act(() => {
			;(getByTestId(container, 'set-name') as HTMLButtonElement).click()
		})

		// Placeholder should have the new value
		expect(getByTestId(container, 'placeholder-name').textContent).toBe('New Author')
	})

	test('Nested Entity Reactivity - setValue on nested entity field', async () => {
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
					<span data-testid="author-name">{article.author.$entity.$fields.name.value ?? 'N/A'}</span>
					<span data-testid="author-email">{article.author.$entity.$fields.email.value ?? 'N/A'}</span>
					<button
						data-testid="set-name"
						onClick={() => article.author.$entity.$fields.name.setValue('Jane Updated')}
					>
						Set Name
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
			expect(queryByTestId(container, 'author-name')).not.toBeNull()
		})

		// Initially John Doe
		expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')

		// Set new name on nested entity
		act(() => {
			;(getByTestId(container, 'set-name') as HTMLButtonElement).click()
		})

		// UI should update reactively
		expect(getByTestId(container, 'author-name').textContent).toBe('Jane Updated')
	})

	test('Multiple setValue on nested entity fields - all should update reactively', async () => {
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
					<span data-testid="author-name">{article.author.$entity.$fields.name.value ?? 'N/A'}</span>
					<span data-testid="author-email">{article.author.$entity.$fields.email.value ?? 'N/A'}</span>
					<button
						data-testid="set-both"
						onClick={() => {
							article.author.$entity.$fields.name.setValue('New Name')
							article.author.$entity.$fields.email.setValue('new@email.com')
						}}
					>
						Set Both
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
			expect(queryByTestId(container, 'author-name')).not.toBeNull()
		})

		// Initially
		expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		expect(getByTestId(container, 'author-email').textContent).toBe('john@example.com')

		// Set both fields
		act(() => {
			;(getByTestId(container, 'set-both') as HTMLButtonElement).click()
		})

		// Both should update
		expect(getByTestId(container, 'author-name').textContent).toBe('New Name')
		expect(getByTestId(container, 'author-email').textContent).toBe('new@email.com')
	})
})
