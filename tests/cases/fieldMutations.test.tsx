import '../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	useEntity,
} from '@contember/bindx-react'

afterEach(() => {
	cleanup()
})

// Test types
interface Article {
	id: string
	title: string
	content: string
	views: number
}

interface TestSchema {
	Article: Article
}

const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				content: scalar(),
				views: scalar(),
			},
		},
	},
})

const articleDef = entityDef<Article>('Article')

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
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'Original Title',
				content: 'Original Content',
				views: 100,
			},
		},
	}
}

describe('Field Mutations', () => {
	describe('Basic setValue Operations', () => {
		test('1. setValue on scalar field - value should change, isDirty=true', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(articleDef, { by: { id: 'article-1' } }, e =>
					e.id().title().content(),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="title">{article.title.value}</span>
						<span data-testid="is-dirty">{article.title.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="set-title"
							onClick={() => article.title.setValue('New Title')}
						>
							Set Title
						</button>
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

			// Initially
			expect(getByTestId(container, 'title').textContent).toBe('Original Title')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')

			// Set new value
			act(() => {
				;(getByTestId(container, 'set-title') as HTMLButtonElement).click()
			})

			// Should be updated and dirty
			expect(getByTestId(container, 'title').textContent).toBe('New Title')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
		})

		test('2. setValue back to original - field state depends on deep equality', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(articleDef, { by: { id: 'article-1' } }, e =>
					e.id().title(),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="title">{article.title.value}</span>
						<span data-testid="is-dirty">{article.title.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="set-new"
							onClick={() => article.title.setValue('New Title')}
						>
							Set New
						</button>
						<button
							data-testid="set-original"
							onClick={() => article.title.setValue('Original Title')}
						>
							Set Original
						</button>
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

			// Set new value
			act(() => {
				;(getByTestId(container, 'set-new') as HTMLButtonElement).click()
			})

			expect(getByTestId(container, 'title').textContent).toBe('New Title')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')

			// Set back to original
			act(() => {
				;(getByTestId(container, 'set-original') as HTMLButtonElement).click()
			})

			// Value should be original
			expect(getByTestId(container, 'title').textContent).toBe('Original Title')
			// isDirty depends on whether system detects value equals server value
			// Current implementation uses deep equality, so should be clean
			expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
		})

		test('3. Multiple setValue on same field - last value wins', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(articleDef, { by: { id: 'article-1' } }, e =>
					e.id().title(),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="title">{article.title.value}</span>
						<button
							data-testid="set-a"
							onClick={() => article.title.setValue('Title A')}
						>
							Set A
						</button>
						<button
							data-testid="set-b"
							onClick={() => article.title.setValue('Title B')}
						>
							Set B
						</button>
						<button
							data-testid="set-c"
							onClick={() => article.title.setValue('Title C')}
						>
							Set C
						</button>
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

			// Set multiple values
			act(() => {
				;(getByTestId(container, 'set-a') as HTMLButtonElement).click()
			})
			act(() => {
				;(getByTestId(container, 'set-b') as HTMLButtonElement).click()
			})
			act(() => {
				;(getByTestId(container, 'set-c') as HTMLButtonElement).click()
			})

			// Last value should win
			expect(getByTestId(container, 'title').textContent).toBe('Title C')
		})

		test('4. setValue on number field - works correctly', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(articleDef, { by: { id: 'article-1' } }, e =>
					e.id().views(),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="views">{article.views.value}</span>
						<span data-testid="is-dirty">{article.views.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="increment"
							onClick={() => article.views.setValue((article.views.value ?? 0) + 1)}
						>
							Increment
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'views')).not.toBeNull()
			})

			expect(getByTestId(container, 'views').textContent).toBe('100')

			act(() => {
				;(getByTestId(container, 'increment') as HTMLButtonElement).click()
			})

			expect(getByTestId(container, 'views').textContent).toBe('101')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
		})
	})

	describe('Reset Operations', () => {
		test('5. Reset after setValue - should return to original value', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(articleDef, { by: { id: 'article-1' } }, e =>
					e.id().title().content(),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="title">{article.title.value}</span>
						<span data-testid="content">{article.content.value}</span>
						<span data-testid="entity-dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="set-title"
							onClick={() => article.title.setValue('New Title')}
						>
							Set Title
						</button>
						<button
							data-testid="set-content"
							onClick={() => article.content.setValue('New Content')}
						>
							Set Content
						</button>
						<button data-testid="reset" onClick={() => article.reset()}>
							Reset
						</button>
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

			// Set new values
			act(() => {
				;(getByTestId(container, 'set-title') as HTMLButtonElement).click()
			})
			act(() => {
				;(getByTestId(container, 'set-content') as HTMLButtonElement).click()
			})

			expect(getByTestId(container, 'title').textContent).toBe('New Title')
			expect(getByTestId(container, 'content').textContent).toBe('New Content')
			expect(getByTestId(container, 'entity-dirty').textContent).toBe('dirty')

			// Reset
			act(() => {
				;(getByTestId(container, 'reset') as HTMLButtonElement).click()
			})

			// Should be back to original
			expect(getByTestId(container, 'title').textContent).toBe('Original Title')
			expect(getByTestId(container, 'content').textContent).toBe('Original Content')
			expect(getByTestId(container, 'entity-dirty').textContent).toBe('clean')
		})
	})

	describe('Server Value', () => {
		test('6. serverValue should remain constant after setValue', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(articleDef, { by: { id: 'article-1' } }, e =>
					e.id().title(),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError || article.isNotFound) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="value">{article.title.value}</span>
						<span data-testid="server-value">{article.title.serverValue}</span>
						<button
							data-testid="set-title"
							onClick={() => article.title.setValue('New Title')}
						>
							Set Title
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'value')).not.toBeNull()
			})

			// Initially both should be the same
			expect(getByTestId(container, 'value').textContent).toBe('Original Title')
			expect(getByTestId(container, 'server-value').textContent).toBe('Original Title')

			// Set new value
			act(() => {
				;(getByTestId(container, 'set-title') as HTMLButtonElement).click()
			})

			// value should change, serverValue should not
			expect(getByTestId(container, 'value').textContent).toBe('New Title')
			expect(getByTestId(container, 'server-value').textContent).toBe('Original Title')
		})
	})
})
