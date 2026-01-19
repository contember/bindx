import '../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	createBindx,
	MockAdapter,
	defineSchema,
	scalar,
	SnapshotStore,
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
			},
		},
	},
})

const { useEntityList } = createBindx(schema)

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
				email: 'john@example.com',
			},
			'author-2': {
				id: 'author-2',
				name: 'Jane Smith',
				email: 'jane@example.com',
			},
		},
	}
}

describe('useEntityList', () => {
	describe('add() method', () => {
		test('add() creates a new entity with temp ID and adds to list', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			let addedId: string | undefined

			function TestComponent(): React.ReactElement {
				const authors = useEntityList('Author', {}, a => a.id().name().email())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<ul data-testid="list">
							{authors.items.map(author => (
								<li key={author.id} data-testid={`author-${author.id}`}>
									{author.name.value ?? 'unnamed'}
								</li>
							))}
						</ul>
						<button
							data-testid="add-button"
							onClick={() => {
								addedId = authors.add({ name: 'New Author', email: 'new@example.com' })
							}}
						>
							Add
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			// Wait for data to load
			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			// Initially 2 authors
			expect(getByTestId(container, 'count').textContent).toBe('2')

			// Click add button
			act(() => {
				const button = getByTestId(container, 'add-button') as HTMLButtonElement
				button.click()
			})

			// Should now have 3 authors
			expect(getByTestId(container, 'count').textContent).toBe('3')

			// The added ID should be a temp ID
			expect(addedId).toBeDefined()
			expect(addedId).toMatch(/^__temp_/)

			// The new author should be in the list
			expect(queryByTestId(container, `author-${addedId}`)).not.toBeNull()
			expect(getByTestId(container, `author-${addedId}`).textContent).toBe('New Author')
		})

		test('add() without data creates entity with just temp ID', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			let addedId: string | undefined

			function TestComponent(): React.ReactElement {
				const authors = useEntityList('Author', {}, a => a.id().name())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<button
							data-testid="add-button"
							onClick={() => {
								addedId = authors.add()
							}}
						>
							Add
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			// Wait for data to load
			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			// Initially 2 authors
			expect(getByTestId(container, 'count').textContent).toBe('2')

			// Click add button
			act(() => {
				const button = getByTestId(container, 'add-button') as HTMLButtonElement
				button.click()
			})

			// Should now have 3 authors
			expect(getByTestId(container, 'count').textContent).toBe('3')

			// The added ID should be a temp ID
			expect(addedId).toBeDefined()
			expect(addedId).toMatch(/^__temp_/)
		})

		test('add() returns unique temp IDs for multiple adds', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const addedIds: string[] = []

			function TestComponent(): React.ReactElement {
				const authors = useEntityList('Author', {}, a => a.id().name())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<button
							data-testid="add-button"
							onClick={() => {
								addedIds.push(authors.add({ name: 'Author A' }))
								addedIds.push(authors.add({ name: 'Author B' }))
								addedIds.push(authors.add({ name: 'Author C' }))
							}}
						>
							Add Three
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			// Wait for data to load
			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			// Click add button
			act(() => {
				const button = getByTestId(container, 'add-button') as HTMLButtonElement
				button.click()
			})

			// Should now have 5 authors (2 + 3)
			expect(getByTestId(container, 'count').textContent).toBe('5')

			// All IDs should be unique
			expect(addedIds.length).toBe(3)
			const uniqueIds = new Set(addedIds)
			expect(uniqueIds.size).toBe(3)

			// All should be temp IDs
			for (const id of addedIds) {
				expect(id).toMatch(/^__temp_/)
			}
		})

		test('newly added entity has a working handle', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList('Author', {}, a => a.id().name().email())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				const lastAuthor = authors.items[authors.length - 1]

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<span data-testid="last-name">{lastAuthor?.name.value ?? 'none'}</span>
						<span data-testid="last-id">{lastAuthor?.id ?? 'none'}</span>
						<button
							data-testid="add-button"
							onClick={() => {
								authors.add({ name: 'Initial Name', email: 'test@example.com' })
							}}
						>
							Add
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			// Wait for data to load
			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			// Add new author
			act(() => {
				const button = getByTestId(container, 'add-button') as HTMLButtonElement
				button.click()
			})

			// Check the handle is working - we can access the name via handle
			expect(getByTestId(container, 'last-name').textContent).toBe('Initial Name')

			// The ID should be a temp ID
			expect(getByTestId(container, 'last-id').textContent).toMatch(/^__temp_/)
		})
	})

	describe('remove() method', () => {
		test('remove() removes an existing server entity and schedules for deletion', async () => {
			const store = new SnapshotStore()
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList('Author', {}, a => a.id().name().email())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<ul data-testid="list">
							{authors.items.map(author => (
								<li key={author.id} data-testid={`author-${author.id}`}>
									{author.name.value}
									<button
										data-testid={`remove-${author.id}`}
										onClick={() => authors.remove(author.id)}
									>
										Remove
									</button>
								</li>
							))}
						</ul>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} store={store}>
					<TestComponent />
				</BindxProvider>,
			)

			// Wait for data to load
			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			// Initially 2 authors
			expect(getByTestId(container, 'count').textContent).toBe('2')

			// Click remove on first author
			act(() => {
				const button = getByTestId(container, 'remove-author-1') as HTMLButtonElement
				button.click()
			})

			// Should now have 1 author
			expect(getByTestId(container, 'count').textContent).toBe('1')

			// The removed author should not be in the list
			expect(queryByTestId(container, 'author-author-1')).toBeNull()

			// The removed entity should be scheduled for deletion in the store
			expect(store.isScheduledForDeletion('Author', 'author-1')).toBe(true)
		})

		test('remove() cancels a newly added entity (not scheduled for deletion)', async () => {
			const store = new SnapshotStore()
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			let addedId: string | undefined

			function TestComponent(): React.ReactElement {
				const authors = useEntityList('Author', {}, a => a.id().name().email())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<ul data-testid="list">
							{authors.items.map(author => (
								<li key={author.id} data-testid={`author-${author.id}`}>
									{author.name.value ?? 'unnamed'}
									<button
										data-testid={`remove-${author.id}`}
										onClick={() => authors.remove(author.id)}
									>
										Remove
									</button>
								</li>
							))}
						</ul>
						<button
							data-testid="add-button"
							onClick={() => {
								addedId = authors.add({ name: 'New Author', email: 'new@example.com' })
							}}
						>
							Add
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} store={store}>
					<TestComponent />
				</BindxProvider>,
			)

			// Wait for data to load
			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			// Initially 2 authors
			expect(getByTestId(container, 'count').textContent).toBe('2')

			// Add a new author
			act(() => {
				const button = getByTestId(container, 'add-button') as HTMLButtonElement
				button.click()
			})

			// Should now have 3 authors
			expect(getByTestId(container, 'count').textContent).toBe('3')
			expect(addedId).toBeDefined()
			expect(addedId).toMatch(/^__temp_/)

			// Verify the entity exists in the store
			expect(store.hasEntity('Author', addedId!)).toBe(true)

			// Remove the newly added author
			act(() => {
				const button = getByTestId(container, `remove-${addedId}`) as HTMLButtonElement
				button.click()
			})

			// Should be back to 2 authors
			expect(getByTestId(container, 'count').textContent).toBe('2')

			// The entity should be removed from the store entirely (not just scheduled for deletion)
			expect(store.hasEntity('Author', addedId!)).toBe(false)
			expect(store.isScheduledForDeletion('Author', addedId!)).toBe(false)
		})

		test('remove() works correctly for multiple items', async () => {
			const store = new SnapshotStore()
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList('Author', {}, a => a.id().name().email())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<button
							data-testid="remove-all"
							onClick={() => {
								// Remove all items
								for (const author of [...authors.items]) {
									authors.remove(author.id)
								}
							}}
						>
							Remove All
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} store={store}>
					<TestComponent />
				</BindxProvider>,
			)

			// Wait for data to load
			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			// Initially 2 authors
			expect(getByTestId(container, 'count').textContent).toBe('2')

			// Remove all
			act(() => {
				const button = getByTestId(container, 'remove-all') as HTMLButtonElement
				button.click()
			})

			// Should be empty
			expect(getByTestId(container, 'count').textContent).toBe('0')

			// Both should be scheduled for deletion
			expect(store.isScheduledForDeletion('Author', 'author-1')).toBe(true)
			expect(store.isScheduledForDeletion('Author', 'author-2')).toBe(true)
		})
	})

	describe('move() method', () => {
		test('move() reorders items correctly (move forward)', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList('Author', {}, a => a.id().name().email())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<ul data-testid="list">
							{authors.items.map((author, index) => (
								<li key={author.id} data-testid={`author-${index}`}>
									{author.name.value}
								</li>
							))}
						</ul>
						<button
							data-testid="move-button"
							onClick={() => authors.move(0, 1)}
						>
							Move First to Last
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			// Wait for data to load
			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			// Initially John is first, Jane is second
			expect(getByTestId(container, 'author-0').textContent).toBe('John Doe')
			expect(getByTestId(container, 'author-1').textContent).toBe('Jane Smith')

			// Move first item to last position
			act(() => {
				const button = getByTestId(container, 'move-button') as HTMLButtonElement
				button.click()
			})

			// Now Jane is first, John is second
			expect(getByTestId(container, 'author-0').textContent).toBe('Jane Smith')
			expect(getByTestId(container, 'author-1').textContent).toBe('John Doe')
		})

		test('move() reorders items correctly (move backward)', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList('Author', {}, a => a.id().name().email())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<ul data-testid="list">
							{authors.items.map((author, index) => (
								<li key={author.id} data-testid={`author-${index}`}>
									{author.name.value}
								</li>
							))}
						</ul>
						<button
							data-testid="move-button"
							onClick={() => authors.move(1, 0)}
						>
							Move Last to First
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			// Wait for data to load
			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			// Initially John is first, Jane is second
			expect(getByTestId(container, 'author-0').textContent).toBe('John Doe')
			expect(getByTestId(container, 'author-1').textContent).toBe('Jane Smith')

			// Move last item to first position
			act(() => {
				const button = getByTestId(container, 'move-button') as HTMLButtonElement
				button.click()
			})

			// Now Jane is first, John is second
			expect(getByTestId(container, 'author-0').textContent).toBe('Jane Smith')
			expect(getByTestId(container, 'author-1').textContent).toBe('John Doe')
		})

		test('move() with invalid indices does nothing', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList('Author', {}, a => a.id().name().email())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<ul data-testid="list">
							{authors.items.map((author, index) => (
								<li key={author.id} data-testid={`author-${index}`}>
									{author.name.value}
								</li>
							))}
						</ul>
						<button
							data-testid="move-negative"
							onClick={() => authors.move(-1, 0)}
						>
							Move Negative
						</button>
						<button
							data-testid="move-out-of-bounds"
							onClick={() => authors.move(0, 10)}
						>
							Move Out of Bounds
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			// Wait for data to load
			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			// Try invalid moves - they should not change the order
			act(() => {
				const button = getByTestId(container, 'move-negative') as HTMLButtonElement
				button.click()
			})

			// Order unchanged
			expect(getByTestId(container, 'author-0').textContent).toBe('John Doe')
			expect(getByTestId(container, 'author-1').textContent).toBe('Jane Smith')

			act(() => {
				const button = getByTestId(container, 'move-out-of-bounds') as HTMLButtonElement
				button.click()
			})

			// Order still unchanged
			expect(getByTestId(container, 'author-0').textContent).toBe('John Doe')
			expect(getByTestId(container, 'author-1').textContent).toBe('Jane Smith')
		})

		test('move() with same index does nothing', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList('Author', {}, a => a.id().name().email())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<ul data-testid="list">
							{authors.items.map((author, index) => (
								<li key={author.id} data-testid={`author-${index}`}>
									{author.name.value}
								</li>
							))}
						</ul>
						<button
							data-testid="move-same"
							onClick={() => authors.move(0, 0)}
						>
							Move Same
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			// Wait for data to load
			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			// Move to same position
			act(() => {
				const button = getByTestId(container, 'move-same') as HTMLButtonElement
				button.click()
			})

			// Order unchanged
			expect(getByTestId(container, 'author-0').textContent).toBe('John Doe')
			expect(getByTestId(container, 'author-1').textContent).toBe('Jane Smith')
		})

		test('move() works with newly added entities', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList('Author', {}, a => a.id().name().email())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<ul data-testid="list">
							{authors.items.map((author, index) => (
								<li key={author.id} data-testid={`author-${index}`}>
									{author.name.value ?? 'unnamed'}
								</li>
							))}
						</ul>
						<button
							data-testid="add-button"
							onClick={() => {
								authors.add({ name: 'New Author', email: 'new@example.com' })
							}}
						>
							Add
						</button>
						<button
							data-testid="move-new-to-first"
							onClick={() => authors.move(2, 0)}
						>
							Move New to First
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			// Wait for data to load
			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			// Initially 2 authors
			expect(getByTestId(container, 'count').textContent).toBe('2')

			// Add new author
			act(() => {
				const button = getByTestId(container, 'add-button') as HTMLButtonElement
				button.click()
			})

			// Should have 3 authors, new one at end
			expect(getByTestId(container, 'count').textContent).toBe('3')
			expect(getByTestId(container, 'author-0').textContent).toBe('John Doe')
			expect(getByTestId(container, 'author-1').textContent).toBe('Jane Smith')
			expect(getByTestId(container, 'author-2').textContent).toBe('New Author')

			// Move the new author to the first position
			act(() => {
				const button = getByTestId(container, 'move-new-to-first') as HTMLButtonElement
				button.click()
			})

			// New author should now be first
			expect(getByTestId(container, 'author-0').textContent).toBe('New Author')
			expect(getByTestId(container, 'author-1').textContent).toBe('John Doe')
			expect(getByTestId(container, 'author-2').textContent).toBe('Jane Smith')
		})
	})
})
