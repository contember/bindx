import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	isPlaceholderId,
	useEntity,
	useEntityList,
} from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, entityDefs, schema } from './setup'

afterEach(() => {
	cleanup()
})

describe('HasOne Relations - Dirty State Tracking', () => {
	test('12. Connect should mark relation as dirty', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().author(a => a.id().name()),
			)
			const allAuthors = useEntityList(entityDefs.Author, {}, a => a.id().name())

			if (article.isLoading || allAuthors.isLoading) {
				return <div data-testid="loading">Loading...</div>
			}
			if (article.isError || article.isNotFound || allAuthors.isError) {
				return <div>Error</div>
			}

			return (
				<div>
					<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
					<span data-testid="relation-dirty">{article.author.$isDirty ? 'dirty' : 'clean'}</span>
					<span data-testid="entity-dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
					<button
						data-testid="connect-author-2"
						onClick={() => article.author.$connect('author-2')}
					>
						Connect Author 2
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
			expect(queryByTestId(container, 'author-id')).not.toBeNull()
		})

		// Initially clean
		expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
		expect(getByTestId(container, 'relation-dirty').textContent).toBe('clean')
		expect(getByTestId(container, 'entity-dirty').textContent).toBe('clean')

		// Connect to different author
		act(() => {
			;(getByTestId(container, 'connect-author-2') as HTMLButtonElement).click()
		})

		// Should be dirty
		expect(getByTestId(container, 'author-id').textContent).toBe('author-2')
		expect(getByTestId(container, 'relation-dirty').textContent).toBe('dirty')
		expect(getByTestId(container, 'entity-dirty').textContent).toBe('dirty')
	})

	test('13. Disconnect should mark relation as dirty', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().author(a => a.id().name()),
			)

			if (article.isLoading) {
				return <div>Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div data-testid="loading">Loading...</div>
			}

			return (
				<div>
					<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
					<span data-testid="relation-dirty">{article.author.$isDirty ? 'dirty' : 'clean'}</span>
					<span data-testid="entity-dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
					<button
						data-testid="disconnect"
						onClick={() => article.author.$disconnect()}
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
			expect(queryByTestId(container, 'author-id')).not.toBeNull()
		})

		// Initially clean
		expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
		expect(getByTestId(container, 'relation-dirty').textContent).toBe('clean')
		expect(getByTestId(container, 'entity-dirty').textContent).toBe('clean')

		// Disconnect
		act(() => {
			;(getByTestId(container, 'disconnect') as HTMLButtonElement).click()
		})

		// Should be dirty
		expect(isPlaceholderId(getByTestId(container, 'author-id').textContent!)).toBe(true)
		expect(getByTestId(container, 'relation-dirty').textContent).toBe('dirty')
		expect(getByTestId(container, 'entity-dirty').textContent).toBe('dirty')
	})

	test('14. Connect back to original should clear dirty state', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().author(a => a.id().name()),
			)
			const allAuthors = useEntityList(entityDefs.Author, {}, a => a.id().name())

			if (article.isLoading || allAuthors.isLoading) {
				return <div data-testid="loading">Loading...</div>
			}
			if (article.isError || article.isNotFound || allAuthors.isError) {
				return <div>Error</div>
			}

			return (
				<div>
					<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
					<span data-testid="relation-dirty">{article.author.$isDirty ? 'dirty' : 'clean'}</span>
					<button
						data-testid="connect-author-2"
						onClick={() => article.author.$connect('author-2')}
					>
						Connect Author 2
					</button>
					<button
						data-testid="connect-author-1"
						onClick={() => article.author.$connect('author-1')}
					>
						Connect Author 1
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
			expect(queryByTestId(container, 'author-id')).not.toBeNull()
		})

		// Initially clean
		expect(getByTestId(container, 'relation-dirty').textContent).toBe('clean')

		// Connect to different author - should be dirty
		act(() => {
			;(getByTestId(container, 'connect-author-2') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'relation-dirty').textContent).toBe('dirty')

		// Connect back to original - should be clean again
		act(() => {
			;(getByTestId(container, 'connect-author-1') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'relation-dirty').textContent).toBe('clean')
	})

	test('15. Reset should clear dirty state', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().author(a => a.id().name()),
			)
			const allAuthors = useEntityList(entityDefs.Author, {}, a => a.id().name())

			if (article.isLoading || allAuthors.isLoading) {
				return <div data-testid="loading">Loading...</div>
			}
			if (article.isError || article.isNotFound || allAuthors.isError) {
				return <div>Error</div>
			}

			return (
				<div>
					<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
					<span data-testid="relation-dirty">{article.author.$isDirty ? 'dirty' : 'clean'}</span>
					<span data-testid="entity-dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
					<button
						data-testid="connect-author-2"
						onClick={() => article.author.$connect('author-2')}
					>
						Connect Author 2
					</button>
					<button
						data-testid="reset"
						onClick={() => article.reset()}
					>
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
			expect(queryByTestId(container, 'author-id')).not.toBeNull()
		})

		// Initially author-1, clean
		expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
		expect(getByTestId(container, 'relation-dirty').textContent).toBe('clean')

		// Connect to author-2 - should be dirty
		act(() => {
			;(getByTestId(container, 'connect-author-2') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'author-id').textContent).toBe('author-2')
		expect(getByTestId(container, 'relation-dirty').textContent).toBe('dirty')

		// Reset - should go back to original and be clean
		act(() => {
			;(getByTestId(container, 'reset') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
		expect(getByTestId(container, 'relation-dirty').textContent).toBe('clean')
		expect(getByTestId(container, 'entity-dirty').textContent).toBe('clean')
	})

	test('16. Disconnect then reconnect to original should clear dirty state', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().author(a => a.id().name()),
			)
			const allAuthors = useEntityList(entityDefs.Author, {}, a => a.id().name())

			if (article.isLoading || allAuthors.isLoading) {
				return <div data-testid="loading">Loading...</div>
			}
			if (article.isError || article.isNotFound || allAuthors.isError) {
				return <div>Error</div>
			}

			return (
				<div>
					<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
					<span data-testid="relation-dirty">{article.author.$isDirty ? 'dirty' : 'clean'}</span>
					<button
						data-testid="disconnect"
						onClick={() => article.author.$disconnect()}
					>
						Disconnect
					</button>
					<button
						data-testid="connect-author-1"
						onClick={() => article.author.$connect('author-1')}
					>
						Connect Author 1
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
			expect(queryByTestId(container, 'author-id')).not.toBeNull()
		})

		// Initially author-1, clean
		expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
		expect(getByTestId(container, 'relation-dirty').textContent).toBe('clean')

		// Disconnect - should be dirty
		act(() => {
			;(getByTestId(container, 'disconnect') as HTMLButtonElement).click()
		})
		expect(isPlaceholderId(getByTestId(container, 'author-id').textContent!)).toBe(true)
		expect(getByTestId(container, 'relation-dirty').textContent).toBe('dirty')

		// Connect back to original - should be clean
		act(() => {
			;(getByTestId(container, 'connect-author-1') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
		expect(getByTestId(container, 'relation-dirty').textContent).toBe('clean')
	})

	test('17a. Entity isDirty should reflect nested entity field changes', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().author(a => a.id().name().email()),
			)

			if (article.isLoading) {
				return <div data-testid="loading">Loading...</div>
			}
			if (article.isError || article.isNotFound) {
				return <div>Error</div>
			}

			return (
				<div>
					<span data-testid="author-name">{article.author.$fields.name.value}</span>
					<span data-testid="author-field-dirty">{article.author.$fields.name.isDirty ? 'dirty' : 'clean'}</span>
					<span data-testid="relation-dirty">{article.author.$isDirty ? 'dirty' : 'clean'}</span>
					<span data-testid="entity-dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
					<button
						data-testid="change-name"
						onClick={() => article.author.$fields.name.setValue('Updated Name')}
					>
						Change Name
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
			expect(queryByTestId(container, 'author-name')).not.toBeNull()
		})

		// Initially clean
		expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		expect(getByTestId(container, 'author-field-dirty').textContent).toBe('clean')
		expect(getByTestId(container, 'entity-dirty').textContent).toBe('clean')

		// Change author name
		act(() => {
			;(getByTestId(container, 'change-name') as HTMLButtonElement).click()
		})

		// Author field should be dirty
		expect(getByTestId(container, 'author-name').textContent).toBe('Updated Name')
		expect(getByTestId(container, 'author-field-dirty').textContent).toBe('dirty')
		// Relation isDirty tracks connect/disconnect, not nested field changes
		expect(getByTestId(container, 'relation-dirty').textContent).toBe('clean')
		// But entity isDirty SHOULD be true because there are persistable changes
		expect(getByTestId(container, 'entity-dirty').textContent).toBe('dirty')
	})

	test('17. Entity isDirty should reflect hasOne relation changes', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entityDefs.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().author(a => a.id().name()),
			)
			const allAuthors = useEntityList(entityDefs.Author, {}, a => a.id().name())

			if (article.isLoading || allAuthors.isLoading) {
				return <div data-testid="loading">Loading...</div>
			}
			if (article.isError || article.isNotFound || allAuthors.isError) {
				return <div>Error</div>
			}

			return (
				<div>
					<span data-testid="entity-dirty">{article.isDirty ? 'dirty' : 'clean'}</span>
					<button
						data-testid="connect-author-2"
						onClick={() => article.author.$connect('author-2')}
					>
						Connect Author 2
					</button>
					<button
						data-testid="connect-author-1"
						onClick={() => article.author.$connect('author-1')}
					>
						Connect Author 1
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
			expect(queryByTestId(container, 'entity-dirty')).not.toBeNull()
		})

		// Initially clean
		expect(getByTestId(container, 'entity-dirty').textContent).toBe('clean')

		// Connect to different author - entity should be dirty
		act(() => {
			;(getByTestId(container, 'connect-author-2') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'entity-dirty').textContent).toBe('dirty')

		// Connect back to original - entity should be clean
		act(() => {
			;(getByTestId(container, 'connect-author-1') as HTMLButtonElement).click()
		})
		expect(getByTestId(container, 'entity-dirty').textContent).toBe('clean')
	})
})
