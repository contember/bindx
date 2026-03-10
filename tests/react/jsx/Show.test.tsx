import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	Show,
	useEntity,
} from '@contember/bindx-react'
import {
	testSchema,
	schema,
	createMockData,
} from '../../shared'

afterEach(() => {
	cleanup()
})

function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

describe('Show component', () => {
	// ==================== Basic Rendering ====================

	describe('basic rendering', () => {
		test('renders children when field has value', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().title())

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<Show field={article.title}>
							{value => <span data-testid="title">{value}</span>}
						</Show>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			expect(queryByTestId(container, 'title')).not.toBeNull()
			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		})

		test('renders nothing when field is null and no fallback', async () => {
			const adapter = new MockAdapter({
				...createMockData(),
				Article: {
					'article-1': {
						...createMockData().Article['article-1'],
						publishedAt: null,
					},
				},
			}, { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().publishedAt())

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div data-testid="wrapper">
						<Show field={article.publishedAt}>
							{value => <span data-testid="date">{value}</span>}
						</Show>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			expect(queryByTestId(container, 'date')).toBeNull()
			const wrapper = getByTestId(container, 'wrapper')
			expect(wrapper.textContent).toBe('')
		})
	})

	// ==================== Fallback Behavior ====================

	describe('fallback behavior', () => {
		test('renders fallback when field is null', async () => {
			const adapter = new MockAdapter({
				...createMockData(),
				Article: {
					'article-1': {
						...createMockData().Article['article-1'],
						publishedAt: null,
					},
				},
			}, { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().publishedAt())

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<Show
							field={article.publishedAt}
							fallback={<span data-testid="fallback">Not published</span>}
						>
							{value => <span data-testid="date">{value}</span>}
						</Show>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			expect(queryByTestId(container, 'date')).toBeNull()
			expect(queryByTestId(container, 'fallback')).not.toBeNull()
			expect(getByTestId(container, 'fallback').textContent).toBe('Not published')
		})

		test('does not render fallback when field has value', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().title())

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<Show
							field={article.title}
							fallback={<span data-testid="fallback">No title</span>}
						>
							{value => <span data-testid="title">{value}</span>}
						</Show>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			expect(queryByTestId(container, 'title')).not.toBeNull()
			expect(queryByTestId(container, 'fallback')).toBeNull()
		})

		test('renders complex fallback JSX', async () => {
			const adapter = new MockAdapter({
				...createMockData(),
				Article: {
					'article-1': {
						...createMockData().Article['article-1'],
						publishedAt: null,
					},
				},
			}, { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().publishedAt())

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<Show
							field={article.publishedAt}
							fallback={
								<div data-testid="complex-fallback">
									<p data-testid="message">This article has not been published yet</p>
									<button data-testid="action">Publish now</button>
								</div>
							}
						>
							{value => <span data-testid="date">{value}</span>}
						</Show>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			expect(queryByTestId(container, 'complex-fallback')).not.toBeNull()
			expect(getByTestId(container, 'message').textContent).toBe('This article has not been published yet')
			expect(queryByTestId(container, 'action')).not.toBeNull()
		})
	})

	// ==================== Value Type Handling ====================

	describe('value type handling', () => {
		test('passes NonNullable<T> to children function', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().views())

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<Show field={article.views}>
							{value => {
								// value should be number, not number | null
								const doubled = value * 2
								return <span data-testid="views">{doubled}</span>
							}}
						</Show>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			// article-1 has views: 100, so doubled should be 200
			expect(getByTestId(container, 'views').textContent).toBe('200')
		})

		test('works with string fields', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().title())

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<Show field={article.title}>
							{value => <span data-testid="title">{value.toUpperCase()}</span>}
						</Show>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			expect(getByTestId(container, 'title').textContent).toBe('HELLO WORLD')
		})

		test('works with boolean fields', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().published())

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<Show field={article.published}>
							{value => <span data-testid="published">{value ? 'Yes' : 'No'}</span>}
						</Show>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			expect(getByTestId(container, 'published').textContent).toBe('Yes')
		})
	})

	// ==================== Reactivity ====================

	describe('reactivity', () => {
		test('updates when field value changes from null to value', async () => {
			const adapter = new MockAdapter({
				...createMockData(),
				Article: {
					'article-1': {
						...createMockData().Article['article-1'],
						publishedAt: null,
					},
				},
			}, { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().publishedAt())

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<Show
							field={article.publishedAt}
							fallback={<span data-testid="fallback">Not published</span>}
						>
							{value => <span data-testid="date">{value}</span>}
						</Show>
						<button
							data-testid="set-btn"
							onClick={() => article.publishedAt.setValue('2024-06-15')}
						>
							Set Date
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
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			// Initially null, shows fallback
			expect(queryByTestId(container, 'fallback')).not.toBeNull()
			expect(queryByTestId(container, 'date')).toBeNull()

			// Set a value
			act(() => {
				const button = getByTestId(container, 'set-btn') as HTMLButtonElement
				button.click()
			})

			// Now shows the value
			expect(queryByTestId(container, 'fallback')).toBeNull()
			expect(queryByTestId(container, 'date')).not.toBeNull()
			expect(getByTestId(container, 'date').textContent).toBe('2024-06-15')
		})

		test('updates when field value changes from value to null', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().publishedAt())

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<Show
							field={article.publishedAt}
							fallback={<span data-testid="fallback">Not published</span>}
						>
							{value => <span data-testid="date">{value}</span>}
						</Show>
						<button
							data-testid="clear-btn"
							onClick={() => article.publishedAt.setValue(null)}
						>
							Clear
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
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			// Initially has value
			expect(queryByTestId(container, 'date')).not.toBeNull()
			expect(queryByTestId(container, 'fallback')).toBeNull()

			// Clear the value
			act(() => {
				const button = getByTestId(container, 'clear-btn') as HTMLButtonElement
				button.click()
			})

			// Now shows fallback
			expect(queryByTestId(container, 'date')).toBeNull()
			expect(queryByTestId(container, 'fallback')).not.toBeNull()
		})
	})
})
