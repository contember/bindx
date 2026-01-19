import '../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	createBindx,
	MockAdapter,
	defineSchema,
	scalar,
	hasOne,
	isPlaceholderId,
	isPersistedId,
} from '@contember/bindx-react'

afterEach(() => {
	cleanup()
})

// Test types
interface Author {
	id: string
	name: string
	email: string
}

interface Article {
	id: string
	title: string
	author: Author | null
}

interface TestSchema {
	Article: Article
	Author: Author
}

const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				author: hasOne('Author'),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				email: scalar(),
			},
		},
	},
})

const { useEntity } = createBindx(schema)

// Helper functions
function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

// Test data factory
function createMockData() {
	return {
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'Test Article',
				author: {
					id: 'author-1',
					name: 'John Doe',
					email: 'john@example.com',
				},
			},
			'article-no-author': {
				id: 'article-no-author',
				title: 'No Author Article',
				author: null,
			},
		},
		Author: {
			'author-1': {
				id: 'author-1',
				name: 'John Doe',
				email: 'john@example.com',
			},
			'author-2': {
				id: 'author-2',
				name: 'Jane Smith',
				email: 'jane@example.com',
			},
		},
	}
}

describe('HasOne Relations', () => {
	describe('Basic Operations', () => {
		test('1. Connect to existing entity - entity should change, isDirty=true', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name().email()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
						<span data-testid="author-name">{article.author.$entity.$fields.name.value ?? 'N/A'}</span>
						<span data-testid="is-dirty">{article.author.$isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="connect-author-2"
							onClick={() => article.author.$connect('author-2')}
						>
							Connect author-2
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
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

		test('2. Disconnect - entity should become null/placeholder, isDirty=true', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
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

		test('3. Connect + Disconnect - entity should be null', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
						<button
							data-testid="connect-author-2"
							onClick={() => article.author.$connect('author-2')}
						>
							Connect
						</button>
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
				<BindxProvider adapter={adapter}>
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

			expect(isPlaceholderId(getByTestId(container, 'author-id').textContent!)).toBe(true)
		})

		test('4. Disconnect + Connect different - new entity should be connected', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
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
							Connect author-2
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
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

			expect(isPlaceholderId(getByTestId(container, 'author-id').textContent!)).toBe(true)

			// Connect to author-2
			act(() => {
				;(getByTestId(container, 'connect-author-2') as HTMLButtonElement).click()
			})

			expect(getByTestId(container, 'author-id').textContent).toBe('author-2')
		})

		test('5. Connect + Connect different - last one wins', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
						<button
							data-testid="connect-author-1"
							onClick={() => article.author.$connect('author-1')}
						>
							Connect author-1
						</button>
						<button
							data-testid="connect-author-2"
							onClick={() => article.author.$connect('author-2')}
						>
							Connect author-2
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
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
	})

	describe('Reset Operations', () => {
		test('6. Reset after connect - should return to original entity', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
						<span data-testid="is-dirty">{article.author.$isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="connect-author-2"
							onClick={() => article.author.$connect('author-2')}
						>
							Connect
						</button>
						<button data-testid="reset" onClick={() => article.author.$reset()}>
							Reset
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
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
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
						<button data-testid="reset" onClick={() => article.author.$reset()}>
							Reset
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
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

			expect(isPlaceholderId(getByTestId(container, 'author-id').textContent!)).toBe(true)
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

	describe('Placeholder', () => {
		test('8. Placeholder fields - can write to placeholder fields when disconnected', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-no-author' } }, e =>
					e.id().title().author(a => a.id().name().email()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
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
	})

	describe('Connect via Select', () => {
		test('9. Connect to different entity via select - should update UI reactively', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { useEntityList } = createBindx(schema)

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name().email()),
				)

				// Load all authors (like a real app would do for a select dropdown)
				const allAuthors = useEntityList('Author', {}, a => a.id().name().email())

				if (article.isLoading || allAuthors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || allAuthors.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
						<span data-testid="author-name">{article.author.$entity.$fields.name.value ?? 'N/A'}</span>
						<select
							data-testid="author-select"
							value={article.author.$id ?? ''}
							onChange={e => {
								if (e.target.value) {
									article.author.$connect(e.target.value)
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
				<BindxProvider adapter={adapter}>
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

			const { useEntityList } = createBindx(schema)

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name().email()),
				)

				const allAuthors = useEntityList('Author', {}, a => a.id().name().email())

				if (article.isLoading || allAuthors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || allAuthors.isError) {
					return <div>Error</div>
				}

				// Pattern from ArticleWithAuthorSelectExample
				const currentAuthorId = article.author.$id
				const isConnected = isPersistedId(currentAuthorId)
				const authorEntity = article.author.$entity

				return (
					<div>
						<select
							data-testid="author-select"
							value={isConnected ? currentAuthorId : ''}
							onChange={e => {
								if (e.target.value === '') {
									article.author.$disconnect()
								} else {
									article.author.$connect(e.target.value)
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
						<span data-testid="author-id">{currentAuthorId}</span>
						<span data-testid="author-name">
							{isConnected ? authorEntity.$fields.name.value : 'N/A'}
						</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
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
			expect(isPlaceholderId(getByTestId(container, 'author-id').textContent!)).toBe(true)
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

	describe('Nested Entity Reactivity', () => {
		test('10. setValue on nested entity field - UI should update reactively', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name().email()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
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

		test('10. Multiple setValue on nested entity fields - all should update reactively', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name().email()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
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

	describe('Dirty State Tracking', () => {
		test('12. Connect should mark relation as dirty', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { useEntityList } = createBindx(schema)

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name()),
				)
				const allAuthors = useEntityList('Author', {}, a => a.id().name())

				if (article.isLoading || allAuthors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || allAuthors.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
						<span data-testid="relation-dirty">{article.author.$isDirty ? 'dirty' : 'clean'}</span>
						<span data-testid="entity-dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="connect-author-2"
							onClick={() => article.author.$connect('author-2')}
						>
							Connect Author 2
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'author-id')).not.toBeNull()
			})

			// Initially clean
			expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
			expect(getByTestId(container, 'relation-dirty').textContent).toBe('clean')
			expect(getByTestId(container, 'entity-dirty').textContent).toBe('clean')

			// Connect to different author
			act(() => {
				;(getByTestId(container, 'connect-author-2') as HTMLButtonElement).click()
			})

			// Should be dirty
			expect(getByTestId(container, 'author-id').textContent).toBe('author-2')
			expect(getByTestId(container, 'relation-dirty').textContent).toBe('dirty')
			expect(getByTestId(container, 'entity-dirty').textContent).toBe('dirty')
		})

		test('13. Disconnect should mark relation as dirty', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
						<span data-testid="relation-dirty">{article.author.$isDirty ? 'dirty' : 'clean'}</span>
						<span data-testid="entity-dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'author-id')).not.toBeNull()
			})

			// Initially clean
			expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
			expect(getByTestId(container, 'relation-dirty').textContent).toBe('clean')
			expect(getByTestId(container, 'entity-dirty').textContent).toBe('clean')

			// Disconnect
			act(() => {
				;(getByTestId(container, 'disconnect') as HTMLButtonElement).click()
			})

			// Should be dirty
			expect(isPlaceholderId(getByTestId(container, 'author-id').textContent!)).toBe(true)
			expect(getByTestId(container, 'relation-dirty').textContent).toBe('dirty')
			expect(getByTestId(container, 'entity-dirty').textContent).toBe('dirty')
		})

		test('14. Connect back to original should clear dirty state', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { useEntityList } = createBindx(schema)

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name()),
				)
				const allAuthors = useEntityList('Author', {}, a => a.id().name())

				if (article.isLoading || allAuthors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || allAuthors.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
						<span data-testid="relation-dirty">{article.author.$isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="connect-author-2"
							onClick={() => article.author.$connect('author-2')}
						>
							Connect Author 2
						</button>
						<button
							data-testid="connect-author-1"
							onClick={() => article.author.$connect('author-1')}
						>
							Connect Author 1
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'author-id')).not.toBeNull()
			})

			// Initially clean
			expect(getByTestId(container, 'relation-dirty').textContent).toBe('clean')

			// Connect to different author - should be dirty
			act(() => {
				;(getByTestId(container, 'connect-author-2') as HTMLButtonElement).click()
			})
			expect(getByTestId(container, 'relation-dirty').textContent).toBe('dirty')

			// Connect back to original - should be clean again
			act(() => {
				;(getByTestId(container, 'connect-author-1') as HTMLButtonElement).click()
			})
			expect(getByTestId(container, 'relation-dirty').textContent).toBe('clean')
		})

		test('15. Reset should clear dirty state', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { useEntityList } = createBindx(schema)

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name()),
				)
				const allAuthors = useEntityList('Author', {}, a => a.id().name())

				if (article.isLoading || allAuthors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || allAuthors.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
						<span data-testid="relation-dirty">{article.author.$isDirty ? 'dirty' : 'clean'}</span>
						<span data-testid="entity-dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="connect-author-2"
							onClick={() => article.author.$connect('author-2')}
						>
							Connect Author 2
						</button>
						<button
							data-testid="reset"
							onClick={() => article.reset()}
						>
							Reset
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'author-id')).not.toBeNull()
			})

			// Initially author-1, clean
			expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
			expect(getByTestId(container, 'relation-dirty').textContent).toBe('clean')

			// Connect to author-2 - should be dirty
			act(() => {
				;(getByTestId(container, 'connect-author-2') as HTMLButtonElement).click()
			})
			expect(getByTestId(container, 'author-id').textContent).toBe('author-2')
			expect(getByTestId(container, 'relation-dirty').textContent).toBe('dirty')

			// Reset - should go back to original and be clean
			act(() => {
				;(getByTestId(container, 'reset') as HTMLButtonElement).click()
			})
			expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
			expect(getByTestId(container, 'relation-dirty').textContent).toBe('clean')
			expect(getByTestId(container, 'entity-dirty').textContent).toBe('clean')
		})

		test('16. Disconnect then reconnect to original should clear dirty state', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { useEntityList } = createBindx(schema)

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name()),
				)
				const allAuthors = useEntityList('Author', {}, a => a.id().name())

				if (article.isLoading || allAuthors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || allAuthors.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
						<span data-testid="relation-dirty">{article.author.$isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="disconnect"
							onClick={() => article.author.$disconnect()}
						>
							Disconnect
						</button>
						<button
							data-testid="connect-author-1"
							onClick={() => article.author.$connect('author-1')}
						>
							Connect Author 1
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'author-id')).not.toBeNull()
			})

			// Initially author-1, clean
			expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
			expect(getByTestId(container, 'relation-dirty').textContent).toBe('clean')

			// Disconnect - should be dirty
			act(() => {
				;(getByTestId(container, 'disconnect') as HTMLButtonElement).click()
			})
			expect(isPlaceholderId(getByTestId(container, 'author-id').textContent!)).toBe(true)
			expect(getByTestId(container, 'relation-dirty').textContent).toBe('dirty')

			// Connect back to original - should be clean
			act(() => {
				;(getByTestId(container, 'connect-author-1') as HTMLButtonElement).click()
			})
			expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
			expect(getByTestId(container, 'relation-dirty').textContent).toBe('clean')
		})

		test('17. Entity isDirty should reflect hasOne relation changes', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { useEntityList } = createBindx(schema)

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name()),
				)
				const allAuthors = useEntityList('Author', {}, a => a.id().name())

				if (article.isLoading || allAuthors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || allAuthors.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<span data-testid="entity-dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="connect-author-2"
							onClick={() => article.author.$connect('author-2')}
						>
							Connect Author 2
						</button>
						<button
							data-testid="connect-author-1"
							onClick={() => article.author.$connect('author-1')}
						>
							Connect Author 1
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'entity-dirty')).not.toBeNull()
			})

			// Initially clean
			expect(getByTestId(container, 'entity-dirty').textContent).toBe('clean')

			// Connect to different author - entity should be dirty
			act(() => {
				;(getByTestId(container, 'connect-author-2') as HTMLButtonElement).click()
			})
			expect(getByTestId(container, 'entity-dirty').textContent).toBe('dirty')

			// Connect back to original - entity should be clean
			act(() => {
				;(getByTestId(container, 'connect-author-1') as HTMLButtonElement).click()
			})
			expect(getByTestId(container, 'entity-dirty').textContent).toBe('clean')
		})
	})

	describe('Persistence', () => {
		test('18. Persist should save hasOne connect to MockAdapter', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { useEntityList } = createBindx(schema)

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name().email()),
				)
				const allAuthors = useEntityList('Author', {}, a => a.id().name().email())

				if (article.isLoading || allAuthors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || allAuthors.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
						<span data-testid="is-dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
						<span data-testid="is-persisting">{article.isPersisting ? 'persisting' : 'idle'}</span>
						<button
							data-testid="connect-author-2"
							onClick={() => article.author.$connect('author-2')}
						>
							Connect Author 2
						</button>
						<button data-testid="persist" onClick={() => article.persist()}>
							Persist
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

			// Initial state
			expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')

			// Connect to different author
			act(() => {
				;(getByTestId(container, 'connect-author-2') as HTMLButtonElement).click()
			})
			expect(getByTestId(container, 'author-id').textContent).toBe('author-2')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')

			// Persist changes
			await act(async () => {
				;(getByTestId(container, 'persist') as HTMLButtonElement).click()
			})

			// After persist - should be clean
			await waitFor(() => {
				expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
			})

			// Verify MockAdapter store was updated
			const store = adapter.getStore()
			expect(store['Article']?.['article-1']?.['author']).toMatchObject({ id: 'author-2' })
		})

		test('19. Persist should save hasOne disconnect to MockAdapter', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().author(a => a.id().name().email()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
						<span data-testid="is-dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
						<button data-testid="disconnect" onClick={() => article.author.$disconnect()}>
							Disconnect
						</button>
						<button data-testid="persist" onClick={() => article.persist()}>
							Persist
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

			// Initial state - has author
			expect(getByTestId(container, 'author-id').textContent).toBe('author-1')

			// Disconnect author
			act(() => {
				;(getByTestId(container, 'disconnect') as HTMLButtonElement).click()
			})
			expect(isPlaceholderId(getByTestId(container, 'author-id').textContent!)).toBe(true)
			expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')

			// Persist changes
			await act(async () => {
				;(getByTestId(container, 'persist') as HTMLButtonElement).click()
			})

			// After persist - should be clean
			await waitFor(() => {
				expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
			})

			// Verify MockAdapter store was updated - author should be null
			const store = adapter.getStore()
			expect(store['Article']?.['article-1']?.['author']).toBeNull()
		})
	})
})
