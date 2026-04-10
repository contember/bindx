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

describe('HasOne Relations - Placeholder Entity Behavior', () => {
	test('nullable has-one always returns accessor, never null, even when disconnected', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-no-author' } }, e =>
				e.id().title().author(a => a.id().name().email()),
			)

			if (article.$isLoading) {
				return <div>Loading...</div>
			}
			if (article.$isError || article.$isNotFound) {
				return <div>Error</div>
			}

			return (
				<div>
					<span data-testid="author-defined">{article.author !== null && article.author !== undefined ? 'yes' : 'no'}</span>
					<span data-testid="author-state">{article.author.$state}</span>
					<span data-testid="author-is-connected">{article.author.$isConnected ? 'yes' : 'no'}</span>
					<span data-testid="author-id">{article.author.$id}</span>
					<span data-testid="author-name">{article.author.name.value ?? 'empty'}</span>
					<span data-testid="author-email">{article.author.email.value ?? 'empty'}</span>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'author-defined')).not.toBeNull()
		})

		// Accessor is always returned, never null
		expect(getByTestId(container, 'author-defined').textContent).toBe('yes')
		// State correctly reports disconnected
		expect(getByTestId(container, 'author-state').textContent).toBe('disconnected')
		// $isConnected is false
		expect(getByTestId(container, 'author-is-connected').textContent).toBe('no')
		// Placeholder ID is assigned
		expect(isPlaceholderId(getByTestId(container, 'author-id').textContent!)).toBe(true)
		// Field values are null on placeholder
		expect(getByTestId(container, 'author-name').textContent).toBe('empty')
		expect(getByTestId(container, 'author-email').textContent).toBe('empty')
	})

	test('connected has-one returns accessor with $isConnected true', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
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
					<span data-testid="author-is-connected">{article.author.$isConnected ? 'yes' : 'no'}</span>
					<span data-testid="author-name">{article.author.name.value}</span>
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

		expect(getByTestId(container, 'author-state').textContent).toBe('connected')
		expect(getByTestId(container, 'author-is-connected').textContent).toBe('yes')
		expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
	})

	test('disconnect transitions to placeholder, connect restores — accessor always available', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
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
					<span data-testid="author-is-connected">{article.author.$isConnected ? 'yes' : 'no'}</span>
					<span data-testid="author-name">{article.author.name.value ?? 'empty'}</span>
					<span data-testid="author-id">{article.author.$id}</span>
					<button
						data-testid="disconnect"
						onClick={() => article.author.$disconnect()}
					>
						Disconnect
					</button>
					<button
						data-testid="connect-author-2"
						onClick={() => article.author.$connect('author-2')}
					>
						Connect
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
			expect(queryByTestId(container, 'author-state')).not.toBeNull()
		})

		// Initially connected
		expect(getByTestId(container, 'author-state').textContent).toBe('connected')
		expect(getByTestId(container, 'author-is-connected').textContent).toBe('yes')
		expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')

		// Disconnect
		act(() => {
			;(getByTestId(container, 'disconnect') as HTMLButtonElement).click()
		})

		// Accessor still available, but now placeholder
		expect(getByTestId(container, 'author-state').textContent).toBe('disconnected')
		expect(getByTestId(container, 'author-is-connected').textContent).toBe('no')
		expect(isPlaceholderId(getByTestId(container, 'author-id').textContent!)).toBe(true)
		expect(getByTestId(container, 'author-name').textContent).toBe('empty')

		// Connect to different author
		act(() => {
			;(getByTestId(container, 'connect-author-2') as HTMLButtonElement).click()
		})

		// Back to connected
		expect(getByTestId(container, 'author-state').textContent).toBe('connected')
		expect(getByTestId(container, 'author-is-connected').textContent).toBe('yes')
		expect(getByTestId(container, 'author-id').textContent).toBe('author-2')
	})

	test('placeholder entity fields can be written to', async () => {
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
			expect(queryByTestId(container, 'author-state')).not.toBeNull()
		})

		// Initially disconnected with empty fields
		expect(getByTestId(container, 'author-state').textContent).toBe('disconnected')
		expect(getByTestId(container, 'author-name').textContent).toBe('empty')

		// Write to placeholder
		act(() => {
			;(getByTestId(container, 'set-name') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'author-name').textContent).toBe('New Author')
	})

	test('$remove() on nullable relation calls disconnect, not delete', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
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
					<button
						data-testid="remove"
						onClick={() => article.author.$remove()}
					>
						Remove
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
			expect(queryByTestId(container, 'author-state')).not.toBeNull()
		})

		expect(getByTestId(container, 'author-state').textContent).toBe('connected')

		act(() => {
			;(getByTestId(container, 'remove') as HTMLButtonElement).click()
		})

		// $remove() on nullable FK should disconnect, not delete
		expect(getByTestId(container, 'author-state').textContent).toBe('disconnected')
	})
})
