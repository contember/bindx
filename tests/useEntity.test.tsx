import './setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	createBindx,
	MockAdapter,
	createFragment,
	defineSchema,
	scalar,
	hasOne,
	hasMany,
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

interface Tag {
	id: string
	name: string
	color: string
}

interface Location {
	id: string
	label: string
	lat: number
	lng: number
}

interface Article {
	id: string
	title: string
	content: string
	author: Author
	location: Location
	tags: Tag[]
}

// Create typed hooks using createBindx with schema
interface TestSchema {
	Article: Article
	Author: Author
	Tag: Tag
	Location: Location
}

const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				content: scalar(),
				author: hasOne('Author'),
				location: hasOne('Location'),
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
				color: scalar(),
			},
		},
		Location: {
			fields: {
				id: scalar(),
				label: scalar(),
				lat: scalar(),
				lng: scalar(),
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
				location: {
					id: 'location-1',
					label: 'New York',
					lat: 40.7128,
					lng: -74.006,
				},
				tags: [
					{ id: 'tag-1', name: 'JavaScript', color: '#f7df1e' },
					{ id: 'tag-2', name: 'React', color: '#61dafb' },
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
		Location: {
			'location-1': {
				id: 'location-1',
				label: 'New York',
				lat: 40.7128,
				lng: -74.006,
			},
		},
		Tag: {
			'tag-1': { id: 'tag-1', name: 'JavaScript', color: '#f7df1e' },
			'tag-2': { id: 'tag-2', name: 'React', color: '#61dafb' },
		},
	}
}

describe('useEntity hook', () => {
	describe('loading state', () => {
		test('should show loading state initially', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 50 })

			function TestComponent() {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError) {
					return <div>Error</div>
				}

				return <div data-testid="title">{article.title.value}</div>
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
			let accessor: ReturnType<typeof useEntity> | null = null

			function TestComponent() {
				accessor = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())
				return null
			}

			render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			expect(accessor).not.toBeNull()
			expect(accessor!.isLoading).toBe(true)
		})
	})

	describe('data rendering', () => {
		test('should render scalar fields correctly', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity(
					'Article',
					{ by: { id: 'article-1' } },
					e => e.title().content(),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<h1 data-testid="title">{article.title.value}</h1>
						<p data-testid="content">{article.content.value}</p>
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
				const article = useEntity(
					'Article',
					{ by: { id: 'article-1' } },
					e => e.title().author(a => a.name().email()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<h1 data-testid="title">{article.title.value}</h1>
						<p data-testid="author-name">{article.data.author?.name ?? 'N/A'}</p>
						<p data-testid="author-email">{article.data.author?.email ?? 'N/A'}</p>
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
				const article = useEntity(
					'Article',
					{ by: { id: 'article-1' } },
					e => e.title().tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<h1 data-testid="title">{article.title.value}</h1>
						<ul data-testid="tags">
							{article.data.tags?.map(tag => (
								<li key={tag.id} data-testid={`tag-${tag.id}`}>
									{tag.name}
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

		test('should render location via article.data (ArticleEditor pattern)', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity(
					'Article',
					{ by: { id: 'article-1' } },
					e => e.title().location(l => l.id().label().lat().lng()).tags(t => t.id().name().color()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<h1 data-testid="title">{article.title.value}</h1>
						<p data-testid="location-label">{article.data.location?.label ?? 'N/A'}</p>
						<p data-testid="location-lat">{article.data.location?.lat ?? 'N/A'}</p>
						<p data-testid="tags-count">{article.data.tags?.length ?? 0}</p>
						<ul data-testid="tags">
							{article.data.tags?.map(tag => (
								<li key={tag.id} data-testid={`tag-${tag.id}`}>
									{tag.name}
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
			expect(getByTestId(container, 'location-label').textContent).toBe('New York')
			expect(getByTestId(container, 'location-lat').textContent).toBe('40.7128')
			expect(getByTestId(container, 'tags-count').textContent).toBe('2')
			expect(getByTestId(container, 'tag-tag-1').textContent).toBe('JavaScript')
		})

		test('data snapshot should reflect current values including relations with delay', async () => {
			// Test with delay similar to the example app
			const adapter = new MockAdapter(createMockData(), { delay: 200 })

			function TestComponent() {
				const article = useEntity(
					'Article',
					{ by: { id: 'article-1' } },
					e => e.title().location(l => l.id().label()).tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="location-label">{article.data.location?.label ?? 'N/A'}</span>
						<span data-testid="tags-count">{article.data.tags?.length ?? 0}</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			// Initially loading
			expect(queryByTestId(container, 'loading')).not.toBeNull()

			// Wait for data to load
			await waitFor(() => {
				expect(queryByTestId(container, 'location-label')).not.toBeNull()
			}, { timeout: 1000 })

			expect(getByTestId(container, 'location-label').textContent).toBe('New York')
			expect(getByTestId(container, 'tags-count').textContent).toBe('2')
		})

		test('multiple components fetching same entity with different selections', async () => {
			// This simulates the example app scenario where multiple components
			// fetch the same entity but with different selections
			const adapter = new MockAdapter(createMockData(), { delay: 50 })

			function ArticleEditorComponent() {
				const article = useEntity(
					'Article',
					{ by: { id: 'article-1' } },
					e => e.title().author(a => a.id().name()).location(l => l.id().label()).tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div data-testid="editor-loading">Loading editor...</div>
				}
				if (article.isError) {
					return <div>Error</div>
				}

				return (
					<div data-testid="editor">
						<span data-testid="editor-title">{article.title.value}</span>
						<span data-testid="editor-author">{article.author.name.value}</span>
						<span data-testid="editor-location">{article.data.location?.label ?? 'N/A'}</span>
						<span data-testid="editor-tags">{article.data.tags?.length ?? 0}</span>
					</div>
				)
			}

			function ArticleViewComponent() {
				const article = useEntity(
					'Article',
					{ by: { id: 'article-1' } },
					e => e.title().content(),
				)

				if (article.isLoading) {
					return <div data-testid="view-loading">Loading view...</div>
				}
				if (article.isError) {
					return <div>Error</div>
				}

				return (
					<div data-testid="view">
						<span data-testid="view-title">{article.title.value}</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<ArticleEditorComponent />
					<ArticleViewComponent />
				</BindxProvider>,
			)

			// Wait for both to load
			await waitFor(() => {
				expect(queryByTestId(container, 'editor')).not.toBeNull()
				expect(queryByTestId(container, 'view')).not.toBeNull()
			}, { timeout: 1000 })

			// Check editor
			expect(getByTestId(container, 'editor-title').textContent).toBe('Hello World')
			expect(getByTestId(container, 'editor-author').textContent).toBe('John Doe')
			expect(getByTestId(container, 'editor-location').textContent).toBe('New York')
			expect(getByTestId(container, 'editor-tags').textContent).toBe('2')

			// Check view
			expect(getByTestId(container, 'view-title').textContent).toBe('Hello World')
		})

		test('data snapshot should reflect current values including relations', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity(
					'Article',
					{ by: { id: 'article-1' } },
					e => e.title().location(l => l.id().label()).tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div>Error</div>
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
			expect(data.location).toBeDefined()
			expect(data.location.label).toBe('New York')
			expect(data.tags).toBeDefined()
			expect(data.tags.length).toBe(2)
			expect(data.tags[0].name).toBe('JavaScript')
		})

		test('data snapshot should reflect current scalar values', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity(
					'Article',
					{ by: { id: 'article-1' } },
					e => e.title().content(),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div>Error</div>
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
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<span data-testid="title">{article.title.value}</span>
						<button
							data-testid="update-btn"
							onClick={() => article.title.setValue('Updated Title')}
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

		test('should update nested entity value optimistically via data', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			// Note: The new API uses data for read access. To update nested relations,
			// you would use useEntity on the related entity directly.
			// This test demonstrates reading nested data.
			function TestComponent() {
				const article = useEntity(
					'Article',
					{ by: { id: 'article-1' } },
					e => e.author(a => a.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<span data-testid="author-name">{article.data.author?.name ?? 'N/A'}</span>
						<span data-testid="author-id">{article.data.author?.id ?? 'N/A'}</span>
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
			expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
		})
	})

	describe('dirty state tracking', () => {
		test('isDirty should be false initially', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div>Error</div>
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
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<span data-testid="dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="update-btn"
							onClick={() => article.title.setValue('New Title')}
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
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<span data-testid="dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="update-btn"
							onClick={() => article.title.setValue('New Title')}
						>
							Update
						</button>
						<button
							data-testid="revert-btn"
							onClick={() => article.title.setValue('Hello World')}
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
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<span data-testid="value">{article.title.value}</span>
						<span data-testid="server-value">{article.title.serverValue}</span>
						<button
							data-testid="update-btn"
							onClick={() => article.title.setValue('New Title')}
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
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<span data-testid="title">{article.title.value}</span>
						<span data-testid="dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="update-btn"
							onClick={() => article.title.setValue('New Title')}
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
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<span data-testid="title">{article.title.value}</span>
						<span data-testid="server-value">{article.title.serverValue}</span>
						<span data-testid="dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="update-btn"
							onClick={() => article.title.setValue('Persisted Title')}
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
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.title())

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div>Error</div>
				}

				return (
					<div>
						<span data-testid="persisting">{article.isPersisting ? 'persisting' : 'idle'}</span>
						<button
							data-testid="update-btn"
							onClick={() => article.title.setValue('New Title')}
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

	describe('relation field handles', () => {
		test('should access has-one relation fields via fields accessor', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity(
					'Article',
					{ by: { id: 'article-1' } },
					e => e.title().author(a => a.id().name().email()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
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
					'Article',
					{ by: { id: 'article-1' } },
					e => e.title().tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
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
					'Article',
					{ by: { id: 'article-1' } },
					e => e.title().tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
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

	describe('fragment composition', () => {
		test('should work with pre-defined fragments', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const AuthorFragment = createFragment<Author>()(a => a.id().name())

			function TestComponent() {
				const article = useEntity(
					'Article',
					{ by: { id: 'article-1' } },
					e => e.title().author(AuthorFragment),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
					'Article',
					{ by: { id: 'article-1' } },
					e => e.title().author(a => a.id().name().email()),
				)

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
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

	describe('has-many connect/disconnect', () => {
		test('should disconnect items from has-many relation', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity(
					'Article',
					{ by: { id: 'article-1' } },
					e => e.title().tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
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
			// Add additional tag that can be connected
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(mockData as any).Tag['tag-3'] = { id: 'tag-3', name: 'TypeScript', color: '#3178c6' }
			const adapter = new MockAdapter(mockData, { delay: 0 })

			function TestComponent() {
				const article = useEntity(
					'Article',
					{ by: { id: 'article-1' } },
					e => e.title().tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
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
			// Add additional tag that can be connected
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(mockData as any).Tag['tag-3'] = { id: 'tag-3', name: 'TypeScript', color: '#3178c6' }
			const adapter = new MockAdapter(mockData, { delay: 0 })

			function TestComponent() {
				const article = useEntity(
					'Article',
					{ by: { id: 'article-1' } },
					e => e.title().tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
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
})
