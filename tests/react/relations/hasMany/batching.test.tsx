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

describe('HasMany Relations - Edge Cases', () => {
	test('18. Connect non-existent ID - should handle gracefully', async () => {
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
						data-testid="connect-nonexistent"
						onClick={() => article.tags.connect('nonexistent-tag')}
					>
						Connect
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

		act(() => {
			;(getByTestId(container, 'connect-nonexistent') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-count').textContent).toBe('3')
	})

	test('19. Disconnect non-existent ID - should handle gracefully', async () => {
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
						data-testid="disconnect-nonexistent"
						onClick={() => article.tags.disconnect('nonexistent-tag')}
					>
						Disconnect
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

		act(() => {
			;(getByTestId(container, 'disconnect-nonexistent') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-count').textContent).toBe('2')
	})

	test('20. Empty hasMany at start - connect should work', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-empty' } }, e =>
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
					<span data-testid="tag-count">{article.tags.length}</span>
					<button
						data-testid="connect-tag-1"
						onClick={() => article.tags.connect('tag-1')}
					>
						Connect
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
		expect(getByTestId(container, 'tag-ids').textContent).toBe('')

		act(() => {
			;(getByTestId(container, 'connect-tag-1') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-count').textContent).toBe('1')
		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1')
	})

	test('21. Single item hasMany - disconnect should work correctly', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-single' } }, e =>
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
					<span data-testid="tag-count">{article.tags.length}</span>
					{article.tags.items.map(tag => (
						<button
							key={tag.id}
							data-testid={`disconnect-${tag.id}`}
							onClick={() => article.tags.disconnect(tag.id)}
						>
							Disconnect
						</button>
					))}
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

		expect(getByTestId(container, 'tag-count').textContent).toBe('1')
		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1')

		act(() => {
			;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-count').textContent).toBe('0')
		expect(getByTestId(container, 'tag-ids').textContent).toBe('')
	})
})

describe('HasMany Relations - UI Reactivity', () => {
	test('22. Connect triggers immediate UI update', async () => {
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

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2,tag-3')
	})

	test('23. Disconnect triggers immediate UI update', async () => {
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

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-2')
	})

	test('24. items.length updates correctly after each operation', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<HasManyTestComponent articleId="article-1" />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tag-count')).not.toBeNull()
		})

		expect(getByTestId(container, 'tag-count').textContent).toBe('2')

		act(() => {
			;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'tag-count').textContent).toBe('3')

		act(() => {
			;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'tag-count').textContent).toBe('2')

		act(() => {
			;(getByTestId(container, 'connect-tag-4') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'tag-count').textContent).toBe('3')
	})

	test('25. map() callback receives correct data including newly added items', async () => {
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

			const ids = article.tags.map(tag => tag.id).sort().join(',')

			return (
				<div>
					<span data-testid="tag-ids">{ids}</span>
					<button
						data-testid="connect-tag-3"
						onClick={() => article.tags.connect('tag-3')}
					>
						Connect
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
			;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2,tag-3')
	})
})

describe('HasMany Relations - Nested Entity Reactivity', () => {
	test('26. setValue on nested entity field in hasMany - UI should update reactively', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().tags(t => t.id().name().color()),
			)

			if (article.isLoading) {
				return <div>Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div data-testid="loading">Loading...</div>
			}

			return (
				<div>
					<div data-testid="tag-names">
						{article.tags.items.map((tag, i) => (
							<span key={i} data-testid={`tag-name-${tag.id}`}>
								{tag.$fields.name.value}
							</span>
						))}
					</div>
					<button
						data-testid="set-tag-1-name"
						onClick={() => {
							const tag = article.tags.items.find(t => t.id === 'tag-1')
							if (tag) tag.$fields.name.setValue('Updated Tag 1')
						}}
					>
						Set Tag 1 Name
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
			expect(queryByTestId(container, 'tag-names')).not.toBeNull()
		})

		expect(getByTestId(container, 'tag-name-tag-1').textContent).toBe('JavaScript')

		act(() => {
			;(getByTestId(container, 'set-tag-1-name') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-name-tag-1').textContent).toBe('Updated Tag 1')
	})

	test('27. setValue on multiple nested entities in hasMany - all should update reactively', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().tags(t => t.id().name().color()),
			)

			if (article.isLoading) {
				return <div>Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div data-testid="loading">Loading...</div>
			}

			return (
				<div>
					<div data-testid="tag-names">
						{article.tags.items.map((tag, i) => (
							<span key={i} data-testid={`tag-name-${tag.id}`}>
								{tag.$fields.name.value}
							</span>
						))}
					</div>
					<button
						data-testid="set-all-names"
						onClick={() => {
							for (const tag of article.tags.items) {
								tag.$fields.name.setValue(`Updated ${tag.id}`)
							}
						}}
					>
						Set All Names
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
			expect(queryByTestId(container, 'tag-names')).not.toBeNull()
		})

		expect(getByTestId(container, 'tag-name-tag-1').textContent).toBe('JavaScript')
		expect(getByTestId(container, 'tag-name-tag-2').textContent).toBe('React')

		act(() => {
			;(getByTestId(container, 'set-all-names') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-name-tag-1').textContent).toBe('Updated tag-1')
		expect(getByTestId(container, 'tag-name-tag-2').textContent).toBe('Updated tag-2')
	})
})
