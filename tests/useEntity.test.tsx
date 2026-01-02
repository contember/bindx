import './setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	useEntity,
	isLoading,
	MockAdapter,
	defineFragment,
	type ModelProxy,
} from '../src/index.js'

afterEach(() => {
	cleanup()
})

// Helper to query by data-testid
function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

// Test types
interface Author {
	id: string
	name: string
	email: string
}

interface Tag {
	id: string
	name: string
}

interface Article {
	id: string
	title: string
	content: string
	author: Author
	tags: Tag[]
}

// Test data factory
function createMockData() {
	return {
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'Hello World',
				content: 'This is the content',
				author: {
					id: 'author-1',
					name: 'John Doe',
					email: 'john@example.com',
				},
				tags: [
					{ id: 'tag-1', name: 'JavaScript' },
					{ id: 'tag-2', name: 'React' },
				],
			},
		},
		Author: {
			'author-1': {
				id: 'author-1',
				name: 'John Doe',
				email: 'john@example.com',
			},
		},
	}
}

describe('useEntity hook', () => {
	describe('loading state', () => {
		test('should show loading state initially', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 50 })

			function TestComponent() {
				const article = useEntity<Article, { title: string }>('Article', { id: 'article-1' }, e => ({
					title: e.title,
				}))

				if (isLoading(article)) {
					return <div data-testid="loading">Loading...</div>
				}

				return <div data-testid="title">{article.fields.title.value}</div>
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
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
			let accessor: ReturnType<typeof useEntity<Article, { title: string }>> | null = null

			function TestComponent() {
				accessor = useEntity<Article, { title: string }>('Article', { id: 'article-1' }, e => ({
					title: e.title,
				}))
				return null
			}

			render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			expect(accessor).not.toBeNull()
			expect(isLoading(accessor!)).toBe(true)
		})
	})

	describe('data rendering', () => {
		test('should render scalar fields correctly', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity<Article, { title: string; content: string }>(
					'Article',
					{ id: 'article-1' },
					e => ({
						title: e.title,
						content: e.content,
					}),
				)

				if (isLoading(article)) {
					return <div>Loading...</div>
				}

				return (
					<div>
						<h1 data-testid="title">{article.fields.title.value}</h1>
						<p data-testid="content">{article.fields.content.value}</p>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'title')).not.toBeNull()
			})

			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
			expect(getByTestId(container, 'content').textContent).toBe('This is the content')
		})

		test('should render nested entity (has-one relation)', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity<Article, { title: string; author: { name: string; email: string } }>(
					'Article',
					{ id: 'article-1' },
					e => ({
						title: e.title,
						author: {
							name: e.author.name,
							email: e.author.email,
						},
					}),
				)

				if (isLoading(article)) {
					return <div>Loading...</div>
				}

				return (
					<div>
						<h1 data-testid="title">{article.fields.title.value}</h1>
						<p data-testid="author-name">{article.fields.author.fields.name.value}</p>
						<p data-testid="author-email">{article.fields.author.fields.email.value}</p>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'title')).not.toBeNull()
			})

			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
			expect(getByTestId(container, 'author-email').textContent).toBe('john@example.com')
		})

		test('should render array of entities (has-many relation)', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity<Article, { title: string; tags: { name: string }[] }>(
					'Article',
					{ id: 'article-1' },
					e => ({
						title: e.title,
						tags: e.tags.map(t => ({ name: t.name })),
					}),
				)

				if (isLoading(article)) {
					return <div>Loading...</div>
				}

				return (
					<div>
						<h1 data-testid="title">{article.fields.title.value}</h1>
						<ul data-testid="tags">
							{article.fields.tags.items.map(item => (
								<li key={item.key} data-testid={`tag-${item.key}`}>
									{item.fields.name.value}
								</li>
							))}
						</ul>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'title')).not.toBeNull()
			})

			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
			const tags = getByTestId(container, 'tags')
			expect(tags.children.length).toBe(2)
		})

		test('data snapshot should reflect current values', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity<Article, { title: string; content: string }>(
					'Article',
					{ id: 'article-1' },
					e => ({
						title: e.title,
						content: e.content,
					}),
				)

				if (isLoading(article)) {
					return <div>Loading...</div>
				}

				return <div data-testid="data">{JSON.stringify(article.data)}</div>
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'data')).not.toBeNull()
			})

			const data = JSON.parse(getByTestId(container, 'data').textContent!)
			expect(data.title).toBe('Hello World')
			expect(data.content).toBe('This is the content')
		})
	})

	describe('optimistic updates', () => {
		test('should update value optimistically on setValue', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity<Article, { title: string }>('Article', { id: 'article-1' }, e => ({
					title: e.title,
				}))

				if (isLoading(article)) {
					return <div>Loading...</div>
				}

				return (
					<div>
						<span data-testid="title">{article.fields.title.value}</span>
						<button
							data-testid="update-btn"
							onClick={() => article.fields.title.setValue('Updated Title')}
						>
							Update
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
				expect(queryByTestId(container, 'title')).not.toBeNull()
			})

			expect(getByTestId(container, 'title').textContent).toBe('Hello World')

			// Click update button
			act(() => {
				;(getByTestId(container, 'update-btn') as HTMLButtonElement).click()
			})

			// Value should be updated immediately (optimistically)
			expect(getByTestId(container, 'title').textContent).toBe('Updated Title')
		})

		test('should update nested entity value optimistically', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity<Article, { author: { name: string } }>(
					'Article',
					{ id: 'article-1' },
					e => ({
						author: {
							name: e.author.name,
						},
					}),
				)

				if (isLoading(article)) {
					return <div>Loading...</div>
				}

				return (
					<div>
						<span data-testid="author-name">{article.fields.author.fields.name.value}</span>
						<button
							data-testid="update-btn"
							onClick={() => article.fields.author.fields.name.setValue('Jane Doe')}
						>
							Update
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

			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')

			act(() => {
				;(getByTestId(container, 'update-btn') as HTMLButtonElement).click()
			})

			expect(getByTestId(container, 'author-name').textContent).toBe('Jane Doe')
		})
	})

	describe('dirty state tracking', () => {
		test('isDirty should be false initially', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity<Article, { title: string }>('Article', { id: 'article-1' }, e => ({
					title: e.title,
				}))

				if (isLoading(article)) {
					return <div>Loading...</div>
				}

				return <div data-testid="dirty">{article.isDirty ? 'dirty' : 'clean'}</div>
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
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
				const article = useEntity<Article, { title: string }>('Article', { id: 'article-1' }, e => ({
					title: e.title,
				}))

				if (isLoading(article)) {
					return <div>Loading...</div>
				}

				return (
					<div>
						<span data-testid="dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="update-btn"
							onClick={() => article.fields.title.setValue('New Title')}
						>
							Update
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
				const article = useEntity<Article, { title: string }>('Article', { id: 'article-1' }, e => ({
					title: e.title,
				}))

				if (isLoading(article)) {
					return <div>Loading...</div>
				}

				return (
					<div>
						<span data-testid="dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="update-btn"
							onClick={() => article.fields.title.setValue('New Title')}
						>
							Update
						</button>
						<button
							data-testid="revert-btn"
							onClick={() => article.fields.title.setValue('Hello World')}
						>
							Revert
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
				const article = useEntity<Article, { title: string }>('Article', { id: 'article-1' }, e => ({
					title: e.title,
				}))

				if (isLoading(article)) {
					return <div>Loading...</div>
				}

				return (
					<div>
						<span data-testid="value">{article.fields.title.value}</span>
						<span data-testid="server-value">{article.fields.title.serverValue}</span>
						<button
							data-testid="update-btn"
							onClick={() => article.fields.title.setValue('New Title')}
						>
							Update
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
				expect(queryByTestId(container, 'value')).not.toBeNull()
			})

			act(() => {
				;(getByTestId(container, 'update-btn') as HTMLButtonElement).click()
			})

			expect(getByTestId(container, 'value').textContent).toBe('New Title')
			expect(getByTestId(container, 'server-value').textContent).toBe('Hello World')
		})
	})

	describe('reset functionality', () => {
		test('reset should revert value to serverValue', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity<Article, { title: string }>('Article', { id: 'article-1' }, e => ({
					title: e.title,
				}))

				if (isLoading(article)) {
					return <div>Loading...</div>
				}

				return (
					<div>
						<span data-testid="title">{article.fields.title.value}</span>
						<span data-testid="dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="update-btn"
							onClick={() => article.fields.title.setValue('New Title')}
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
				<BindxProvider adapter={adapter}>
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

	describe('persist functionality', () => {
		test('persist should call adapter and commit changes', async () => {
			const mockData = createMockData()
			const adapter = new MockAdapter(mockData, { delay: 0 })

			function TestComponent() {
				const article = useEntity<Article, { title: string }>('Article', { id: 'article-1' }, e => ({
					title: e.title,
				}))

				if (isLoading(article)) {
					return <div>Loading...</div>
				}

				return (
					<div>
						<span data-testid="title">{article.fields.title.value}</span>
						<span data-testid="server-value">{article.fields.title.serverValue}</span>
						<span data-testid="dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="update-btn"
							onClick={() => article.fields.title.setValue('Persisted Title')}
						>
							Update
						</button>
						<button data-testid="persist-btn" onClick={() => article.persist()}>
							Persist
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
				expect(queryByTestId(container, 'title')).not.toBeNull()
			})

			// Update value
			act(() => {
				;(getByTestId(container, 'update-btn') as HTMLButtonElement).click()
			})

			expect(getByTestId(container, 'dirty').textContent).toBe('dirty')

			// Persist
			await act(async () => {
				;(getByTestId(container, 'persist-btn') as HTMLButtonElement).click()
				// Wait for persist to complete
				await new Promise(resolve => setTimeout(resolve, 50))
			})

			// After persist, serverValue should be updated and isDirty should be false
			expect(getByTestId(container, 'title').textContent).toBe('Persisted Title')
			expect(getByTestId(container, 'server-value').textContent).toBe('Persisted Title')
			expect(getByTestId(container, 'dirty').textContent).toBe('clean')

			// Verify the store was actually updated
			expect(mockData.Article['article-1']!.title).toBe('Persisted Title')
		})

		test('isPersisting should be true during persist', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 100 })

			function TestComponent() {
				const article = useEntity<Article, { title: string }>('Article', { id: 'article-1' }, e => ({
					title: e.title,
				}))

				if (isLoading(article)) {
					return <div>Loading...</div>
				}

				return (
					<div>
						<span data-testid="persisting">{article.isPersisting ? 'persisting' : 'idle'}</span>
						<button
							data-testid="update-btn"
							onClick={() => article.fields.title.setValue('New Title')}
						>
							Update
						</button>
						<button data-testid="persist-btn" onClick={() => article.persist()}>
							Persist
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
				expect(queryByTestId(container, 'persisting')).not.toBeNull()
			})

			act(() => {
				;(getByTestId(container, 'update-btn') as HTMLButtonElement).click()
			})

			// Start persist (don't await)
			act(() => {
				;(getByTestId(container, 'persist-btn') as HTMLButtonElement).click()
			})

			// Should show persisting state
			expect(getByTestId(container, 'persisting').textContent).toBe('persisting')

			// Wait for persist to complete
			await waitFor(() => {
				expect(getByTestId(container, 'persisting').textContent).toBe('idle')
			})
		})
	})

	describe('fragment composition', () => {
		test('should work with pre-defined fragments', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const AuthorFragment = defineFragment((author: ModelProxy<Author>) => ({
				id: author.id,
				name: author.name,
			}))

			function TestComponent() {
				const article = useEntity<Article, { title: string; author: { id: string; name: string } }>(
					'Article',
					{ id: 'article-1' },
					e => ({
						title: e.title,
						author: AuthorFragment.compose(e.author),
					}),
				)

				if (isLoading(article)) {
					return <div>Loading...</div>
				}

				return (
					<div>
						<h1 data-testid="title">{article.fields.title.value}</h1>
						<p data-testid="author-name">{article.fields.author.fields.name.value}</p>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'title')).not.toBeNull()
			})

			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		})

		test('should work with child components receiving field accessors', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const AuthorFragment = defineFragment((author: ModelProxy<Author>) => ({
				id: author.id,
				name: author.name,
				email: author.email,
			}))

			// Simulates TextInput from example/components.tsx
			function TextInput({ field, label }: { field: { value: string | null; setValue: (v: string) => void }; label: string }) {
				return (
					<div>
						<label>{label}</label>
						<input
							data-testid={`input-${label}`}
							type="text"
							value={field.value ?? ''}
							onChange={e => field.setValue(e.target.value)}
						/>
					</div>
				)
			}

			// Simulates AuthorEditor from example/components.tsx
			function AuthorEditor({ author }: { author: { fields: { name: { value: string | null; setValue: (v: string) => void }; email: { value: string | null; setValue: (v: string) => void } } } }) {
				return (
					<div data-testid="author-editor">
						<TextInput field={author.fields.name} label="Name" />
						<TextInput field={author.fields.email} label="Email" />
					</div>
				)
			}

			function TestComponent() {
				const article = useEntity(
					'Article',
					{ id: 'article-1' },
					(e: ModelProxy<Article>) => ({
						title: e.title,
						author: AuthorFragment.compose(e.author),
					}),
				)

				if (isLoading(article)) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<TextInput field={article.fields.title} label="Title" />
						<AuthorEditor author={article.fields.author} />
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'author-editor')).not.toBeNull()
			})

			const titleInput = getByTestId(container, 'input-Title') as HTMLInputElement
			const nameInput = getByTestId(container, 'input-Name') as HTMLInputElement
			const emailInput = getByTestId(container, 'input-Email') as HTMLInputElement

			expect(titleInput.value).toBe('Hello World')
			expect(nameInput.value).toBe('John Doe')
			expect(emailInput.value).toBe('john@example.com')
		})
	})
})
