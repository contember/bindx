import '../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, act, cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	createBindx,
	MockAdapter,
	defineSchema,
	scalar,
	hasMany,
} from '@contember/bindx-react'
import { Repeater, arrayMove } from '@contember/bindx-repeater'

afterEach(() => {
	cleanup()
})

// Test types
interface Article {
	id: string
	title: string
	order: number
}

interface Author {
	id: string
	name: string
	articles: Article[]
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
				articles: hasMany('Article'),
			},
		},
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				order: scalar(),
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
		Author: {
			'author-1': {
				id: 'author-1',
				name: 'John Doe',
				articles: [
					{ id: 'article-1', title: 'First Article', order: 0 },
					{ id: 'article-2', title: 'Second Article', order: 1 },
					{ id: 'article-3', title: 'Third Article', order: 2 },
				],
			},
			'author-empty': {
				id: 'author-empty',
				name: 'Jane Empty',
				articles: [],
			},
		},
		Article: {
			'article-1': { id: 'article-1', title: 'First Article', order: 0 },
			'article-2': { id: 'article-2', title: 'Second Article', order: 1 },
			'article-3': { id: 'article-3', title: 'Third Article', order: 2 },
		},
	}
}

describe('Repeater Component', () => {
	describe('Basic Rendering', () => {
		test('renders items using callback API', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const author = useEntity('Author', { by: { id: 'author-1' } }, e =>
					e.id().name().articles(a => a.id().title().order()),
				)

				if (author.isLoading) return <div data-testid="loading">Loading</div>
				if (author.isError) return <div>Error</div>

				return (
					<Repeater field={author.articles}>
						{(items) => (
							<>
								{items.map((article, { index, isFirst, isLast }) => (
									<div key={article.id} data-testid={`item-${article.id}`}>
										<span data-testid={`title-${article.id}`}>{article.title.value}</span>
										<span data-testid={`index-${article.id}`}>{index}</span>
										<span data-testid={`first-${article.id}`}>{isFirst ? 'yes' : 'no'}</span>
										<span data-testid={`last-${article.id}`}>{isLast ? 'yes' : 'no'}</span>
									</div>
								))}
							</>
						)}
					</Repeater>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'item-article-1')).not.toBeNull()
			})

			// Check items are rendered
			expect(getByTestId(container, 'title-article-1').textContent).toBe('First Article')
			expect(getByTestId(container, 'title-article-2').textContent).toBe('Second Article')
			expect(getByTestId(container, 'title-article-3').textContent).toBe('Third Article')

			// Check index values
			expect(getByTestId(container, 'index-article-1').textContent).toBe('0')
			expect(getByTestId(container, 'index-article-2').textContent).toBe('1')
			expect(getByTestId(container, 'index-article-3').textContent).toBe('2')

			// Check isFirst/isLast
			expect(getByTestId(container, 'first-article-1').textContent).toBe('yes')
			expect(getByTestId(container, 'last-article-1').textContent).toBe('no')
			expect(getByTestId(container, 'first-article-2').textContent).toBe('no')
			expect(getByTestId(container, 'last-article-2').textContent).toBe('no')
			expect(getByTestId(container, 'first-article-3').textContent).toBe('no')
			expect(getByTestId(container, 'last-article-3').textContent).toBe('yes')
		})

		test('isEmpty shows content when list is empty', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const author = useEntity('Author', { by: { id: 'author-empty' } }, e =>
					e.id().articles(a => a.id().title()),
				)

				if (author.isLoading) return <div data-testid="loading">Loading</div>
				if (author.isError) return <div>Error</div>

				return (
					<Repeater field={author.articles}>
						{(items, { isEmpty }) => (
							<>
								{isEmpty && <div data-testid="empty-message">No articles</div>}
								{items.map((article) => (
									<div key={article.id} data-testid="item">Item</div>
								))}
							</>
						)}
					</Repeater>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'empty-message')).not.toBeNull()
			})

			expect(getByTestId(container, 'empty-message').textContent).toBe('No articles')
			expect(queryByTestId(container, 'item')).toBeNull()
		})

		test('shows content when list has items (not empty)', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const author = useEntity('Author', { by: { id: 'author-1' } }, e =>
					e.id().articles(a => a.id().title()),
				)

				if (author.isLoading) return <div data-testid="loading">Loading</div>
				if (author.isError) return <div>Error</div>

				return (
					<Repeater field={author.articles}>
						{(items, { isEmpty }) => (
							<>
								{!isEmpty && <div data-testid="not-empty">Has articles</div>}
								{isEmpty && <div data-testid="empty-message">No articles</div>}
							</>
						)}
					</Repeater>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'not-empty')).not.toBeNull()
			})

			expect(getByTestId(container, 'not-empty').textContent).toBe('Has articles')
			expect(queryByTestId(container, 'empty-message')).toBeNull()
		})
	})

	describe('Add/Remove Operations', () => {
		test('addItem adds item', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const author = useEntity('Author', { by: { id: 'author-1' } }, e =>
					e.id().articles(a => a.id().title()),
				)

				if (author.isLoading) return <div data-testid="loading">Loading</div>
				if (author.isError) return <div>Error</div>

				return (
					<Repeater field={author.articles}>
						{(items, { addItem }) => (
							<>
								<span data-testid="count">{items.length}</span>
								<button data-testid="add-btn" onClick={() => addItem()}>Add</button>
							</>
						)}
					</Repeater>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			expect(getByTestId(container, 'count').textContent).toBe('3')

			act(() => {
				;(getByTestId(container, 'add-btn') as HTMLButtonElement).click()
			})

			expect(getByTestId(container, 'count').textContent).toBe('4')
		})

		test('remove removes item', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const author = useEntity('Author', { by: { id: 'author-1' } }, e =>
					e.id().articles(a => a.id().title()),
				)

				if (author.isLoading) return <div data-testid="loading">Loading</div>
				if (author.isError) return <div>Error</div>

				return (
					<Repeater field={author.articles}>
						{(items) => (
							<>
								<span data-testid="count">{items.length}</span>
								{items.map((article, { remove }) => (
									<div key={article.id}>
										<span data-testid={`title-${article.id}`}>{article.title.value}</span>
										<button data-testid={`remove-${article.id}`} onClick={remove}>Remove</button>
									</div>
								))}
							</>
						)}
					</Repeater>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			expect(getByTestId(container, 'count').textContent).toBe('3')

			act(() => {
				;(getByTestId(container, 'remove-article-2') as HTMLButtonElement).click()
			})

			expect(getByTestId(container, 'count').textContent).toBe('2')
			expect(queryByTestId(container, 'title-article-2')).toBeNull()
		})

		test('addItem with preprocess', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const author = useEntity('Author', { by: { id: 'author-1' } }, e =>
					e.id().articles(a => a.id().title()),
				)

				if (author.isLoading) return <div data-testid="loading">Loading</div>
				if (author.isError) return <div>Error</div>

				return (
					<Repeater field={author.articles}>
						{(items, { addItem }) => (
							<>
								{items.map((article) => (
									<div key={article.id} data-testid={`title-${article.id}`}>{article.title.value}</div>
								))}
								<button
									data-testid="add-btn"
									onClick={() => addItem(undefined, (entity) => entity.$fields.title.setValue('Preprocessed Title'))}
								>
									Add
								</button>
							</>
						)}
					</Repeater>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'title-article-1')).not.toBeNull()
			})

			act(() => {
				;(getByTestId(container, 'add-btn') as HTMLButtonElement).click()
			})

			// Check that the new item has the preprocessed title
			// The new item will have a temp ID
			const items = container.querySelectorAll('[data-testid^="title-"]')
			const lastItem = items[items.length - 1]
			expect(lastItem?.textContent).toBe('Preprocessed Title')
		})
	})

	describe('sortableBy operations', () => {
		test('items are sorted by order field', async () => {
			const adapter = new MockAdapter({
				Author: {
					'author-1': {
						id: 'author-1',
						name: 'John Doe',
						articles: [
							{ id: 'article-3', title: 'Third', order: 2 },
							{ id: 'article-1', title: 'First', order: 0 },
							{ id: 'article-2', title: 'Second', order: 1 },
						],
					},
				},
				Article: {},
			}, { delay: 0 })

			function TestComponent() {
				const author = useEntity('Author', { by: { id: 'author-1' } }, e =>
					e.id().articles(a => a.id().title().order()),
				)

				if (author.isLoading) return <div data-testid="loading">Loading</div>
				if (author.isError) return <div>Error</div>

				return (
					<Repeater field={author.articles} sortableBy="order">
						{(items) => (
							<>
								{items.map((article, { index }) => (
									<div key={article.id} data-testid={`item-${index}`}>{article.title.value}</div>
								))}
							</>
						)}
					</Repeater>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'item-0')).not.toBeNull()
			})

			// Items should be sorted by order
			expect(getByTestId(container, 'item-0').textContent).toBe('First')
			expect(getByTestId(container, 'item-1').textContent).toBe('Second')
			expect(getByTestId(container, 'item-2').textContent).toBe('Third')
		})

		test('moveUp and moveDown move items', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const author = useEntity('Author', { by: { id: 'author-1' } }, e =>
					e.id().articles(a => a.id().title().order()),
				)

				if (author.isLoading) return <div data-testid="loading">Loading</div>
				if (author.isError) return <div>Error</div>

				return (
					<Repeater field={author.articles} sortableBy="order">
						{(items) => (
							<>
								{items.map((article, { index, isFirst, isLast, moveUp, moveDown }) => (
									<div key={article.id} data-testid={`item-${index}`}>
										<span>{article.title.value}</span>
										<button data-testid={`up-${article.id}`} disabled={isFirst} onClick={moveUp}>Up</button>
										<button data-testid={`down-${article.id}`} disabled={isLast} onClick={moveDown}>Down</button>
									</div>
								))}
							</>
						)}
					</Repeater>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'item-0')).not.toBeNull()
			})

			// Initially First, Second, Third
			expect(getByTestId(container, 'item-0').textContent).toContain('First Article')
			expect(getByTestId(container, 'item-1').textContent).toContain('Second Article')
			expect(getByTestId(container, 'item-2').textContent).toContain('Third Article')

			// Move second item up
			act(() => {
				;(getByTestId(container, 'up-article-2') as HTMLButtonElement).click()
			})

			// Now Second, First, Third
			expect(getByTestId(container, 'item-0').textContent).toContain('Second Article')
			expect(getByTestId(container, 'item-1').textContent).toContain('First Article')
			expect(getByTestId(container, 'item-2').textContent).toContain('Third Article')
		})

		test('addItem at specific index with sortableBy', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const author = useEntity('Author', { by: { id: 'author-1' } }, e =>
					e.id().articles(a => a.id().title().order()),
				)

				if (author.isLoading) return <div data-testid="loading">Loading</div>
				if (author.isError) return <div>Error</div>

				return (
					<Repeater field={author.articles} sortableBy="order">
						{(items, { addItem }) => (
							<>
								{items.map((article, { index }) => (
									<div key={article.id} data-testid={`item-${index}`}>{article.title.value}</div>
								))}
								<button data-testid="add-first" onClick={() => addItem('first')}>Add First</button>
								<button data-testid="add-last" onClick={() => addItem('last')}>Add Last</button>
							</>
						)}
					</Repeater>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'item-0')).not.toBeNull()
			})

			// Initially 3 items
			expect(container.querySelectorAll('[data-testid^="item-"]').length).toBe(3)

			// Add at first
			act(() => {
				;(getByTestId(container, 'add-first') as HTMLButtonElement).click()
			})

			// Now 4 items
			expect(container.querySelectorAll('[data-testid^="item-"]').length).toBe(4)
		})
	})

	describe('items.length property', () => {
		test('items.length returns correct count', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const author = useEntity('Author', { by: { id: 'author-1' } }, e =>
					e.id().articles(a => a.id().title()),
				)

				if (author.isLoading) return <div data-testid="loading">Loading</div>
				if (author.isError) return <div>Error</div>

				return (
					<Repeater field={author.articles}>
						{(items) => (
							<div data-testid="length">{items.length}</div>
						)}
					</Repeater>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'length')).not.toBeNull()
			})

			expect(getByTestId(container, 'length').textContent).toBe('3')
		})
	})
})

describe('Utility Functions', () => {
	test('arrayMove moves element correctly', () => {
		const arr = ['a', 'b', 'c', 'd']

		expect(arrayMove(arr, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
		expect(arrayMove(arr, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
		expect(arrayMove(arr, 1, 1)).toEqual(['a', 'b', 'c', 'd'])
	})
})
