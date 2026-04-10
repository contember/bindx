import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, useEntity } from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, schema, testSchema } from '../../../shared'

afterEach(() => {
	cleanup()
})

describe('useEntity hook - data rendering', () => {
	test('should render scalar fields correctly', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.title().content(),
			)

			if (article.$isLoading) {
				return <div>Loading...</div>
			}
			if (article.$isError || article.$isNotFound) {
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
			<BindxProvider adapter={adapter} schema={testSchema}>
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
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.title().author(a => a.name().email()),
			)

			if (article.$isLoading) {
				return <div>Loading...</div>
			}
			if (article.$isError || article.$isNotFound) {
				return <div>Error</div>
			}

			return (
				<div>
					<h1 data-testid="title">{article.title.value}</h1>
					<p data-testid="author-name">{article.$data!.author?.name ?? 'N/A'}</p>
					<p data-testid="author-email">{article.$data!.author?.email ?? 'N/A'}</p>
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
		expect(getByTestId(container, 'author-email').textContent).toBe('john@example.com')
	})

	test('should render array of entities (has-many relation)', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.title().tags(t => t.id().name()),
			)

			if (article.$isLoading) {
				return <div>Loading...</div>
			}
			if (article.$isError || article.$isNotFound) {
				return <div>Error</div>
			}

			return (
				<div>
					<h1 data-testid="title">{article.title.value}</h1>
					<ul data-testid="tags">
						{article.$data!.tags?.map(tag => (
							<li key={tag.id} data-testid={`tag-${tag.id}`}>
								{tag.name}
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
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})

		expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		const tags = getByTestId(container, 'tags')
		expect(tags.children.length).toBe(2)
	})

	test('should render location via article.$data (ArticleEditor pattern)', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.title().location(l => l.id().label().lat().lng()).tags(t => t.id().name().color()),
			)

			if (article.$isLoading) {
				return <div>Loading...</div>
			}
			if (article.$isError || article.$isNotFound) {
				return <div>Error</div>
			}

			return (
				<div>
					<h1 data-testid="title">{article.title.value}</h1>
					<p data-testid="location-label">{article.$data!.location?.label ?? 'N/A'}</p>
					<p data-testid="location-lat">{article.$data!.location?.lat ?? 'N/A'}</p>
					<p data-testid="tags-count">{article.$data!.tags?.length ?? 0}</p>
					<ul data-testid="tags">
						{article.$data!.tags?.map(tag => (
							<li key={tag.id} data-testid={`tag-${tag.id}`}>
								{tag.name}
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
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.title().location(l => l.id().label()).tags(t => t.id().name()),
			)

			if (article.$isLoading) {
				return <div data-testid="loading">Loading...</div>
			}
			if (article.$isError || article.$isNotFound) {
				return <div>Error</div>
			}

			return (
				<div>
					<span data-testid="location-label">{article.$data!.location?.label ?? 'N/A'}</span>
					<span data-testid="tags-count">{article.$data!.tags?.length ?? 0}</span>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
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
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.title().author(a => a.id().name()).location(l => l.id().label()).tags(t => t.id().name()),
			)

			if (article.$isLoading) {
				return <div data-testid="editor-loading">Loading editor...</div>
			}
			if (article.$isError || article.$isNotFound) {
				return <div>Error</div>
			}

			return (
				<div data-testid="editor">
					<span data-testid="editor-title">{article.title.value}</span>
					<span data-testid="editor-author">{article.author!.name.value}</span>
					<span data-testid="editor-location">{article.$data!.location?.label ?? 'N/A'}</span>
					<span data-testid="editor-tags">{article.$data!.tags?.length ?? 0}</span>
				</div>
			)
		}

		function ArticleViewComponent() {
			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.title().content(),
			)

			if (article.$isLoading) {
				return <div data-testid="view-loading">Loading view...</div>
			}
			if (article.$isError || article.$isNotFound) {
				return <div>Error</div>
			}

			return (
				<div data-testid="view">
					<span data-testid="view-title">{article.title.value}</span>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
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
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.title().location(l => l.id().label()).tags(t => t.id().name()),
			)

			if (article.$isLoading) {
				return <div>Loading...</div>
			}
			if (article.$isError || article.$isNotFound) {
				return <div>Error</div>
			}

			return <div data-testid="data">{JSON.stringify(article.$data)}</div>
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
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
				schema.Article,
				{ by: { id: 'article-1' } },
				e => e.title().content(),
			)

			if (article.$isLoading) {
				return <div>Loading...</div>
			}
			if (article.$isError || article.$isNotFound) {
				return <div>Error</div>
			}

			return <div data-testid="data">{JSON.stringify(article.$data)}</div>
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
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
