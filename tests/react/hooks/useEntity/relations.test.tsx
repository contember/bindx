import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	createFragment,
	useEntity,
} from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, schema, testSchema, type Author } from '../../../shared'

afterEach(() => {
	cleanup()
})

describe('useEntity hook - relation field handles', () => {
	test('should access has-one relation fields via fields accessor', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.title().author(a => a.id().name().email()),
			)

			if (article.isLoading) {
				return <div>Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div>Error</div>
			}

			// Access nested field handles via $fields or directly
			return (
				<div>
					<h1 data-testid="title">{article.title.value}</h1>
					<p data-testid="author-name-field">{article.author.name.value}</p>
					<p data-testid="author-email-field">{article.author.email.value}</p>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})

		expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		expect(getByTestId(container, 'author-name-field').textContent).toBe('John Doe')
		expect(getByTestId(container, 'author-email-field').textContent).toBe('john@example.com')
	})

	test('should access has-many relation items via fields accessor', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.title().tags(t => t.id().name()),
			)

			if (article.isLoading) {
				return <div>Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div>Error</div>
			}

			// Access has-many items - this was broken before the fix
			const tagItems = article.tags.items

			return (
				<div>
					<h1 data-testid="title">{article.title.value}</h1>
					<ul data-testid="tags">
						{tagItems.map(tag => (
							<li key={tag.id} data-testid={`tag-${tag.id}`}>
								{tag.name.value}
							</li>
						))}
					</ul>
					<span data-testid="tag-count">{tagItems.length}</span>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})

		expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		expect(getByTestId(container, 'tag-count').textContent).toBe('2')
		expect(getByTestId(container, 'tag-tag-1').textContent).toBe('JavaScript')
		expect(getByTestId(container, 'tag-tag-2').textContent).toBe('React')
	})

	test('should map over has-many relation items', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.title().tags(t => t.id().name()),
			)

			if (article.isLoading) {
				return <div>Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div>Error</div>
			}

			return (
				<div>
					<ul data-testid="tags">
						{article.tags.map((tag, index) => (
							<li key={tag.id} data-testid={`tag-${index}`}>
								{tag.name.value}
							</li>
						))}
					</ul>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tags')).not.toBeNull()
		})

		expect(getByTestId(container, 'tag-0').textContent).toBe('JavaScript')
		expect(getByTestId(container, 'tag-1').textContent).toBe('React')
	})
})

describe('useEntity hook - fragment composition', () => {
	test('should work with pre-defined fragments', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const AuthorFragment = createFragment<Author>()(a => a.id().name())

		function TestComponent() {
			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.title().author(AuthorFragment),
			)

			if (article.isLoading) {
				return <div>Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div>Error</div>
			}

			return (
				<div>
					<h1 data-testid="title">{article.title.value}</h1>
					<p data-testid="author-name">{article.data.author?.name ?? 'N/A'}</p>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
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

		// AuthorDisplay shows read-only data from nested relation
		function AuthorDisplay({ data }: { data: { name: string; email: string } | undefined }) {
			return (
				<div data-testid="author-display">
					<span data-testid="author-name">{data?.name ?? 'N/A'}</span>
					<span data-testid="author-email">{data?.email ?? 'N/A'}</span>
				</div>
			)
		}

		function TestComponent() {
			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.title().author(a => a.id().name().email()),
			)

			if (article.isLoading) {
				return <div data-testid="loading">Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div>Error</div>
			}

			return (
				<div>
					<TextInput field={article.title} label="Title" />
					<AuthorDisplay data={article.data.author} />
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'author-display')).not.toBeNull()
		})

		const titleInput = getByTestId(container, 'input-Title') as HTMLInputElement
		expect(titleInput.value).toBe('Hello World')
		expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		expect(getByTestId(container, 'author-email').textContent).toBe('john@example.com')
	})
})

describe('useEntity hook - has-many connect/disconnect', () => {
	test('should disconnect items from has-many relation', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.title().tags(t => t.id().name()),
			)

			if (article.isLoading) {
				return <div>Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div>Error</div>
			}

			return (
				<div>
					<span data-testid="tag-count">{article.tags.length}</span>
					<span data-testid="tags-dirty">{article.tags.isDirty ? 'dirty' : 'clean'}</span>
					<ul data-testid="tags">
						{article.tags.items.map(tag => (
							<li key={tag.id} data-testid={`tag-${tag.id}`}>
								{tag.name.value}
								<button
									data-testid={`disconnect-${tag.id}`}
									onClick={() => article.tags.disconnect(tag.id)}
								>
									Disconnect
								</button>
							</li>
						))}
					</ul>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tag-count')).not.toBeNull()
		})

		// Initially 2 tags
		expect(getByTestId(container, 'tag-count').textContent).toBe('2')
		expect(getByTestId(container, 'tags-dirty').textContent).toBe('clean')

		// Disconnect first tag
		act(() => {
			;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
		})

		// Now should have 1 tag and be dirty
		expect(getByTestId(container, 'tag-count').textContent).toBe('1')
		expect(getByTestId(container, 'tags-dirty').textContent).toBe('dirty')
		expect(queryByTestId(container, 'tag-tag-1')).toBeNull()
		expect(queryByTestId(container, 'tag-tag-2')).not.toBeNull()
	})

	test('should connect items to has-many relation', async () => {
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 0 })

		function TestComponent() {
			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.title().tags(t => t.id().name()),
			)

			if (article.isLoading) {
				return <div>Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div>Error</div>
			}

			return (
				<div>
					<span data-testid="tag-count">{article.tags.length}</span>
					<span data-testid="tags-dirty">{article.tags.isDirty ? 'dirty' : 'clean'}</span>
					<button
						data-testid="connect-tag-3"
						onClick={() => article.tags.connect('tag-3')}
					>
						Connect TypeScript
					</button>
					<ul data-testid="tags">
						{article.tags.items.map(tag => (
							<li key={tag.id} data-testid={`tag-${tag.id}`}>
								{tag.name.value}
							</li>
						))}
					</ul>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tag-count')).not.toBeNull()
		})

		// Initially 2 tags
		expect(getByTestId(container, 'tag-count').textContent).toBe('2')
		expect(getByTestId(container, 'tags-dirty').textContent).toBe('clean')

		// Connect new tag
		act(() => {
			;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
		})

		// Now should have 3 tags and be dirty
		expect(getByTestId(container, 'tag-count').textContent).toBe('3')
		expect(getByTestId(container, 'tags-dirty').textContent).toBe('dirty')
		expect(queryByTestId(container, 'tag-tag-3')).not.toBeNull()
	})

	test('should handle connect and disconnect together', async () => {
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 0 })

		function TestComponent() {
			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.title().tags(t => t.id().name()),
			)

			if (article.isLoading) {
				return <div>Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div>Error</div>
			}

			const tagIds = article.tags.items.map(t => t.id).sort().join(',')

			return (
				<div>
					<span data-testid="tag-ids">{tagIds}</span>
					<button
						data-testid="disconnect-tag-1"
						onClick={() => article.tags.disconnect('tag-1')}
					>
						Disconnect tag-1
					</button>
					<button
						data-testid="connect-tag-3"
						onClick={() => article.tags.connect('tag-3')}
					>
						Connect tag-3
					</button>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
		})

		// Initially tag-1 and tag-2
		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')

		// Disconnect tag-1
		act(() => {
			;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-2')

		// Connect tag-3
		act(() => {
			;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-2,tag-3')
	})
})
