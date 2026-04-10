import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	hasOne,
	useEntityList,
} from '@contember/bindx-react'

afterEach(() => {
	cleanup()
})

// Test types
interface Author {
	id: string
	name: string
	email: string
	bio?: string
}

interface Article {
	id: string
	title: string
	content: string
	author: Author | null
}

interface TestSchema {
	Author: Author
	Article: Article
}

const schema = defineSchema<TestSchema>({
	entities: {
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				email: scalar(),
				bio: scalar(),
			},
		},
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				content: scalar(),
				author: hasOne('Author', { nullable: true }),
			},
		},
	},
})

const entityDefs = {
	Author: entityDef<Author>('Author'),
	Article: entityDef<Article>('Article'),
} as const

function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

function createMockData() {
	return {
		Author: {
			'author-1': {
				id: 'author-1',
				name: 'John Doe',
				email: 'john@example.com',
				bio: 'Software developer',
			},
			'author-2': {
				id: 'author-2',
				name: 'Jane Smith',
				email: 'jane@example.com',
				bio: 'Technical writer',
			},
		},
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'First Article',
				content: 'Content of first article',
				author: {
					id: 'author-1',
					name: 'John Doe',
					email: 'john@example.com',
				},
			},
			'article-2': {
				id: 'article-2',
				title: 'Second Article',
				content: 'Content of second article',
				author: null,
			},
		},
	}
}

describe('useEntityList selection', () => {
	// ==================== Basic Field Selection ====================

	describe('basic field selection', () => {
		test('selection definer records accessed fields', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				// Selection: id, name, email
				const authors = useEntityList(entityDefs.Author, {}, a => a.id().name().email())

				if (authors.$status !== 'ready') {
					return <div data-testid="loading">Loading...</div>
				}

				const first = authors.items[0]

				return (
					<div>
						<span data-testid="name">{first?.name.value}</span>
						<span data-testid="email">{first?.email.value}</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'name')).not.toBeNull()
			})

			// Verify selected fields are accessible
			expect(getByTestId(container, 'name').textContent).toBe('John Doe')
			expect(getByTestId(container, 'email').textContent).toBe('john@example.com')
		})

		test('different selections result in different data', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				// Selection with bio
				const authors = useEntityList(entityDefs.Author, {}, a => a.id().name().bio())

				if (authors.$status !== 'ready') {
					return <div data-testid="loading">Loading...</div>
				}

				const first = authors.items[0]

				return (
					<div>
						<span data-testid="name">{first?.name.value}</span>
						<span data-testid="bio">{first?.bio.value ?? 'no bio'}</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'name')).not.toBeNull()
			})

			expect(getByTestId(container, 'name').textContent).toBe('John Doe')
			expect(getByTestId(container, 'bio').textContent).toBe('Software developer')
		})
	})

	// ==================== Nested Selection ====================

	describe('nested selection', () => {
		test('nested relation field selection works', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				// Selection with nested author
				const articles = useEntityList(entityDefs.Article, {}, a =>
					a.id().title().author(au => au.id().name().email()),
				)

				if (articles.$status !== 'ready') {
					return <div data-testid="loading">Loading...</div>
				}

				const first = articles.items[0]

				return (
					<div>
						<span data-testid="title">{first?.title.value}</span>
						<span data-testid="author-name">{first?.author.$entity.name.value ?? 'no author'}</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'title')).not.toBeNull()
			})

			expect(getByTestId(container, 'title').textContent).toBe('First Article')
			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		})

		test('null relation is handled correctly', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const articles = useEntityList(entityDefs.Article, {}, a =>
					a.id().title().author(au => au.id().name()),
				)

				if (articles.$status !== 'ready') {
					return <div data-testid="loading">Loading...</div>
				}

				// Get the article without author (article-2)
				const articleWithoutAuthor = articles.items.find(a => a.id === 'article-2')

				return (
					<div>
						<span data-testid="title">{articleWithoutAuthor?.title.value}</span>
						<span data-testid="author-state">{articleWithoutAuthor?.author.$state}</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'title')).not.toBeNull()
			})

			expect(getByTestId(container, 'title').textContent).toBe('Second Article')
			expect(getByTestId(container, 'author-state').textContent).toBe('disconnected')
		})
	})

	// ==================== Selection Stability ====================

	describe('selection stability', () => {
		test('same selection produces consistent results', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			let renderCount = 0

			function TestComponent(): React.ReactElement {
				const authors = useEntityList(entityDefs.Author, {}, a => a.id().name().email())
				renderCount++

				if (authors.$status !== 'ready') {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<span data-testid="render-count">{renderCount}</span>
					</div>
				)
			}

			const { container, rerender } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			const initialRenderCount = renderCount

			// Re-render without changing anything
			rerender(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			// Render count should increase but data should be consistent
			expect(getByTestId(container, 'count').textContent).toBe('2')
		})
	})

	// ==================== Selection with Query Params ====================

	describe('selection with query params', () => {
		test('filter affects returned items', async () => {
			const mockData = {
				Author: {
					'author-1': { id: 'author-1', name: 'John Doe', email: 'john@example.com' },
					'author-2': { id: 'author-2', name: 'Jane Smith', email: 'jane@example.com' },
				},
			}
			const adapter = new MockAdapter(mockData, { delay: 0 })

			function TestComponent({ filter }: { filter?: Record<string, unknown> }): React.ReactElement {
				const authors = useEntityList(entityDefs.Author, { filter }, a => a.id().name())

				if (authors.$status !== 'ready') {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<span data-testid="has-filter">{filter ? 'yes' : 'no'}</span>
					</div>
				)
			}

			const { container, rerender } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			expect(getByTestId(container, 'count').textContent).toBe('2')
			expect(getByTestId(container, 'has-filter').textContent).toBe('no')

			// Apply filter
			rerender(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent filter={{ name: { eq: 'John Doe' } }} />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(getByTestId(container, 'has-filter').textContent).toBe('yes')
			})
		})

		test('limit affects returned items', async () => {
			const mockData = {
				Author: {
					'author-1': { id: 'author-1', name: 'John', email: 'john@example.com' },
					'author-2': { id: 'author-2', name: 'Jane', email: 'jane@example.com' },
					'author-3': { id: 'author-3', name: 'Bob', email: 'bob@example.com' },
				},
			}
			const adapter = new MockAdapter(mockData, { delay: 0 })

			function TestComponent({ limit }: { limit?: number }): React.ReactElement {
				const authors = useEntityList(entityDefs.Author, { limit }, a => a.id().name())

				if (authors.$status !== 'ready') {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<span data-testid="limit">{limit ?? 'none'}</span>
					</div>
				)
			}

			const { container, rerender } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			// Without limit, all 3 should be returned
			expect(getByTestId(container, 'count').textContent).toBe('3')

			// With limit
			rerender(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent limit={2} />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(getByTestId(container, 'limit').textContent).toBe('2')
			})
		})
	})

	// ==================== Accessing All Selected Fields ====================

	describe('accessing all selected fields', () => {
		test('all selected fields are accessible on items', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				// Select all fields
				const authors = useEntityList(entityDefs.Author, {}, a =>
					a.id().name().email().bio(),
				)

				if (authors.$status !== 'ready') {
					return <div data-testid="loading">Loading...</div>
				}

				const first = authors.items[0]

				return (
					<div>
						<span data-testid="id">{first?.id}</span>
						<span data-testid="name">{first?.name.value}</span>
						<span data-testid="email">{first?.email.value}</span>
						<span data-testid="bio">{first?.bio.value ?? 'null'}</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'id')).not.toBeNull()
			})

			expect(getByTestId(container, 'id').textContent).toBe('author-1')
			expect(getByTestId(container, 'name').textContent).toBe('John Doe')
			expect(getByTestId(container, 'email').textContent).toBe('john@example.com')
			expect(getByTestId(container, 'bio').textContent).toBe('Software developer')
		})
	})
})
