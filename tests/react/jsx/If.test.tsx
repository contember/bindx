import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	cond,
	If,
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

describe('If component', () => {
	// ==================== Boolean Conditions ====================

	describe('boolean conditions', () => {
		test('renders then branch when condition is true', async () => {
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
						<If
							condition={true}
							then={<span data-testid="then-branch">Then rendered</span>}
							else={<span data-testid="else-branch">Else rendered</span>}
						/>
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

			expect(queryByTestId(container, 'then-branch')).not.toBeNull()
			expect(queryByTestId(container, 'else-branch')).toBeNull()
		})

		test('renders else branch when condition is false', async () => {
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
						<If
							condition={false}
							then={<span data-testid="then-branch">Then rendered</span>}
							else={<span data-testid="else-branch">Else rendered</span>}
						/>
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

			expect(queryByTestId(container, 'then-branch')).toBeNull()
			expect(queryByTestId(container, 'else-branch')).not.toBeNull()
		})

		test('renders nothing when condition is false and no else provided', async () => {
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
					<div data-testid="wrapper">
						<If
							condition={false}
							then={<span data-testid="then-branch">Then rendered</span>}
						/>
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

			expect(queryByTestId(container, 'then-branch')).toBeNull()
			const wrapper = getByTestId(container, 'wrapper')
			expect(wrapper.textContent).toBe('')
		})
	})

	// ==================== FieldRef Conditions ====================

	describe('FieldRef conditions', () => {
		test('renders then branch when field value is truthy', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().title().published())

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<If
							condition={cond.isTruthy(article.published)}
							then={<span data-testid="then-branch">Published</span>}
							else={<span data-testid="else-branch">Not published</span>}
						/>
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

			// article-1 has published: true
			expect(queryByTestId(container, 'then-branch')).not.toBeNull()
			expect(queryByTestId(container, 'else-branch')).toBeNull()
		})

		test('renders else branch when field value is falsy', async () => {
			const adapter = new MockAdapter({
				...createMockData(),
				Article: {
					...createMockData().Article,
					'article-1': {
						...createMockData().Article['article-1'],
						published: false,
					},
				},
			}, { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().title().published())

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<If
							condition={cond.isTruthy(article.published)}
							then={<span data-testid="then-branch">Published</span>}
							else={<span data-testid="else-branch">Not published</span>}
						/>
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

			expect(queryByTestId(container, 'then-branch')).toBeNull()
			expect(queryByTestId(container, 'else-branch')).not.toBeNull()
		})

		test('treats null field value as falsy', async () => {
			const adapter = new MockAdapter({
				...createMockData(),
				Article: {
					'article-1': {
						...createMockData().Article['article-1'],
						published: null,
					},
				},
			}, { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().title().published())

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<If
							condition={cond.isTruthy(article.published)}
							then={<span data-testid="then-branch">Published</span>}
							else={<span data-testid="else-branch">Not published</span>}
						/>
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

			expect(queryByTestId(container, 'then-branch')).toBeNull()
			expect(queryByTestId(container, 'else-branch')).not.toBeNull()
		})
	})

	// ==================== Condition DSL ====================

	describe('condition DSL', () => {
		test('renders then branch when eq condition is true', async () => {
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
						<If
							condition={cond.eq(article.title, 'Hello World')}
							then={<span data-testid="then-branch">Title matches</span>}
							else={<span data-testid="else-branch">Title does not match</span>}
						/>
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

			// article-1 has title: 'Hello World'
			expect(queryByTestId(container, 'then-branch')).not.toBeNull()
			expect(queryByTestId(container, 'else-branch')).toBeNull()
		})

		test('renders else branch when eq condition is false', async () => {
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
						<If
							condition={cond.eq(article.title, 'Different Title')}
							then={<span data-testid="then-branch">Title matches</span>}
							else={<span data-testid="else-branch">Title does not match</span>}
						/>
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

			// article-1 has title: 'Hello World', not 'Different Title'
			expect(queryByTestId(container, 'then-branch')).toBeNull()
			expect(queryByTestId(container, 'else-branch')).not.toBeNull()
		})

		test('works with isNull condition', async () => {
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
						<If
							condition={cond.isNull(article.publishedAt)}
							then={<span data-testid="then-branch">Not published yet</span>}
							else={<span data-testid="else-branch">Already published</span>}
						/>
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

			expect(queryByTestId(container, 'then-branch')).not.toBeNull()
			expect(queryByTestId(container, 'else-branch')).toBeNull()
		})

		test('works with complex and/or conditions', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().title().published())

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<If
							condition={cond.and(
								cond.eq(article.title, 'Hello World'),
								cond.isTruthy(article.published),
							)}
							then={<span data-testid="then-branch">Title matches and published</span>}
							else={<span data-testid="else-branch">Condition not met</span>}
						/>
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

			// article-1 has title: 'Hello World' and published: true
			expect(queryByTestId(container, 'then-branch')).not.toBeNull()
			expect(queryByTestId(container, 'else-branch')).toBeNull()
		})

		test('works with not condition', async () => {
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
						<If
							condition={cond.not(cond.eq(article.title, 'Archived Article'))}
							then={<span data-testid="then-branch">Not archived</span>}
							else={<span data-testid="else-branch">Archived</span>}
						/>
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

			// article-1 has title: 'Hello World', not 'Archived Article'
			expect(queryByTestId(container, 'then-branch')).not.toBeNull()
			expect(queryByTestId(container, 'else-branch')).toBeNull()
		})
	})

	// ==================== Reactivity ====================

	describe('reactivity', () => {
		test('updates when underlying field changes', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().title().published())

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<If
							condition={cond.isTruthy(article.published)}
							then={<span data-testid="status">Published</span>}
							else={<span data-testid="status">Not published</span>}
						/>
						<button
							data-testid="toggle-btn"
							onClick={() => article.published.setValue(!article.published.value)}
						>
							Toggle
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

			// Initially published is true
			expect(getByTestId(container, 'status').textContent).toBe('Published')

			// Toggle to false
			act(() => {
				const button = getByTestId(container, 'toggle-btn') as HTMLButtonElement
				button.click()
			})

			expect(getByTestId(container, 'status').textContent).toBe('Not published')

			// Toggle back to true
			act(() => {
				const button = getByTestId(container, 'toggle-btn') as HTMLButtonElement
				button.click()
			})

			expect(getByTestId(container, 'status').textContent).toBe('Published')
		})
	})

	// ==================== Branch Content ====================

	describe('branch content', () => {
		test('renders complex JSX in then branch', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().title().published())

				if (article.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<If
							condition={true}
							then={
								<div data-testid="complex-then">
									<h1 data-testid="title">{article.title.value}</h1>
									<span data-testid="published">{article.published.value ? 'Yes' : 'No'}</span>
								</div>
							}
						/>
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

			expect(queryByTestId(container, 'complex-then')).not.toBeNull()
			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
			expect(getByTestId(container, 'published').textContent).toBe('Yes')
		})

		test('renders complex JSX in else branch', async () => {
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
						<If
							condition={false}
							then={<span data-testid="then">Then</span>}
							else={
								<div data-testid="complex-else">
									<p data-testid="fallback">No content available</p>
									<button data-testid="action">Create</button>
								</div>
							}
						/>
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

			expect(queryByTestId(container, 'then')).toBeNull()
			expect(queryByTestId(container, 'complex-else')).not.toBeNull()
			expect(getByTestId(container, 'fallback').textContent).toBe('No content available')
		})
	})
})
