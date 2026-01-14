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
	hasMany,
} from '@contember/react-bindx'

afterEach(() => {
	cleanup()
})

// Test types
interface Tag {
	id: string
	name: string
	color: string
}

interface Article {
	id: string
	title: string
	tags: Tag[]
}

interface TestSchema {
	Article: Article
	Tag: Tag
}

const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				tags: hasMany('Tag'),
			},
		},
		Tag: {
			fields: {
				id: scalar(),
				name: scalar(),
				color: scalar(),
			},
		},
	},
})

const { useEntity } = createBindx(schema)

// Helper functions
function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

// Test data factory - Article with 2 tags
function createMockData() {
	return {
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'Test Article',
				tags: [
					{ id: 'tag-1', name: 'JavaScript', color: '#f7df1e' },
					{ id: 'tag-2', name: 'React', color: '#61dafb' },
				],
			},
			'article-empty': {
				id: 'article-empty',
				title: 'Empty Article',
				tags: [],
			},
			'article-single': {
				id: 'article-single',
				title: 'Single Tag Article',
				tags: [
					{ id: 'tag-1', name: 'JavaScript', color: '#f7df1e' },
				],
			},
		},
		Tag: {
			'tag-1': { id: 'tag-1', name: 'JavaScript', color: '#f7df1e' },
			'tag-2': { id: 'tag-2', name: 'React', color: '#61dafb' },
			'tag-3': { id: 'tag-3', name: 'TypeScript', color: '#3178c6' },
			'tag-4': { id: 'tag-4', name: 'Vue', color: '#42b883' },
		},
	}
}

// Reusable test component
interface TestComponentProps {
	articleId: string
	onArticle?: (article: ReturnType<typeof useEntity<'Article', Article>>) => void
}

function HasManyTestComponent({ articleId, onArticle }: TestComponentProps): React.ReactElement {
	const article = useEntity('Article', { by: { id: articleId } }, e =>
		e.id().title().tags(t => t.id().name().color()),
	)

	React.useEffect(() => {
		if (!article.isLoading && onArticle) {
			onArticle(article)
		}
	}, [article, onArticle])

	if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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

describe('HasMany Relations', () => {
	describe('A. Basic Operations', () => {
		test('1. Connect existing tag - should appear in items with isDirty=true', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { container } = render(
				<BindxProvider adapter={adapter}>
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
				<BindxProvider adapter={adapter}>
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

		test('3. Connect + then Disconnect same tag - tag should NOT appear (BUG FIX)', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<HasManyTestComponent articleId="article-1" />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
			})

			// Initially 2 tags
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')

			// Connect tag-3
			act(() => {
				;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
			})

			// Now should have 3 tags
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2,tag-3')

			// Disconnect tag-3 (the one we just added)
			act(() => {
				;(getByTestId(container, 'disconnect-tag-3') as HTMLButtonElement).click()
			})

			// Should be back to 2 tags - tag-3 should NOT appear
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
			expect(getByTestId(container, 'tag-count').textContent).toBe('2')
		})

		test('4. Disconnect + then Connect same tag - tag should remain in items', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
			})

			// Initially 2 tags
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')

			// Disconnect tag-1
			act(() => {
				;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
			})

			// Now should have 1 tag
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-2')

			// Reconnect tag-1
			act(() => {
				;(getByTestId(container, 'connect-tag-1') as HTMLButtonElement).click()
			})

			// Tag-1 should be back
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
		})

		test('5. Multiple connect of same tag - should appear only once', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { container } = render(
				<BindxProvider adapter={adapter}>
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

			// Should still have only 3 tags (not duplicates)
			expect(getByTestId(container, 'tag-count').textContent).toBe('3')
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2,tag-3')
		})

		test('6. Multiple disconnect of same tag - should handle gracefully', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
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

			// Disconnect tag-1 again (already disconnected) - should not throw
			act(() => {
				;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
			})

			// Should still have 1 tag (no change since tag-1 was already disconnected)
			expect(getByTestId(container, 'tag-count').textContent).toBe('1')
		})
	})

	describe('B. Combined Operations', () => {
		test('7. Connect A, Disconnect B - A added, B removed', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<HasManyTestComponent articleId="article-1" />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
			})

			// Initially tag-1, tag-2
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')

			// Connect tag-3
			act(() => {
				;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
			})

			// Disconnect tag-1
			act(() => {
				;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
			})

			// Should have tag-2, tag-3
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-2,tag-3')
			expect(getByTestId(container, 'tag-count').textContent).toBe('2')
		})

		test('8. Disconnect all tags - items should be empty with isDirty=true', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<HasManyTestComponent articleId="article-1" />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
			})

			// Disconnect both tags
			act(() => {
				;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
			})
			act(() => {
				;(getByTestId(container, 'disconnect-tag-2') as HTMLButtonElement).click()
			})

			// Should have no tags
			expect(getByTestId(container, 'tag-count').textContent).toBe('0')
			expect(getByTestId(container, 'tag-ids').textContent).toBe('')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
		})

		test('9. Connect multiple new tags - all should appear', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<HasManyTestComponent articleId="article-1" />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
			})

			// Connect tag-3 and tag-4
			act(() => {
				;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
			})
			act(() => {
				;(getByTestId(container, 'connect-tag-4') as HTMLButtonElement).click()
			})

			// Should have 4 tags
			expect(getByTestId(container, 'tag-count').textContent).toBe('4')
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2,tag-3,tag-4')
		})

		test('10. Connect A, Connect B, Disconnect A - only B remains added', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { container } = render(
				<BindxProvider adapter={adapter}>
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

			// Connect tag-4
			act(() => {
				;(getByTestId(container, 'connect-tag-4') as HTMLButtonElement).click()
			})

			// Disconnect tag-3
			act(() => {
				;(getByTestId(container, 'disconnect-tag-3') as HTMLButtonElement).click()
			})

			// Should have tag-1, tag-2, tag-4 (tag-3 was connected then disconnected)
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2,tag-4')
			expect(getByTestId(container, 'tag-count').textContent).toBe('3')
		})

		test('11. Disconnect A, Disconnect B, Connect A - A back, B still removed', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
							data-testid="disconnect-tag-2"
							onClick={() => article.tags.disconnect('tag-2')}
						>
							Disconnect tag-2
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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
			})

			// Initially tag-1, tag-2
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')

			// Disconnect tag-1
			act(() => {
				;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
			})

			// Disconnect tag-2
			act(() => {
				;(getByTestId(container, 'disconnect-tag-2') as HTMLButtonElement).click()
			})

			// Reconnect tag-1
			act(() => {
				;(getByTestId(container, 'connect-tag-1') as HTMLButtonElement).click()
			})

			// Should have only tag-1 (tag-2 still disconnected)
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1')
		})
	})

	describe('C. Reset Operations', () => {
		test('12. Connect tag + Reset - tag should disappear, isDirty=false', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div data-testid="loading">Loading...</div>
				}

				const tagIds = article.tags.items.map(t => t.id).sort().join(',')

				return (
					<div>
						<span data-testid="tag-ids">{tagIds}</span>
						<span data-testid="is-dirty">{article.tags.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="connect-tag-3"
							onClick={() => article.tags.connect('tag-3')}
						>
							Connect
						</button>
						<button data-testid="reset" onClick={() => article.reset()}>
							Reset
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
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
			expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')

			// Reset
			act(() => {
				;(getByTestId(container, 'reset') as HTMLButtonElement).click()
			})

			// Should be back to original state
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
		})

		test('13. Disconnect tag + Reset - tag should return, isDirty=false', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div data-testid="loading">Loading...</div>
				}

				const tagIds = article.tags.items.map(t => t.id).sort().join(',')

				return (
					<div>
						<span data-testid="tag-ids">{tagIds}</span>
						<span data-testid="is-dirty">{article.tags.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="disconnect-tag-1"
							onClick={() => article.tags.disconnect('tag-1')}
						>
							Disconnect
						</button>
						<button data-testid="reset" onClick={() => article.reset()}>
							Reset
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
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
			expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')

			// Reset
			act(() => {
				;(getByTestId(container, 'reset') as HTMLButtonElement).click()
			})

			// Should be back to original state
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
		})

		test('14. Connect + Disconnect + Reset - should return to original state', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div data-testid="loading">Loading...</div>
				}

				const tagIds = article.tags.items.map(t => t.id).sort().join(',')

				return (
					<div>
						<span data-testid="tag-ids">{tagIds}</span>
						<span data-testid="is-dirty">{article.tags.isDirty ? 'dirty' : 'clean'}</span>
						<button
							data-testid="connect-tag-3"
							onClick={() => article.tags.connect('tag-3')}
						>
							Connect
						</button>
						<button
							data-testid="disconnect-tag-1"
							onClick={() => article.tags.disconnect('tag-1')}
						>
							Disconnect
						</button>
						<button data-testid="reset" onClick={() => article.reset()}>
							Reset
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
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

			// Reset
			act(() => {
				;(getByTestId(container, 'reset') as HTMLButtonElement).click()
			})

			// Should be back to original state
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
		})
	})

	describe('D. Dirty Tracking', () => {
		test('15. No changes - isDirty should be false', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<HasManyTestComponent articleId="article-1" />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
			})

			expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
		})

		test('16. After connect - isDirty should be true', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<HasManyTestComponent articleId="article-1" />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
			})

			act(() => {
				;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
			})

			expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
		})

		test('17. After disconnect - isDirty should be true', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<HasManyTestComponent articleId="article-1" />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
			})

			act(() => {
				;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
			})

			expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
		})
	})

	describe('E. Edge Cases', () => {
		test('18. Connect non-existent ID - should handle gracefully', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-count')).not.toBeNull()
			})

			// Should not throw
			act(() => {
				;(getByTestId(container, 'connect-nonexistent') as HTMLButtonElement).click()
			})

			// The count increases (the ID is added even if entity doesn't exist)
			// This is expected behavior - validation happens at persist time
			expect(getByTestId(container, 'tag-count').textContent).toBe('3')
		})

		test('19. Disconnect non-existent ID - should handle gracefully', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-count')).not.toBeNull()
			})

			// Should not throw
			act(() => {
				;(getByTestId(container, 'disconnect-nonexistent') as HTMLButtonElement).click()
			})

			// Count should remain 2
			expect(getByTestId(container, 'tag-count').textContent).toBe('2')
		})

		test('20. Empty hasMany at start - connect should work', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-empty' } }, e =>
					e.id().tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-count')).not.toBeNull()
			})

			// Initially empty
			expect(getByTestId(container, 'tag-count').textContent).toBe('0')
			expect(getByTestId(container, 'tag-ids').textContent).toBe('')

			// Connect tag-1
			act(() => {
				;(getByTestId(container, 'connect-tag-1') as HTMLButtonElement).click()
			})

			// Should have 1 tag
			expect(getByTestId(container, 'tag-count').textContent).toBe('1')
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1')
		})

		test('21. Single item hasMany - disconnect should work correctly', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-single' } }, e =>
					e.id().tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-count')).not.toBeNull()
			})

			// Initially 1 tag
			expect(getByTestId(container, 'tag-count').textContent).toBe('1')
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1')

			// Disconnect tag-1
			act(() => {
				;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
			})

			// Should have 0 tags
			expect(getByTestId(container, 'tag-count').textContent).toBe('0')
			expect(getByTestId(container, 'tag-ids').textContent).toBe('')
		})
	})

	describe('F. UI Reactivity', () => {
		test('22. Connect triggers immediate UI update', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<HasManyTestComponent articleId="article-1" />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
			})

			// Connect and check immediately (no await)
			act(() => {
				;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
			})

			// Should be updated synchronously
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2,tag-3')
		})

		test('23. Disconnect triggers immediate UI update', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<HasManyTestComponent articleId="article-1" />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
			})

			// Disconnect and check immediately (no await)
			act(() => {
				;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
			})

			// Should be updated synchronously
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-2')
		})

		test('24. items.length updates correctly after each operation', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			const { container } = render(
				<BindxProvider adapter={adapter}>
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
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().tags(t => t.id().name()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
					return <div data-testid="loading">Loading...</div>
				}

				// map() returns items including newly connected ones
				// Note: newly connected items that aren't in parent entity's embedded data
				// will have null for their fields until they are fetched separately
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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
			})

			// Initially tag-1, tag-2
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')

			// Connect tag-3
			act(() => {
				;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
			})

			// map() should see all three tags
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2,tag-3')
		})
	})

	describe('Nested Entity Reactivity', () => {
		test('26. setValue on nested entity field in hasMany - UI should update reactively', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().tags(t => t.id().name().color()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-names')).not.toBeNull()
			})

			// Initially
			expect(getByTestId(container, 'tag-name-tag-1').textContent).toBe('JavaScript')

			// Set new name on nested tag
			act(() => {
				;(getByTestId(container, 'set-tag-1-name') as HTMLButtonElement).click()
			})

			// UI should update reactively
			expect(getByTestId(container, 'tag-name-tag-1').textContent).toBe('Updated Tag 1')
		})

		test('27. setValue on multiple nested entities in hasMany - all should update reactively', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e =>
					e.id().title().tags(t => t.id().name().color()),
				)

				if (article.isLoading) {
					return <div>Loading...</div>
				}
				if (article.isError) {
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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-names')).not.toBeNull()
			})

			// Initially
			expect(getByTestId(container, 'tag-name-tag-1').textContent).toBe('JavaScript')
			expect(getByTestId(container, 'tag-name-tag-2').textContent).toBe('React')

			// Set all names
			act(() => {
				;(getByTestId(container, 'set-all-names') as HTMLButtonElement).click()
			})

			// All should update
			expect(getByTestId(container, 'tag-name-tag-1').textContent).toBe('Updated tag-1')
			expect(getByTestId(container, 'tag-name-tag-2').textContent).toBe('Updated tag-2')
		})
	})

	describe('HasMany add() operation', () => {
		test('add() creates new entity with temp ID and adds to items', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.id().title().tags(t => t.id().name()))
				if (article.isLoading) return <div data-testid="loading">Loading</div>
				if (article.isError) return <div>Error</div>

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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
			})

			// Initially 2 tags
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
			expect(getByTestId(container, 'tag-count').textContent).toBe('2')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')

			// Add new tag
			act(() => {
				;(getByTestId(container, 'add-tag') as HTMLButtonElement).click()
			})

			// Now should have 3 tags with temp ID and be dirty
			const tagIds = getByTestId(container, 'tag-ids').textContent!
			const parts = tagIds.split(',')
			expect(parts.length).toBe(3)
			expect(parts[0]).toBe('tag-1')
			expect(parts[1]).toBe('tag-2')
			expect(parts[2]!.startsWith('__temp_')).toBe(true)
			expect(getByTestId(container, 'tag-count').textContent).toBe('3')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
		})

		test('add() returns the new entity temp ID', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })
			let addedId: string | null = null

			function TestComponent() {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.id().tags(t => t.id()))
				if (article.isLoading) return <div data-testid="loading">Loading</div>
				if (article.isError) return <div>Error</div>

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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'added-id')).not.toBeNull()
			})

			expect(getByTestId(container, 'added-id').textContent).toBe('none')

			// Add new tag
			act(() => {
				;(getByTestId(container, 'add-tag') as HTMLButtonElement).click()
			})

			expect(addedId).not.toBeNull()
			expect(addedId!.startsWith('__temp_')).toBe(true)
		})

		test('add() multiple times - all appear in list', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity('Article', { by: { id: 'article-empty' } }, e => e.id().tags(t => t.id()))
				if (article.isLoading) return <div data-testid="loading">Loading</div>
				if (article.isError) return <div>Error</div>

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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-count')).not.toBeNull()
			})

			// Initially 0 tags
			expect(getByTestId(container, 'tag-count').textContent).toBe('0')

			// Add 3 tags
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
	})

	describe('HasMany remove() operation', () => {
		test('remove() on new entity (temp ID) - cancels the add', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })
			let addedId: string | null = null

			function TestComponent() {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.id().tags(t => t.id()))
				if (article.isLoading) return <div data-testid="loading">Loading</div>
				if (article.isError) return <div>Error</div>

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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-count')).not.toBeNull()
			})

			// Initially 2 tags
			expect(getByTestId(container, 'tag-count').textContent).toBe('2')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')

			// Add new tag
			act(() => {
				;(getByTestId(container, 'add-tag') as HTMLButtonElement).click()
			})
			expect(getByTestId(container, 'tag-count').textContent).toBe('3')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')

			// Remove the added tag
			act(() => {
				;(getByTestId(container, 'remove-added') as HTMLButtonElement).click()
			})
			expect(getByTestId(container, 'tag-count').textContent).toBe('2')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
		})

		test('remove() on server entity - plans disconnect', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.id().tags(t => t.id()))
				if (article.isLoading) return <div data-testid="loading">Loading</div>
				if (article.isError) return <div>Error</div>

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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
			})

			// Initially 2 tags
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')

			// Remove tag-1
			act(() => {
				;(getByTestId(container, 'remove-tag-1') as HTMLButtonElement).click()
			})

			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-2')
			expect(getByTestId(container, 'tag-count').textContent).toBe('1')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
		})
	})

	describe('HasMany move() operation', () => {
		test('move(0, 1) swaps first two items', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.id().tags(t => t.id().name()))
				if (article.isLoading) return <div data-testid="loading">Loading</div>
				if (article.isError) return <div>Error</div>

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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
			})

			// Initially tag-1, tag-2
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')

			// Move first to second position
			act(() => {
				;(getByTestId(container, 'move-0-1') as HTMLButtonElement).click()
			})

			// Now tag-2, tag-1
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-2,tag-1')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
		})

		test('move() same position - no change', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.id().tags(t => t.id()))
				if (article.isLoading) return <div data-testid="loading">Loading</div>
				if (article.isError) return <div>Error</div>

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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
			})

			// Initially tag-1, tag-2
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')

			// Move to same position
			act(() => {
				;(getByTestId(container, 'move-0-0') as HTMLButtonElement).click()
			})

			// Should be unchanged
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
		})

		test('reset() restores original order', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent() {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.id().tags(t => t.id()))
				if (article.isLoading) return <div data-testid="loading">Loading</div>
				if (article.isError) return <div>Error</div>

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
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
			})

			// Initially tag-1, tag-2
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')

			// Move
			act(() => {
				;(getByTestId(container, 'move-0-1') as HTMLButtonElement).click()
			})
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-2,tag-1')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')

			// Reset
			act(() => {
				;(getByTestId(container, 'reset') as HTMLButtonElement).click()
			})
			expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
			expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
		})
	})
})
