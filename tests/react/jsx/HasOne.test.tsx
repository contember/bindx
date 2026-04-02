import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	HasOne,
	useEntity,
	useAccessor,
} from '@contember/bindx-react'
import type { EntityRef } from '@contember/bindx'
import {
	testSchema,
	schema,
	createMockData,
	createHasOneMockData,
} from '../../shared'
import type { Author, Location } from '../../shared'

afterEach(() => {
	cleanup()
})

function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

function AuthorNameEmail<TSelected extends Pick<Author, 'name' | 'email'>>({ author }: { author: EntityRef<Author, TSelected> }): React.ReactElement {
	const acc = useAccessor(author)
	return (
		<div data-testid="author">
			<span data-testid="author-name">{acc.name.value}</span>
			<span data-testid="author-email">{acc.email.value}</span>
		</div>
	)
}

function AuthorNameWithUpdate<TSelected extends Pick<Author, 'name'>>({ author, testIdName, testIdBtn, newName }: { author: EntityRef<Author, TSelected>; testIdName: string; testIdBtn: string; newName: string }): React.ReactElement {
	const acc = useAccessor(author)
	return (
		<div>
			<span data-testid={testIdName}>{acc.name.value}</span>
			<button
				data-testid={testIdBtn}
				onClick={() => acc.name.setValue(newName)}
			>
				Update
			</button>
		</div>
	)
}

function AuthorInfo<TSelected extends Pick<Author, 'name' | 'email'>>({ author }: { author: EntityRef<Author, TSelected> }): React.ReactElement {
	const acc = useAccessor(author)
	return (
		<div data-testid="author-info">
			{acc.name.value} ({acc.email.value})
		</div>
	)
}

function AuthorName<TSelected extends Pick<Author, 'name'>>({ author, testId }: { author: EntityRef<Author, TSelected>; testId: string }): React.ReactElement {
	const acc = useAccessor(author)
	return <span data-testid={testId}>{acc.name.value}</span>
}

function LocationInfo<TSelected extends Pick<Location, 'label' | 'lat' | 'lng'>>({ location }: { location: EntityRef<Location, TSelected> }): React.ReactElement {
	const acc = useAccessor(location)
	return (
		<div data-testid="location">
			<span data-testid="label">{acc.label.value}</span>
			<span data-testid="lat">{acc.lat.value}</span>
			<span data-testid="lng">{acc.lng.value}</span>
		</div>
	)
}

function AuthorCard<TSelected extends Pick<Author, 'name' | 'email'>>({ author }: { author: EntityRef<Author, TSelected> }): React.ReactElement {
	const acc = useAccessor(author)
	return (
		<div data-testid="author-card" className="card">
			<header>
				<h2 data-testid="author-name">{acc.name.value}</h2>
			</header>
			<main>
				<a href={`mailto:${acc.email.value}`} data-testid="author-email">
					{acc.email.value}
				</a>
			</main>
			<footer>
				<span data-testid="author-id">ID: {acc.id}</span>
			</footer>
		</div>
	)
}

describe('HasOne component', () => {
	// ==================== Basic Rendering ====================

	describe('basic rendering', () => {
		test('renders children with entity accessor when connected', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().title().author(au => au.id().name().email()))

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<HasOne field={article.author}>
							{author => <AuthorNameEmail author={author} />}
						</HasOne>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			expect(queryByTestId(container, 'author')).not.toBeNull()
			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
			expect(getByTestId(container, 'author-email').textContent).toBe('john@example.com')
		})

		test('handles disconnected relation by providing placeholder entity', async () => {
			const mockData = createHasOneMockData()
			const adapter = new MockAdapter(mockData, { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-no-author' } }, a => a.id().title().author(au => au.id().name()))

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				// When disconnected, article.author provides a placeholder
				// Use $id and $fields.$name.value for proper access
				return (
					<div>
						<span data-testid="author-id">{article.author.$id ?? 'placeholder'}</span>
						<span data-testid="title">{article.title.value}</span>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			// Should have loaded successfully
			expect(getByTestId(container, 'title').textContent).toBe('No Author Article')
			// The author ID should be a placeholder ID (starts with __placeholder_)
			const authorId = getByTestId(container, 'author-id').textContent
			expect(authorId === 'placeholder' || authorId?.startsWith('__placeholder_')).toBe(true)
		})
	})

	// ==================== Field Access ====================

	describe('field access', () => {
		test('allows direct field value access', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().author(au => au.id().name().email()))

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<HasOne field={article.author}>
							{author => <AuthorInfo author={author} />}
						</HasOne>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			expect(getByTestId(container, 'author-info').textContent).toBe('John Doe (john@example.com)')
		})

		test('allows field mutations through accessor', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().author(au => au.id().name()))

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<HasOne field={article.author}>
							{author => <AuthorNameWithUpdate author={author} testIdName="author-name" testIdBtn="update-btn" newName="Jane Doe" />}
						</HasOne>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')

			act(() => {
				const button = getByTestId(container, 'update-btn') as HTMLButtonElement
				button.click()
			})

			expect(getByTestId(container, 'author-name').textContent).toBe('Jane Doe')
		})

		test('provides entity id in accessor', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().author(au => au.id().name()))

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<HasOne field={article.author}>
							{author => (
								<div data-testid="author-id">{author.id}</div>
							)}
						</HasOne>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
		})
	})

	// ==================== Nested Relations ====================

	describe('nested relations', () => {
		test('allows access to nested has-one relations', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a =>
					a.id().title().location(l => l.id().label().lat().lng()),
				)

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<HasOne field={article.location}>
							{location => <LocationInfo location={location} />}
						</HasOne>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			expect(getByTestId(container, 'label').textContent).toBe('New York')
			expect(getByTestId(container, 'lat').textContent).toBe('40.7128')
			expect(getByTestId(container, 'lng').textContent).toBe('-74.006')
		})
	})

	// ==================== Complex JSX ====================

	describe('complex JSX', () => {
		test('renders complex nested JSX structure', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().title().author(au => au.id().name().email()))

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<HasOne field={article.author}>
							{author => <AuthorCard author={author} />}
						</HasOne>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			const card = getByTestId(container, 'author-card')
			expect(card.tagName.toLowerCase()).toBe('div')
			expect(card.className).toBe('card')
			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
			expect(getByTestId(container, 'author-email').textContent).toBe('john@example.com')
			expect(getByTestId(container, 'author-id').textContent).toBe('ID: author-1')
		})
	})

	// ==================== Reactivity ====================

	describe('reactivity', () => {
		test('updates when relation field changes', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().author(au => au.id().name()))

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<HasOne field={article.author}>
							{author => <AuthorNameWithUpdate author={author} testIdName="author-name" testIdBtn="update-btn" newName="Updated Name" />}
						</HasOne>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')

			act(() => {
				const button = getByTestId(container, 'update-btn') as HTMLButtonElement
				button.click()
			})

			expect(getByTestId(container, 'author-name').textContent).toBe('Updated Name')
		})
	})

	// ==================== Relation ID Access ====================

	describe('relation id access', () => {
		test('can access $id property for connected relation', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a => a.id().author(au => au.id().name()))

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<span data-testid="author-id">{article.author.$id ?? 'null'}</span>
						<HasOne field={article.author}>
							{author => <AuthorName author={author} testId="author-name" />}
						</HasOne>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter} schema={testSchema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(queryByTestId(container, 'loading')).toBeNull()
			})

			expect(getByTestId(container, 'author-id').textContent).toBe('author-1')
			expect(getByTestId(container, 'author-name').textContent).toBe('John Doe')
		})
	})
})
