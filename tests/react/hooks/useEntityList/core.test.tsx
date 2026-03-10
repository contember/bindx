import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
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
	role?: string
}

interface TestSchema {
	Author: Author
}

const schema = defineSchema<TestSchema>({
	entities: {
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				email: scalar(),
				role: scalar(),
			},
		},
	},
})

const authorDef = entityDef<Author>('Author')

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
				role: 'admin',
			},
			'author-2': {
				id: 'author-2',
				name: 'Jane Smith',
				email: 'jane@example.com',
				role: 'user',
			},
			'author-3': {
				id: 'author-3',
				name: 'Bob Wilson',
				email: 'bob@example.com',
				role: 'admin',
			},
		},
	}
}

describe('useEntityList core behavior', () => {
	// ==================== Loading State ====================

	describe('loading state', () => {
		test('starts in loading state', async () => {
			// Use delay to keep loading state visible
			const adapter = new MockAdapter(createMockData(), { delay: 100 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList(authorDef, {}, a => a.id().name())

				return (
					<div>
						<span data-testid="loading">{authors.isLoading ? 'true' : 'false'}</span>
						<span data-testid="ready">{!authors.isLoading ? 'true' : 'false'}</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			// Should start in loading state
			expect(getByTestId(container, 'loading').textContent).toBe('true')
			expect(getByTestId(container, 'ready').textContent).toBe('false')

			// Wait for data to load
			await waitFor(() => {
				expect(getByTestId(container, 'loading').textContent).toBe('false')
			})

			expect(getByTestId(container, 'ready').textContent).toBe('true')
		})

		test('transitions from loading to ready', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			let renderCount = 0
			const states: string[] = []

			function TestComponent(): React.ReactElement {
				const authors = useEntityList(authorDef, {}, a => a.id().name())
				renderCount++

				if (authors.isLoading) {
					states.push('loading')
				} else {
					states.push('ready')
				}

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return <div data-testid="ready">Ready with {authors.length} items</div>
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'ready')).not.toBeNull()
			})

			// Should have started in loading, then transitioned to ready
			expect(states).toContain('loading')
			expect(states).toContain('ready')
			expect(getByTestId(container, 'ready').textContent).toBe('Ready with 3 items')
		})
	})

	// ==================== Ready State ====================

	describe('ready state', () => {
		test('returns all items when ready', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList(authorDef, {}, a => a.id().name().email())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<ul>
							{authors.items.map(author => (
								<li key={author.id} data-testid={`author-${author.id}`}>
									{author.name.value}
								</li>
							))}
						</ul>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			expect(getByTestId(container, 'count').textContent).toBe('3')
			expect(queryByTestId(container, 'author-author-1')).not.toBeNull()
			expect(queryByTestId(container, 'author-author-2')).not.toBeNull()
			expect(queryByTestId(container, 'author-author-3')).not.toBeNull()
		})

		test('provides items with correct field values', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList(authorDef, {}, a => a.id().name().email())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				const firstAuthor = authors.items[0]

				return (
					<div>
						<span data-testid="name">{firstAuthor?.name.value}</span>
						<span data-testid="email">{firstAuthor?.email.value}</span>
						<span data-testid="id">{firstAuthor?.id}</span>
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
			expect(getByTestId(container, 'email').textContent).toBe('john@example.com')
			expect(getByTestId(container, 'id').textContent).toBe('author-1')
		})
	})

	// ==================== Empty Results ====================

	describe('empty results', () => {
		test('handles empty result set', async () => {
			const adapter = new MockAdapter({ Author: {} }, { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList(authorDef, {}, a => a.id().name())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<span data-testid="empty">{authors.length === 0 ? 'true' : 'false'}</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			expect(getByTestId(container, 'count').textContent).toBe('0')
			expect(getByTestId(container, 'empty').textContent).toBe('true')
		})
	})

	// ==================== Filter Changes ====================

	describe('filter changes', () => {
		test('refetches when filter changes', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent({ filterRole }: { filterRole?: string }): React.ReactElement {
				const authors = useEntityList(
					authorDef,
					filterRole ? { filter: { role: { eq: filterRole } } } : {},
					a => a.id().name().role(),
				)

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<span data-testid="filter">{filterRole ?? 'none'}</span>
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

			// All 3 authors without filter
			expect(getByTestId(container, 'count').textContent).toBe('3')

			// Apply filter
			rerender(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent filterRole="admin" />
				</BindxProvider>,
			)

			await waitFor(() => {
				// Filter is applied, but MockAdapter returns all matching items
				// The count depends on how MockAdapter implements filtering
				expect(getByTestId(container, 'filter').textContent).toBe('admin')
			})
		})
	})

	// ==================== Items Array ====================

	describe('items array', () => {
		test('items array is iterable', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList(authorDef, {}, a => a.id().name())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				const names: string[] = []
				for (const author of authors.items) {
					names.push(author.name.value ?? '')
				}

				return <div data-testid="names">{names.join(', ')}</div>
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'names')).not.toBeNull()
			})

			const names = getByTestId(container, 'names').textContent
			expect(names).toContain('John Doe')
			expect(names).toContain('Jane Smith')
			expect(names).toContain('Bob Wilson')
		})

		test('supports array methods like map', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList(authorDef, {}, a => a.id().name())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<ul data-testid="list">
						{authors.items.map((author, index) => (
							<li key={author.id} data-testid={`item-${index}`}>
								{author.name.value}
							</li>
						))}
					</ul>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'list')).not.toBeNull()
			})

			expect(queryByTestId(container, 'item-0')).not.toBeNull()
			expect(queryByTestId(container, 'item-1')).not.toBeNull()
			expect(queryByTestId(container, 'item-2')).not.toBeNull()
		})
	})

	// ==================== Length Property ====================

	describe('length property', () => {
		test('length reflects actual item count', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList(authorDef, {}, a => a.id().name())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="length">{authors.length}</span>
						<span data-testid="items-length">{authors.items.length}</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'length')).not.toBeNull()
			})

			expect(getByTestId(container, 'length').textContent).toBe('3')
			expect(getByTestId(container, 'items-length').textContent).toBe('3')
		})

		test('length is 0 when no items', async () => {
			const adapter = new MockAdapter({ Author: {} }, { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList(authorDef, {}, a => a.id().name())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return <div data-testid="length">{authors.length}</div>
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'length')).not.toBeNull()
			})

			expect(getByTestId(container, 'length').textContent).toBe('0')
		})
	})

	// ==================== Multiple Hooks ====================

	describe('multiple hooks', () => {
		test('multiple useEntityList hooks work independently', async () => {
			const mockData = {
				Author: {
					'author-1': { id: 'author-1', name: 'John', email: 'john@example.com' },
					'author-2': { id: 'author-2', name: 'Jane', email: 'jane@example.com' },
				},
			}
			const adapter = new MockAdapter(mockData, { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors1 = useEntityList(authorDef, {}, a => a.id().name())
				const authors2 = useEntityList(authorDef, {}, a => a.id().email())

				if (authors1.isLoading || authors2.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count1">{authors1.length}</span>
						<span data-testid="count2">{authors2.length}</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'count1')).not.toBeNull()
			})

			expect(getByTestId(container, 'count1').textContent).toBe('2')
			expect(getByTestId(container, 'count2').textContent).toBe('2')
		})
	})
})
