import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, isTempId, useEntity } from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, entityDefs, schema } from './setup'

afterEach(() => {
	cleanup()
})

describe('HasMany Relations - Persistence', () => {
	test('add() creates new entity with temp ID and adds to items', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.id().title().tags(t => t.id().name()))
			if (article.isLoading) return <div data-testid="loading">Loading</div>
			if (article.isError || article.isNotFound) return <div>Error</div>

			const tagIds = article.tags.items.map(t => t.id).join(',')
			const isDirty = article.tags.isDirty ? 'dirty' : 'clean'
			const count = article.tags.length

			return (
				<div>
					<span data-testid="tag-ids">{tagIds}</span>
					<span data-testid="tag-count">{count}</span>
					<span data-testid="is-dirty">{isDirty}</span>
					<button data-testid="add-tag" onClick={() => article.tags.add({ name: 'New Tag' })}>
						Add Tag
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
			expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
		expect(getByTestId(container, 'tag-count').textContent).toBe('2')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')

		act(() => {
			;(getByTestId(container, 'add-tag') as HTMLButtonElement).click()
		})

		const tagIds = getByTestId(container, 'tag-ids').textContent!
		const parts = tagIds.split(',')
		expect(parts.length).toBe(3)
		expect(parts[0]).toBe('tag-1')
		expect(parts[1]).toBe('tag-2')
		expect(isTempId(parts[2]!)).toBe(true)
		expect(getByTestId(container, 'tag-count').textContent).toBe('3')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
	})

	test('add() returns the new entity temp ID', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		let addedId: string | null = null

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.id().tags(t => t.id()))
			if (article.isLoading) return <div data-testid="loading">Loading</div>
			if (article.isError || article.isNotFound) return <div>Error</div>

			return (
				<div>
					<span data-testid="added-id">{addedId ?? 'none'}</span>
					<button
						data-testid="add-tag"
						onClick={() => {
							addedId = article.tags.add({ name: 'New Tag' })
						}}
					>
						Add Tag
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
			;(getByTestId(container, 'add-tag') as HTMLButtonElement).click()
		})

		expect(addedId).not.toBeNull()
		expect(isTempId(addedId!)).toBe(true)
	})

	test('add() multiple times - all appear in list', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-empty' } }, e => e.id().tags(t => t.id()))
			if (article.isLoading) return <div data-testid="loading">Loading</div>
			if (article.isError || article.isNotFound) return <div>Error</div>

			return (
				<div>
					<span data-testid="tag-count">{article.tags.length}</span>
					<button data-testid="add-tag" onClick={() => article.tags.add()}>
						Add Tag
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
			expect(queryByTestId(container, 'tag-count')).not.toBeNull()
		})

		expect(getByTestId(container, 'tag-count').textContent).toBe('0')

		act(() => {
			;(getByTestId(container, 'add-tag') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'tag-count').textContent).toBe('1')

		act(() => {
			;(getByTestId(container, 'add-tag') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'tag-count').textContent).toBe('2')

		act(() => {
			;(getByTestId(container, 'add-tag') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'tag-count').textContent).toBe('3')
	})

	test('remove() on new entity (temp ID) - cancels the add', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		let addedId: string | null = null

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.id().tags(t => t.id()))
			if (article.isLoading) return <div data-testid="loading">Loading</div>
			if (article.isError || article.isNotFound) return <div>Error</div>

			return (
				<div>
					<span data-testid="tag-count">{article.tags.length}</span>
					<span data-testid="is-dirty">{article.tags.isDirty ? 'dirty' : 'clean'}</span>
					<button
						data-testid="add-tag"
						onClick={() => {
							addedId = article.tags.add()
						}}
					>
						Add Tag
					</button>
					<button
						data-testid="remove-added"
						onClick={() => {
							if (addedId) article.tags.remove(addedId)
						}}
					>
						Remove Added
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
			expect(queryByTestId(container, 'tag-count')).not.toBeNull()
		})

		expect(getByTestId(container, 'tag-count').textContent).toBe('2')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')

		act(() => {
			;(getByTestId(container, 'add-tag') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'tag-count').textContent).toBe('3')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')

		act(() => {
			;(getByTestId(container, 'remove-added') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'tag-count').textContent).toBe('2')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
	})

	test('remove() on server entity - plans disconnect', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.id().tags(t => t.id()))
			if (article.isLoading) return <div data-testid="loading">Loading</div>
			if (article.isError || article.isNotFound) return <div>Error</div>

			const tagIds = article.tags.items.map(t => t.id).join(',')

			return (
				<div>
					<span data-testid="tag-ids">{tagIds}</span>
					<span data-testid="tag-count">{article.tags.length}</span>
					<span data-testid="is-dirty">{article.tags.isDirty ? 'dirty' : 'clean'}</span>
					<button data-testid="remove-tag-1" onClick={() => article.tags.remove('tag-1')}>
						Remove tag-1
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
			expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')

		act(() => {
			;(getByTestId(container, 'remove-tag-1') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-2')
		expect(getByTestId(container, 'tag-count').textContent).toBe('1')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
	})

	test('move(0, 1) swaps first two items', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.id().tags(t => t.id().name()))
			if (article.isLoading) return <div data-testid="loading">Loading</div>
			if (article.isError || article.isNotFound) return <div>Error</div>

			const tagIds = article.tags.items.map(t => t.id).join(',')

			return (
				<div>
					<span data-testid="tag-ids">{tagIds}</span>
					<span data-testid="is-dirty">{article.tags.isDirty ? 'dirty' : 'clean'}</span>
					<button data-testid="move-0-1" onClick={() => article.tags.move(0, 1)}>
						Move 0 to 1
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
			expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')

		act(() => {
			;(getByTestId(container, 'move-0-1') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-2,tag-1')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
	})

	test('move() same position - no change', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.id().tags(t => t.id()))
			if (article.isLoading) return <div data-testid="loading">Loading</div>
			if (article.isError || article.isNotFound) return <div>Error</div>

			const tagIds = article.tags.items.map(t => t.id).join(',')

			return (
				<div>
					<span data-testid="tag-ids">{tagIds}</span>
					<span data-testid="is-dirty">{article.tags.isDirty ? 'dirty' : 'clean'}</span>
					<button data-testid="move-0-0" onClick={() => article.tags.move(0, 0)}>
						Move 0 to 0
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
			expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')

		act(() => {
			;(getByTestId(container, 'move-0-0') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
	})

	test('reset() restores original order', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent() {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e => e.id().tags(t => t.id()))
			if (article.isLoading) return <div data-testid="loading">Loading</div>
			if (article.isError || article.isNotFound) return <div>Error</div>

			const tagIds = article.tags.items.map(t => t.id).join(',')

			return (
				<div>
					<span data-testid="tag-ids">{tagIds}</span>
					<span data-testid="is-dirty">{article.tags.isDirty ? 'dirty' : 'clean'}</span>
					<button data-testid="move-0-1" onClick={() => article.tags.move(0, 1)}>
						Move 0 to 1
					</button>
					<button data-testid="reset" onClick={() => article.tags.reset()}>
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
			expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')

		act(() => {
			;(getByTestId(container, 'move-0-1') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-2,tag-1')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')

		act(() => {
			;(getByTestId(container, 'reset') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
	})
})
