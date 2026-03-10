import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import { BindxProvider, MockAdapter, useEntity } from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, entityDefs, schema, type TestComponentProps } from './setup'

afterEach(() => {
	cleanup()
})

// Reusable test component
function HasManyTestComponent({ articleId }: TestComponentProps): React.ReactElement {
	const article = useEntity(entityDefs.Article, { by: { id: articleId } }, e =>
		e.id().title().tags(t => t.id().name().color()),
	)

	if (article.isLoading) {
		return <div>Loading...</div>
	}
	if (article.isError || article.isNotFound) {
		return <div data-testid="loading">Loading...</div>
	}

	const tagIds = article.tags.items.map(t => t.id).sort().join(',')

	return (
		<div>
			<span data-testid="tag-ids">{tagIds}</span>
			<span data-testid="tag-count">{article.tags.length}</span>
			<span data-testid="is-dirty">{article.tags.isDirty ? 'dirty' : 'clean'}</span>
			<ul data-testid="tags">
				{article.tags.items.map(tag => (
					<li key={tag.id} data-testid={`tag-${tag.id}`}>
						{tag.$fields.name.value}
						<button
							data-testid={`disconnect-${tag.id}`}
							onClick={() => article.tags.disconnect(tag.id)}
						>
							×
						</button>
					</li>
				))}
			</ul>
			<button data-testid="connect-tag-3" onClick={() => article.tags.connect('tag-3')}>
				Connect tag-3
			</button>
			<button data-testid="connect-tag-4" onClick={() => article.tags.connect('tag-4')}>
				Connect tag-4
			</button>
		</div>
	)
}

describe('HasMany Relations - Basic Operations', () => {
	test('1. Connect existing tag - should appear in items with isDirty=true', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<HasManyTestComponent articleId="article-1" />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
		})

		// Initially 2 tags
		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')

		// Connect tag-3
		act(() => {
			;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
		})

		// Now should have 3 tags and be dirty
		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2,tag-3')
		expect(getByTestId(container, 'tag-count').textContent).toBe('3')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
	})

	test('2. Disconnect existing tag - should disappear from items with isDirty=true', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<HasManyTestComponent articleId="article-1" />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
		})

		// Initially 2 tags
		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')

		// Disconnect tag-1
		act(() => {
			;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
		})

		// Now should have 1 tag and be dirty
		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-2')
		expect(getByTestId(container, 'tag-count').textContent).toBe('1')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
	})

	test('3. Connect + then Disconnect same tag - tag should NOT appear', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<HasManyTestComponent articleId="article-1" />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
		})

		// Connect tag-3
		act(() => {
			;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2,tag-3')

		// Disconnect tag-3
		act(() => {
			;(getByTestId(container, 'disconnect-tag-3') as HTMLButtonElement).click()
		})

		// Should be back to 2 tags
		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
		expect(getByTestId(container, 'tag-count').textContent).toBe('2')
	})

	test('4. Disconnect + then Connect same tag - tag should remain in items', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().tags(t => t.id().name()),
			)

			if (article.isLoading) {
				return <div>Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div data-testid="loading">Loading...</div>
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
						data-testid="connect-tag-1"
						onClick={() => article.tags.connect('tag-1')}
					>
						Connect tag-1
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

		// Disconnect tag-1
		act(() => {
			;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-2')

		// Reconnect tag-1
		act(() => {
			;(getByTestId(container, 'connect-tag-1') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
	})

	test('5. Multiple connect of same tag - should appear only once', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<HasManyTestComponent articleId="article-1" />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
		})

		// Connect tag-3 multiple times
		act(() => {
			;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
		})
		act(() => {
			;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
		})
		act(() => {
			;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
		})

		// Should still have only 3 tags
		expect(getByTestId(container, 'tag-count').textContent).toBe('3')
		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2,tag-3')
	})

	test('6. Multiple disconnect of same tag - should handle gracefully', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().tags(t => t.id().name()),
			)

			if (article.isLoading) {
				return <div>Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div data-testid="loading">Loading...</div>
			}

			return (
				<div>
					<span data-testid="tag-count">{article.tags.length}</span>
					<button
						data-testid="disconnect-tag-1"
						onClick={() => article.tags.disconnect('tag-1')}
					>
						Disconnect tag-1
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

		// Disconnect tag-1
		act(() => {
			;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-count').textContent).toBe('1')

		// Disconnect again
		act(() => {
			;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
		})

		// Should still have 1 tag
		expect(getByTestId(container, 'tag-count').textContent).toBe('1')
	})
})

describe('HasMany Relations - Combined Operations', () => {
	test('7. Connect A, Disconnect B - A added, B removed', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<HasManyTestComponent articleId="article-1" />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
		})

		// Connect tag-3
		act(() => {
			;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
		})

		// Disconnect tag-1
		act(() => {
			;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-2,tag-3')
		expect(getByTestId(container, 'tag-count').textContent).toBe('2')
	})

	test('8. Disconnect all tags - items should be empty with isDirty=true', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<HasManyTestComponent articleId="article-1" />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
		})

		act(() => {
			;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
		})
		act(() => {
			;(getByTestId(container, 'disconnect-tag-2') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-count').textContent).toBe('0')
		expect(getByTestId(container, 'tag-ids').textContent).toBe('')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
	})

	test('9. Connect multiple new tags - all should appear', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<HasManyTestComponent articleId="article-1" />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
		})

		act(() => {
			;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
		})
		act(() => {
			;(getByTestId(container, 'connect-tag-4') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-count').textContent).toBe('4')
		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2,tag-3,tag-4')
	})

	test('10. Connect A, Connect B, Disconnect A - only B remains added', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<HasManyTestComponent articleId="article-1" />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
		})

		act(() => {
			;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
		})
		act(() => {
			;(getByTestId(container, 'connect-tag-4') as HTMLButtonElement).click()
		})
		act(() => {
			;(getByTestId(container, 'disconnect-tag-3') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2,tag-4')
		expect(getByTestId(container, 'tag-count').textContent).toBe('3')
	})
})
