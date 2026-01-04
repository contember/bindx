import './setup'
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
	hasMany,
} from '../src/index.js'

afterEach(() => {
	cleanup()
})

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

// Create typed hooks using createBindx with schema
interface TestSchema {
	Article: Article
	Author: Author
	Tag: Tag
}

const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				content: scalar(),
				author: hasOne('Author'),
				tags: hasMany('Tag'),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				email: scalar(),
			},
		},
		Tag: {
			fields: {
				id: scalar(),
				name: scalar(),
			},
		},
	},
})

const { useEntity } = createBindx(schema)

// Helper to query by data-testid
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
		Tag: {
			'tag-1': {
				id: 'tag-1',
				name: 'JavaScript',
			},
			'tag-2': {
				id: 'tag-2',
				name: 'React',
			},
		},
	}
}

describe('Store Synchronization', () => {
	describe('same entity from multiple useEntity hooks', () => {
		test('two components using the same entity should stay in sync', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			// Component A displays author name
			function ComponentA() {
				const author = useEntity('Author', { id: 'author-1' }, e => e.name())

				if (author.isLoading) {
					return <div data-testid="a-loading">Loading A...</div>
				}

				if (author.isError) {
					return <div data-testid="a-error">Error A</div>
				}

				return (
					<div>
						<span data-testid="a-name">{author.fields.name.value}</span>
						<button
							data-testid="a-update"
							onClick={() => author.fields.name.setValue('Jane Doe')}
						>
							Update A
						</button>
					</div>
				)
			}

			// Component B also displays author name
			function ComponentB() {
				const author = useEntity('Author', { id: 'author-1' }, e => e.name())

				if (author.isLoading) {
					return <div data-testid="b-loading">Loading B...</div>
				}

				if (author.isError) {
					return <div data-testid="b-error">Error B</div>
				}

				return (
					<div>
						<span data-testid="b-name">{author.fields.name.value}</span>
						<button
							data-testid="b-update"
							onClick={() => author.fields.name.setValue('Bob Smith')}
						>
							Update B
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<ComponentA />
					<ComponentB />
				</BindxProvider>,
			)

			// Wait for both to load
			await waitFor(() => {
				expect(queryByTestId(container, 'a-name')).not.toBeNull()
				expect(queryByTestId(container, 'b-name')).not.toBeNull()
			})

			// Both should show initial value
			expect(getByTestId(container, 'a-name').textContent).toBe('John Doe')
			expect(getByTestId(container, 'b-name').textContent).toBe('John Doe')

			// Update from Component A
			act(() => {
				;(getByTestId(container, 'a-update') as HTMLButtonElement).click()
			})

			// Both should now show updated value
			expect(getByTestId(container, 'a-name').textContent).toBe('Jane Doe')
			expect(getByTestId(container, 'b-name').textContent).toBe('Jane Doe')

			// Update from Component B
			act(() => {
				;(getByTestId(container, 'b-update') as HTMLButtonElement).click()
			})

			// Both should show the new value
			expect(getByTestId(container, 'a-name').textContent).toBe('Bob Smith')
			expect(getByTestId(container, 'b-name').textContent).toBe('Bob Smith')
		})
	})

	describe('nested entity access via data', () => {
		test('article.data.author should be accessible', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			// Component that accesses author through article data
			function ArticleComponent() {
				const article = useEntity('Article', { id: 'article-1' }, e =>
					e.title().author(a => a.id().name())
				)

				if (article.isLoading) {
					return <div data-testid="article-loading">Loading...</div>
				}

				if (article.isError) {
					return <div data-testid="article-error">Error</div>
				}

				return (
					<div>
						<span data-testid="article-title">{article.data.title}</span>
						<span data-testid="article-author-name">{article.data.author?.name ?? 'N/A'}</span>
					</div>
				)
			}

			// Component that accesses author directly
			function AuthorComponent() {
				const author = useEntity('Author', { id: 'author-1' }, e => e.name().email())

				if (author.isLoading) {
					return <div data-testid="author-loading">Loading...</div>
				}

				if (author.isError) {
					return <div data-testid="author-error">Error</div>
				}

				return (
					<div>
						<span data-testid="author-name">{author.data.name}</span>
						<span data-testid="author-email">{author.data.email}</span>
						<button
							data-testid="author-update"
							onClick={() => author.fields.name.setValue('Updated Directly')}
						>
							Update Directly
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<ArticleComponent />
					<AuthorComponent />
				</BindxProvider>,
			)

			// Wait for both to load
			await waitFor(() => {
				expect(queryByTestId(container, 'article-author-name')).not.toBeNull()
				expect(queryByTestId(container, 'author-name')).not.toBeNull()
			})

			// Both should show initial value
			expect(getByTestId(container, 'article-author-name').textContent).toBe('John Doe')
			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		})
	})

	describe('dirty state synchronization', () => {
		test('isDirty should be consistent across all views', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function ComponentA() {
				const author = useEntity('Author', { id: 'author-1' }, e => e.name())

				if (author.isLoading) return <div>Loading...</div>
				if (author.isError) return <div>Error</div>

				return (
					<div>
						<span data-testid="a-dirty">{author.isDirty ? 'dirty' : 'clean'}</span>
						<span data-testid="a-field-dirty">{author.fields.name.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="a-update"
							onClick={() => author.fields.name.setValue('Changed')}
						>
							Change
						</button>
					</div>
				)
			}

			function ComponentB() {
				const author = useEntity('Author', { id: 'author-1' }, e => e.name())

				if (author.isLoading) return <div>Loading...</div>
				if (author.isError) return <div>Error</div>

				return (
					<div>
						<span data-testid="b-dirty">{author.isDirty ? 'dirty' : 'clean'}</span>
						<span data-testid="b-field-dirty">{author.fields.name.isDirty ? 'dirty' : 'clean'}</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<ComponentA />
					<ComponentB />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'a-dirty')).not.toBeNull()
				expect(queryByTestId(container, 'b-dirty')).not.toBeNull()
			})

			// Initially both should be clean
			expect(getByTestId(container, 'a-dirty').textContent).toBe('clean')
			expect(getByTestId(container, 'b-dirty').textContent).toBe('clean')
			expect(getByTestId(container, 'a-field-dirty').textContent).toBe('clean')
			expect(getByTestId(container, 'b-field-dirty').textContent).toBe('clean')

			// Make a change
			act(() => {
				;(getByTestId(container, 'a-update') as HTMLButtonElement).click()
			})

			// Both should show dirty
			expect(getByTestId(container, 'a-dirty').textContent).toBe('dirty')
			expect(getByTestId(container, 'b-dirty').textContent).toBe('dirty')
			expect(getByTestId(container, 'a-field-dirty').textContent).toBe('dirty')
			expect(getByTestId(container, 'b-field-dirty').textContent).toBe('dirty')
		})
	})

	describe('cache option', () => {
		test('with cache: true, should use cached data from store', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 50 })

			function TestComponent() {
				const author = useEntity('Author', { id: 'author-1', cache: true }, e => e.name())

				if (author.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				if (author.isError) {
					return <div data-testid="error">Error</div>
				}

				return <span data-testid="name">{author.data.name}</span>
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			// Should show loading initially, then data
			await waitFor(() => {
				expect(queryByTestId(container, 'name')).not.toBeNull()
			})

			// Should show name from mock data
			expect(getByTestId(container, 'name').textContent).toBe('John Doe')
		})
	})

	describe('list data access', () => {
		test('article tags should be accessible via data', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function ArticleTagsComponent() {
				const article = useEntity('Article', { id: 'article-1' }, e =>
					e.tags(t => t.id().name())
				)

				if (article.isLoading) return <div>Loading...</div>
				if (article.isError) return <div>Error</div>

				return (
					<div data-testid="tags">
						{article.data.tags?.map(tag => (
							<span key={tag.id} data-testid={`tag-${tag.id}`}>
								{tag.name}
							</span>
						))}
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<ArticleTagsComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-tag-1')).not.toBeNull()
			})

			// Both tags should be rendered
			expect(getByTestId(container, 'tag-tag-1').textContent).toBe('JavaScript')
			expect(getByTestId(container, 'tag-tag-2').textContent).toBe('React')
		})
	})
})
