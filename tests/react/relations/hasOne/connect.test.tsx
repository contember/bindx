import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	isPersistedId,
	useEntity,
	useEntityList,
} from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, entityDefs, schema } from './setup'

afterEach(() => {
	cleanup()
})

describe('HasOne Relations - Connect Operations', () => {
	test('1. Connect to existing entity - entity should change, isDirty=true', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().author(a => a.id().name().email()),
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
					<span data-testid="author-name">{article.author?.$entity.$fields.name.value ?? 'N/A'}</span>
					<span data-testid="is-dirty">{authorHandle.$isDirty ? 'dirty' : 'clean'}</span>
					<button
						data-testid="connect-author-2"
						onClick={() => authorHandle.$connect('author-2')}
					>
						Connect author-2
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
		expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')

		// Connect to author-2
		act(() => {
			;(getByTestId(container, 'connect-author-2') as HTMLButtonElement).click()
		})

		// Should now point to author-2
		expect(getByTestId(container, 'author-id').textContent).toBe('author-2')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
	})

	test('3. Connect + Disconnect - entity should be null', async () => {
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
					<button
						data-testid="connect-author-2"
						onClick={() => authorHandle.$connect('author-2')}
					>
						Connect
					</button>
					<button
						data-testid="disconnect"
						onClick={() => authorHandle.$disconnect()}
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

		// Connect to author-2
		act(() => {
			;(getByTestId(container, 'connect-author-2') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'author-id').textContent).toBe('author-2')

		// Disconnect
		act(() => {
			;(getByTestId(container, 'disconnect') as HTMLButtonElement).click()
		})

		// Nullable has-one returns null when disconnected
		expect(getByTestId(container, 'author-id').textContent).toBe('null')
	})

	test('4. Disconnect + Connect different - new entity should be connected', async () => {
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
					<button
						data-testid="disconnect"
						onClick={() => authorHandle.$disconnect()}
					>
						Disconnect
					</button>
					<button
						data-testid="connect-author-2"
						onClick={() => authorHandle.$connect('author-2')}
					>
						Connect author-2
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

		// Disconnect
		act(() => {
			;(getByTestId(container, 'disconnect') as HTMLButtonElement).click()
		})

		// Nullable has-one returns null when disconnected
		expect(getByTestId(container, 'author-id').textContent).toBe('null')

		// Connect to author-2
		act(() => {
			;(getByTestId(container, 'connect-author-2') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'author-id').textContent).toBe('author-2')
	})

	test('5. Connect + Connect different - last one wins', async () => {
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
					<button
						data-testid="connect-author-1"
						onClick={() => authorHandle.$connect('author-1')}
					>
						Connect author-1
					</button>
					<button
						data-testid="connect-author-2"
						onClick={() => authorHandle.$connect('author-2')}
					>
						Connect author-2
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

		// Connect back to author-1
		act(() => {
			;(getByTestId(container, 'connect-author-1') as HTMLButtonElement).click()
		})

		// Last connect wins
		expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
	})

	test('9. Connect to different entity via select - should update UI reactively', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().author(a => a.id().name().email()),
			)

			// Load all authors (like a real app would do for a select dropdown)
			const allAuthors = useEntityList(entityDefs.Author, {}, a => a.id().name().email())

			if (article.$isLoading || allAuthors.$isLoading) {
				return <div data-testid="loading">Loading...</div>
			}
			if (article.$isError || article.$isNotFound || allAuthors.$isError) {
				return <div>Error</div>
			}

			const authorHandle = article.$hasOne('author')

			return (
				<div>
					<span data-testid="author-id">{article.author?.$id ?? 'null'}</span>
					<span data-testid="author-name">{article.author?.$entity.$fields.name.value ?? 'N/A'}</span>
					<select
						data-testid="author-select"
						value={article.author?.$id ?? ''}
						onChange={e => {
							if (e.target.value) {
								authorHandle.$connect(e.target.value)
							}
						}}
					>
						{allAuthors.items.map(author => (
							<option key={author.id} value={author.id}>
								{author.name.value}
							</option>
						))}
					</select>
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
		expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')

		// Change to author-2 via select
		act(() => {
			const select = getByTestId(container, 'author-select') as HTMLSelectElement
			select.value = 'author-2'
			select.dispatchEvent(new Event('change', { bubbles: true }))
		})

		// Should update to author-2
		expect(getByTestId(container, 'author-id').textContent).toBe('author-2')
		// Name should also update (this tests that connected entity data is available)
		expect(getByTestId(container, 'author-name').textContent).toBe('Jane Smith')
	})

	test('9b. Select with disconnect and reconnect - full cycle', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().author(a => a.id().name().email()),
			)

			const allAuthors = useEntityList(entityDefs.Author, {}, a => a.id().name().email())

			if (article.$isLoading || allAuthors.$isLoading) {
				return <div data-testid="loading">Loading...</div>
			}
			if (article.$isError || article.$isNotFound || allAuthors.$isError) {
				return <div>Error</div>
			}

			const authorHandle = article.$hasOne('author')
			const author = article.author
			const currentAuthorId = author?.$id
			const isConnected = currentAuthorId !== undefined && isPersistedId(currentAuthorId)

			return (
				<div>
					<select
						data-testid="author-select"
						value={isConnected ? currentAuthorId : ''}
						onChange={e => {
							if (e.target.value === '') {
								authorHandle.$disconnect()
							} else {
								authorHandle.$connect(e.target.value)
							}
						}}
					>
						<option value="">No author</option>
						{allAuthors.items.map(author => (
							<option key={author.id} value={author.id}>
								{author.name.value}
							</option>
						))}
					</select>
					<span data-testid="author-id">{currentAuthorId ?? 'null'}</span>
					<span data-testid="author-name">
						{isConnected ? author?.$entity.$fields.name.value : 'N/A'}
					</span>
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

		// Initial state: author-1
		expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
		expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')

		// Change to author-2
		act(() => {
			const select = getByTestId(container, 'author-select') as HTMLSelectElement
			select.value = 'author-2'
			select.dispatchEvent(new Event('change', { bubbles: true }))
		})
		expect(getByTestId(container, 'author-id').textContent).toBe('author-2')
		expect(getByTestId(container, 'author-name').textContent).toBe('Jane Smith')

		// Disconnect (select "No author")
		act(() => {
			const select = getByTestId(container, 'author-select') as HTMLSelectElement
			select.value = ''
			select.dispatchEvent(new Event('change', { bubbles: true }))
		})
		// Nullable has-one returns null when disconnected
		expect(getByTestId(container, 'author-id').textContent).toBe('null')
		expect(getByTestId(container, 'author-name').textContent).toBe('N/A')

		// Reconnect to author-1
		act(() => {
			const select = getByTestId(container, 'author-select') as HTMLSelectElement
			select.value = 'author-1'
			select.dispatchEvent(new Event('change', { bubbles: true }))
		})
		expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
		expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
	})
})
