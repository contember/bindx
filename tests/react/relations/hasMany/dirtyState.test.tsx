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

describe('HasMany Relations - Dirty Tracking', () => {
	test('15. No changes - isDirty should be false', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
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

		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
	})

	test('17. After disconnect - isDirty should be true', async () => {
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

		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')
	})
})

describe('HasMany Relations - Reset Operations', () => {
	test('12. Connect tag + Reset - tag should disappear, isDirty=false', async () => {
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
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
		})

		act(() => {
			;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2,tag-3')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')

		act(() => {
			;(getByTestId(container, 'reset') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
	})

	test('13. Disconnect tag + Reset - tag should return, isDirty=false', async () => {
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
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
		})

		act(() => {
			;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-2')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('dirty')

		act(() => {
			;(getByTestId(container, 'reset') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
	})

	test('14. Connect + Disconnect + Reset - should return to original state', async () => {
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
			<BindxProvider adapter={adapter} schema={schema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'tag-ids')).not.toBeNull()
		})

		act(() => {
			;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
		})
		act(() => {
			;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-2,tag-3')

		act(() => {
			;(getByTestId(container, 'reset') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'tag-ids').textContent).toBe('tag-1,tag-2')
		expect(getByTestId(container, 'is-dirty').textContent).toBe('clean')
	})
})
