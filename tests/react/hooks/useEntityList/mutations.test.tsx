import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	SnapshotStore,
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
	age?: number | null
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
				age: scalar(),
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
				age: 30,
			},
			'author-2': {
				id: 'author-2',
				name: 'Jane Smith',
				email: 'jane@example.com',
				age: 25,
			},
		},
	}
}

describe('useEntityList mutations', () => {
	// ==================== isDirty Tracking ====================

	describe('isDirty tracking', () => {
		test('list isDirty is false initially', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList(authorDef, {}, a => a.id().name())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="dirty">{authors.isDirty ? 'true' : 'false'}</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'dirty')).not.toBeNull()
			})

			// Note: Currently list-level isDirty is always false
			// Individual item dirty tracking is done at the entity level
			expect(getByTestId(container, 'dirty').textContent).toBe('false')
		})
	})

	// ==================== Add with Partial Data ====================

	describe('add with partial data', () => {
		test('add with partial data sets specified fields only', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList(authorDef, {}, a => a.id().name().email().age())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				const lastAuthor = authors.items[authors.length - 1]

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<span data-testid="last-name">{lastAuthor?.name.value ?? 'null'}</span>
						<span data-testid="last-email">{lastAuthor?.email.value ?? 'null'}</span>
						<span data-testid="last-age">{lastAuthor?.age.value ?? 'null'}</span>
						<button
							data-testid="add-btn"
							onClick={() => authors.add({ name: 'Only Name' })}
						>
							Add
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
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			expect(getByTestId(container, 'count').textContent).toBe('2')

			act(() => {
				const button = getByTestId(container, 'add-btn') as HTMLButtonElement
				button.click()
			})

			expect(getByTestId(container, 'count').textContent).toBe('3')
			expect(getByTestId(container, 'last-name').textContent).toBe('Only Name')
			// Unspecified fields should be null
			expect(getByTestId(container, 'last-email').textContent).toBe('null')
			expect(getByTestId(container, 'last-age').textContent).toBe('null')
		})
	})

	// ==================== Add Returns Temp ID ====================

	describe('add returns temp ID', () => {
		test('add returns a temp ID that starts with __temp_', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			let addedId: string | undefined

			function TestComponent(): React.ReactElement {
				const authors = useEntityList(authorDef, {}, a => a.id().name())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="added-id">{addedId ?? 'none'}</span>
						<button
							data-testid="add-btn"
							onClick={() => {
								addedId = authors.add({ name: 'New Author' })
							}}
						>
							Add
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
				expect(queryByTestId(container, 'added-id')).not.toBeNull()
			})

			expect(getByTestId(container, 'added-id').textContent).toBe('none')

			act(() => {
				const button = getByTestId(container, 'add-btn') as HTMLButtonElement
				button.click()
			})

			expect(addedId).toBeDefined()
			expect(addedId).toMatch(/^__temp_/)
		})

		test('each add returns a unique temp ID', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const addedIds: string[] = []

			function TestComponent(): React.ReactElement {
				const authors = useEntityList(authorDef, {}, a => a.id().name())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{addedIds.length}</span>
						<button
							data-testid="add-btn"
							onClick={() => {
								addedIds.push(authors.add({ name: 'Author A' }))
								addedIds.push(authors.add({ name: 'Author B' }))
							}}
						>
							Add Two
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
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			act(() => {
				const button = getByTestId(container, 'add-btn') as HTMLButtonElement
				button.click()
			})

			expect(addedIds.length).toBe(2)
			expect(addedIds[0]).not.toBe(addedIds[1])
			expect(addedIds[0]).toMatch(/^__temp_/)
			expect(addedIds[1]).toMatch(/^__temp_/)
		})
	})

	// ==================== Remove Behavior ====================

	describe('remove behavior', () => {
		test('removing server entity schedules for deletion', async () => {
			const store = new SnapshotStore()
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList(authorDef, {}, a => a.id().name())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<button
							data-testid="remove-btn"
							onClick={() => authors.remove('author-1')}
						>
							Remove
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} store={store} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			expect(getByTestId(container, 'count').textContent).toBe('2')

			act(() => {
				const button = getByTestId(container, 'remove-btn') as HTMLButtonElement
				button.click()
			})

			expect(getByTestId(container, 'count').textContent).toBe('1')
			expect(store.isScheduledForDeletion('Author', 'author-1')).toBe(true)
		})

		test('removing temp entity completely removes from store', async () => {
			const store = new SnapshotStore()
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			let tempId: string | undefined

			function TestComponent(): React.ReactElement {
				const authors = useEntityList(authorDef, {}, a => a.id().name())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						<span data-testid="count">{authors.length}</span>
						<button
							data-testid="add-btn"
							onClick={() => {
								tempId = authors.add({ name: 'Temp Author' })
							}}
						>
							Add
						</button>
						<button
							data-testid="remove-btn"
							onClick={() => {
								if (tempId) authors.remove(tempId)
							}}
						>
							Remove
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} store={store} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'count')).not.toBeNull()
			})

			expect(getByTestId(container, 'count').textContent).toBe('2')

			// Add temp entity
			act(() => {
				const button = getByTestId(container, 'add-btn') as HTMLButtonElement
				button.click()
			})

			expect(getByTestId(container, 'count').textContent).toBe('3')
			expect(tempId).toBeDefined()
			expect(store.hasEntity('Author', tempId!)).toBe(true)

			// Remove temp entity
			act(() => {
				const button = getByTestId(container, 'remove-btn') as HTMLButtonElement
				button.click()
			})

			expect(getByTestId(container, 'count').textContent).toBe('2')
			// Temp entity should be completely removed, not scheduled for deletion
			expect(store.hasEntity('Author', tempId!)).toBe(false)
			expect(store.isScheduledForDeletion('Author', tempId!)).toBe(false)
		})
	})

	// ==================== Move Behavior ====================

	describe('move behavior', () => {
		test('move updates order correctly', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const authors = useEntityList(authorDef, {}, a => a.id().name())

				if (authors.isLoading) {
					return <div data-testid="loading">Loading...</div>
				}

				return (
					<div>
						{authors.items.map((author, index) => (
							<span key={author.id} data-testid={`author-${index}`}>
								{author.name.value}
							</span>
						))}
						<button
							data-testid="move-btn"
							onClick={() => authors.move(0, 1)}
						>
							Move
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
				expect(queryByTestId(container, 'author-0')).not.toBeNull()
			})

			expect(getByTestId(container, 'author-0').textContent).toBe('John Doe')
			expect(getByTestId(container, 'author-1').textContent).toBe('Jane Smith')

			act(() => {
				const button = getByTestId(container, 'move-btn') as HTMLButtonElement
				button.click()
			})

			expect(getByTestId(container, 'author-0').textContent).toBe('Jane Smith')
			expect(getByTestId(container, 'author-1').textContent).toBe('John Doe')
		})
	})

	// Note: Field mutation reactivity on list items would require useEntity for proper reactivity
	// since useEntityList creates new handles on each render and doesn't track individual item changes
})
