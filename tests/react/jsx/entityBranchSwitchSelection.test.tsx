// Regression test for https://github.com/contember/bindx/issues/154
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act } from '@testing-library/react'
import React, { useState } from 'react'
import { BindxProvider, MockAdapter, Entity, EntityList, Field, HasMany } from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, schema, testSchema } from '../../shared'

afterEach(() => {
	cleanup()
})

describe('<Entity> reused across conditional branches', () => {
	test('should collect the new children selection when the branch switches but entity and by stay the same', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		let setTab: (tab: 'title' | 'content') => void = () => {}

		// Two tabs render an <Entity> for the same record at the same position in the
		// tree, with different children. React reuses the instance; only `children` changes.
		function App() {
			const [tab, setLocalTab] = useState<'title' | 'content'>('title')
			setTab = setLocalTab

			return tab === 'title'
				? (
					<Entity entity={schema.Article} by={{ id: 'article-1' }}>
						{article => <div data-testid="title"><Field field={article.title} /></div>}
					</Entity>
				)
				: (
					<Entity entity={schema.Article} by={{ id: 'article-1' }}>
						{article => <div data-testid="content"><Field field={article.content} /></div>}
					</Entity>
				)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<App />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})

		act(() => setTab('content'))

		await waitFor(() => {
			expect(queryByTestId(container, 'content')).not.toBeNull()
		})
		expect(getByTestId(container, 'content').textContent).toBe('This is the content')
	})

	test('should collect the new children selection when an <EntityList> branch switches with the same options', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		let setTab: (tab: 'title' | 'content') => void = () => {}

		function App() {
			const [tab, setLocalTab] = useState<'title' | 'content'>('title')
			setTab = setLocalTab

			return tab === 'title'
				? (
					<EntityList entity={schema.Article}>
						{article => <div data-testid={`title-${article.id}`}><Field field={article.title} /></div>}
					</EntityList>
				)
				: (
					<EntityList entity={schema.Article}>
						{article => <div data-testid={`content-${article.id}`}><Field field={article.content} /></div>}
					</EntityList>
				)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<App />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title-article-1')).not.toBeNull()
		})

		act(() => setTab('content'))

		await waitFor(() => {
			expect(queryByTestId(container, 'content-article-1')).not.toBeNull()
		})
		expect(getByTestId(container, 'content-article-1').textContent).toBe('This is the content')
	})

	test('should not refetch when children stop reading a field or come back to it', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const query = adapter.query.bind(adapter)
		let queryCount = 0
		adapter.query = (...args) => {
			queryCount++
			return query(...args)
		}

		let setShowContent: (show: boolean) => void = () => {}

		function App() {
			const [showContent, setLocalShowContent] = useState(true)
			setShowContent = setLocalShowContent

			return (
				<Entity entity={schema.Article} by={{ id: 'article-1' }}>
					{article => (
						<div>
							<div data-testid="title"><Field field={article.title} /></div>
							{showContent && <div data-testid="content"><Field field={article.content} /></div>}
						</div>
					)}
				</Entity>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<App />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'content')).not.toBeNull()
		})
		const queriesAfterLoad = queryCount

		act(() => setShowContent(false))
		act(() => setShowContent(true))
		act(() => setShowContent(false))
		act(() => setShowContent(true))
		await new Promise(resolve => setTimeout(resolve, 20))

		expect(queryCount).toBe(queriesAfterLoad)
		expect(getByTestId(container, 'content').textContent).toBe('This is the content')
	})

	test('should keep the selection and skip refetching when the parent re-renders with the same fields', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const query = adapter.query.bind(adapter)
		let queryCount = 0
		adapter.query = (...args) => {
			queryCount++
			return query(...args)
		}

		let rerender: () => void = () => {}

		function App() {
			const [, setTick] = useState(0)
			rerender = () => setTick(tick => tick + 1)

			return (
				<Entity entity={schema.Article} by={{ id: 'article-1' }}>
					{article => <div data-testid="title"><Field field={article.title} /></div>}
				</Entity>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<App />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})
		const queriesAfterLoad = queryCount

		act(() => rerender())
		act(() => rerender())
		await new Promise(resolve => setTimeout(resolve, 20))

		expect(queryCount).toBe(queriesAfterLoad)
		expect(getByTestId(container, 'title').textContent).toBe('Hello World')
	})

	test('should not carry fields of the previous entity into an <EntityList> reused for another entity', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const query = adapter.query.bind(adapter)
		const requestedFields: Record<string, string[]> = {}
		adapter.query = (queries, options) => {
			for (const entry of queries) {
				const fields = 'spec' in entry ? entry.spec.fields.map(field => field.sourcePath[0] ?? field.name) : []
				requestedFields[entry.entityType] = fields
			}
			return query(queries, options)
		}

		let setTab: (tab: 'articles' | 'authors') => void = () => {}

		function App() {
			const [tab, setLocalTab] = useState<'articles' | 'authors'>('articles')
			setTab = setLocalTab

			return tab === 'articles'
				? (
					<EntityList entity={schema.Article}>
						{article => <div data-testid={`article-${article.id}`}><Field field={article.title} /></div>}
					</EntityList>
				)
				: (
					<EntityList entity={schema.Author}>
						{author => <div data-testid={`author-${author.id}`}><Field field={author.name} /></div>}
					</EntityList>
				)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<App />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'article-article-1')).not.toBeNull()
		})

		act(() => setTab('authors'))

		await waitFor(() => {
			expect(queryByTestId(container, 'author-author-1')).not.toBeNull()
		})
		expect(getByTestId(container, 'author-author-1').textContent).toBe('John Doe')
		expect(requestedFields['Author']).not.toContain('title')
	})

	test('should start the selection afresh when <Entity> switches to another record', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const query = adapter.query.bind(adapter)
		const requestedFields: Record<string, string[]> = {}
		adapter.query = (queries, options) => {
			for (const entry of queries) {
				if (entry.type === 'get') {
					requestedFields[JSON.stringify(entry.by)] = entry.spec.fields.map(field => field.sourcePath[0] ?? field.name)
				}
			}
			return query(queries, options)
		}

		let setArticleId: (id: string) => void = () => {}

		function App() {
			const [articleId, setLocalArticleId] = useState('article-1')
			setArticleId = setLocalArticleId

			return articleId === 'article-1'
				? (
					<Entity entity={schema.Article} by={{ id: articleId }}>
						{article => (
							<div data-testid="article">
								<Field field={article.title} />
								<Field field={article.content} />
							</div>
						)}
					</Entity>
				)
				: (
					<Entity entity={schema.Article} by={{ id: articleId }}>
						{article => <div data-testid="article"><Field field={article.title} /></div>}
					</Entity>
				)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<App />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(getByTestId(container, 'article').textContent).toBe('Hello WorldThis is the content')
		})

		act(() => setArticleId('article-2'))

		await waitFor(() => {
			expect(getByTestId(container, 'article').textContent).toBe('Another Article')
		})
		expect(requestedFields[JSON.stringify({ id: 'article-2' })]).not.toContain('content')
	})

	test('should replace a has-many subquery when its filter changes instead of adding another', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const query = adapter.query.bind(adapter)
		const tagSubqueries: number[] = []
		adapter.query = (queries, options) => {
			for (const entry of queries) {
				if (entry.type === 'get') {
					tagSubqueries.push(entry.spec.fields.filter(field => field.sourcePath[0] === 'tags').length)
				}
			}
			return query(queries, options)
		}

		let setSearch: (search: string) => void = () => {}

		function App() {
			const [search, setLocalSearch] = useState('Java')
			setSearch = setLocalSearch

			return (
				<Entity entity={schema.Article} by={{ id: 'article-1' }}>
					{article => (
						<div data-testid="tags">
							<HasMany field={article.tags} filter={{ name: { containsCI: search } }}>
								{tag => <Field field={tag.name} />}
							</HasMany>
						</div>
					)}
				</Entity>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<App />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tags')).not.toBeNull()
		})

		for (const search of ['Re', 'Rea', 'React']) {
			act(() => setSearch(search))
			await new Promise(resolve => setTimeout(resolve, 10))
		}

		expect(tagSubqueries.length).toBeGreaterThan(1)
		expect(tagSubqueries.every(count => count === tagSubqueries[0])).toBe(true)
	})

	test('should not refetch a nested <Entity> when the outer entity re-renders on a store change', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const query = adapter.query.bind(adapter)
		let queryCount = 0
		adapter.query = (...args) => {
			queryCount++
			return query(...args)
		}

		let setOuterTitle: (title: string) => void = () => {}

		function App() {
			return (
				<Entity entity={schema.Article} by={{ id: 'article-1' }}>
					{article => {
						setOuterTitle = title => article.title.setValue(title)
						return (
							<div>
								<div data-testid="outer"><Field field={article.title} /></div>
								<Entity entity={schema.Article} by={{ id: 'article-2' }}>
									{inner => <div data-testid="inner"><Field field={inner.content} /></div>}
								</Entity>
							</div>
						)
					}}
				</Entity>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<App />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'inner')).not.toBeNull()
		})
		const queriesAfterLoad = queryCount

		act(() => setOuterTitle('Edited'))
		act(() => setOuterTitle('Edited again'))
		await new Promise(resolve => setTimeout(resolve, 20))

		expect(getByTestId(container, 'outer').textContent).toBe('Edited again')
		expect(getByTestId(container, 'inner').textContent).toBe('More content here')
		expect(queryCount).toBe(queriesAfterLoad)
	})
})
