import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	HasMany,
	isTempId,
	useEntity,
	useField,
	useAccessor,
} from '@contember/bindx-react'
import type { FieldRef, EntityRef } from '@contember/bindx'
import {
	testSchema,
	schema,
	createMockData,
	createHasManyMockData,
} from '../../shared'
import type { Tag } from '../../shared'

afterEach(() => {
	cleanup()
})

function TagName({ field }: { field: FieldRef<string> }): React.ReactElement {
	const acc = useField(field)
	return <span data-testid="tag-name">{acc.value}</span>
}

function TagNameIndexed({ field, index }: { field: FieldRef<string>; index: number }): React.ReactElement {
	const acc = useField(field)
	return <span data-testid={`tag-name-${index}`}>{acc.value}</span>
}

function TagFieldValues({ tag }: { tag: EntityRef<Tag, Pick<Tag, 'id' | 'name' | 'color'>> }): React.ReactElement {
	const acc = useAccessor(tag)
	const name = acc.name.value
	const color = acc.color.value
	return (
		<div
			data-testid="tag"
			style={{ backgroundColor: color ?? undefined }}
		>
			{name}
		</div>
	)
}

function TagNameMutable({ tag, index }: { tag: EntityRef<Tag, Pick<Tag, 'id' | 'name'>>; index: number }): React.ReactElement {
	const acc = useAccessor(tag)
	return (
		<div data-testid={`tag-${index}`}>
			<span data-testid={`tag-name-${index}`}>{acc.name.value}</span>
			<button
				data-testid={`update-btn-${index}`}
				onClick={() => acc.name.setValue(`Updated ${index}`)}
			>
				Update
			</button>
		</div>
	)
}

function TagNameMutableFixed({ tag, index }: { tag: EntityRef<Tag, Pick<Tag, 'id' | 'name'>>; index: number }): React.ReactElement {
	const acc = useAccessor(tag)
	return (
		<div data-testid={`tag-${index}`}>
			<span data-testid={`tag-name-${index}`}>{acc.name.value}</span>
			<button
				data-testid={`update-${index}`}
				onClick={() => acc.name.setValue('Updated')}
			>
				Update
			</button>
		</div>
	)
}

function TagNameOptional({ field }: { field: FieldRef<string> }): React.ReactElement {
	const acc = useField(field)
	return <span>{acc.value ?? 'New Tag'}</span>
}

function TagNameNumbered({ field, index }: { field: FieldRef<string>; index: number }): React.ReactElement {
	const acc = useField(field)
	return <li data-testid={`item-${index}`}>{index + 1}. {acc.value}</li>
}

function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

function getAllByTestId(container: Element, testId: string): Element[] {
	return Array.from(container.querySelectorAll(`[data-testid="${testId}"]`))
}

describe('HasMany component', () => {
	// ==================== Basic Rendering ====================

	describe('basic rendering', () => {
		test('maps over items and renders children for each', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a =>
					a.id().title().tags(t => t.id().name().color()),
				)

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<HasMany field={article.tags}>
							{tag => (
								<div data-testid="tag">
									<TagName field={tag.name} />
								</div>
							)}
						</HasMany>
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

			const tags = getAllByTestId(container, 'tag')
			expect(tags).toHaveLength(2)

			const tagNames = getAllByTestId(container, 'tag-name')
			expect(tagNames[0]?.textContent).toBe('JavaScript')
			expect(tagNames[1]?.textContent).toBe('React')
		})

		test('renders nothing for empty array', async () => {
			const mockData = createHasManyMockData()
			const adapter = new MockAdapter(mockData, { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-empty' } }, a =>
					a.id().title().tags(t => t.id().name()),
				)

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div data-testid="wrapper">
						<HasMany field={article.tags}>
							{tag => (
								<div data-testid="tag">
									<TagName field={tag.name} />
								</div>
							)}
						</HasMany>
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

			const tags = getAllByTestId(container, 'tag')
			expect(tags).toHaveLength(0)

			const wrapper = getByTestId(container, 'wrapper')
			expect(wrapper.textContent).toBe('')
		})

		test('renders single item correctly', async () => {
			const mockData = createHasManyMockData()
			const adapter = new MockAdapter(mockData, { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-single' } }, a =>
					a.id().title().tags(t => t.id().name()),
				)

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<HasMany field={article.tags}>
							{tag => (
								<div data-testid="tag">
									<TagName field={tag.name} />
								</div>
							)}
						</HasMany>
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

			const tags = getAllByTestId(container, 'tag')
			expect(tags).toHaveLength(1)
			expect(getByTestId(container, 'tag-name').textContent).toBe('JavaScript')
		})
	})

	// ==================== Index Access ====================

	describe('index access', () => {
		test('provides correct index to children callback', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a =>
					a.id().tags(t => t.id().name()),
				)

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<HasMany field={article.tags}>
							{(tag, index) => (
								<div data-testid={`tag-${index}`}>
									<span data-testid={`tag-index-${index}`}>{index}</span>
									<TagNameIndexed field={tag.name} index={index} />
								</div>
							)}
						</HasMany>
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

			expect(getByTestId(container, 'tag-index-0').textContent).toBe('0')
			expect(getByTestId(container, 'tag-name-0').textContent).toBe('JavaScript')
			expect(getByTestId(container, 'tag-index-1').textContent).toBe('1')
			expect(getByTestId(container, 'tag-name-1').textContent).toBe('React')
		})

		test('allows using index for numbering', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a =>
					a.id().tags(t => t.id().name()),
				)

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<ol data-testid="list">
						<HasMany field={article.tags}>
							{(tag, index) => <TagNameNumbered field={tag.name} index={index} />}
						</HasMany>
					</ol>
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

			expect(getByTestId(container, 'item-0').textContent).toBe('1. JavaScript')
			expect(getByTestId(container, 'item-1').textContent).toBe('2. React')
		})
	})

	// ==================== Entity ID / Key Handling ====================

	describe('entity id and key handling', () => {
		test('provides entity id in accessor', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a =>
					a.id().tags(t => t.id().name()),
				)

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<HasMany field={article.tags}>
							{tag => (
								<div data-testid={`tag-${tag.id}`}>
									<span data-testid="tag-id">{tag.id}</span>
								</div>
							)}
						</HasMany>
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

			expect(queryByTestId(container, 'tag-tag-1')).not.toBeNull()
			expect(queryByTestId(container, 'tag-tag-2')).not.toBeNull()

			const tagIds = getAllByTestId(container, 'tag-id')
			expect(tagIds[0]?.textContent).toBe('tag-1')
			expect(tagIds[1]?.textContent).toBe('tag-2')
		})
	})

	// ==================== Field Access ====================

	describe('field access', () => {
		test('allows direct field value access', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a =>
					a.id().tags(t => t.id().name().color()),
				)

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<HasMany field={article.tags}>
							{tag => <TagFieldValues tag={tag} />}
						</HasMany>
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

			const tags = getAllByTestId(container, 'tag')
			expect(tags[0]?.textContent).toBe('JavaScript')
			expect(tags[1]?.textContent).toBe('React')
		})

		test('allows field mutations through accessor', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a =>
					a.id().tags(t => t.id().name()),
				)

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<HasMany field={article.tags}>
							{(tag, index) => <TagNameMutable tag={tag} index={index} />}
						</HasMany>
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

			expect(getByTestId(container, 'tag-name-0').textContent).toBe('JavaScript')

			act(() => {
				const button = getByTestId(container, 'update-btn-0') as HTMLButtonElement
				button.click()
			})

			expect(getByTestId(container, 'tag-name-0').textContent).toBe('Updated 0')
		})
	})

	// ==================== Reactivity ====================

	describe('reactivity', () => {
		test('updates when relation length changes via add', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a =>
					a.id().tags(t => t.id().name()),
				)

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<span data-testid="count">{article.tags.length}</span>
						<HasMany field={article.tags}>
							{tag => (
								<div data-testid="tag">
									<TagNameOptional field={tag.name} />
								</div>
							)}
						</HasMany>
						<button
							data-testid="add-btn"
							onClick={() => article.tags.add({ name: 'TypeScript' })}
						>
							Add Tag
						</button>
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

			expect(getByTestId(container, 'count').textContent).toBe('2')
			expect(getAllByTestId(container, 'tag')).toHaveLength(2)

			act(() => {
				const button = getByTestId(container, 'add-btn') as HTMLButtonElement
				button.click()
			})

			expect(getByTestId(container, 'count').textContent).toBe('3')
			expect(getAllByTestId(container, 'tag')).toHaveLength(3)
		})

		test('add() generates IDs recognized by isTempId()', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })
			let addedId: string | null = null

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a =>
					a.id().tags(t => t.id().name()),
				)

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<button
							data-testid="add-btn"
							onClick={() => {
								addedId = article.tags.add({ name: 'New' })
							}}
						>
							Add
						</button>
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

			act(() => {
				const button = getByTestId(container, 'add-btn') as HTMLButtonElement
				button.click()
			})

			expect(addedId).not.toBeNull()
			expect(isTempId(addedId!)).toBe(true)
		})

		test('updates when relation item field changes', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a =>
					a.id().tags(t => t.id().name()),
				)

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<HasMany field={article.tags}>
							{(tag, index) => <TagNameMutableFixed tag={tag} index={index} />}
						</HasMany>
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

			expect(getByTestId(container, 'tag-name-0').textContent).toBe('JavaScript')

			act(() => {
				const button = getByTestId(container, 'update-0') as HTMLButtonElement
				button.click()
			})

			expect(getByTestId(container, 'tag-name-0').textContent).toBe('Updated')
			expect(getByTestId(container, 'tag-name-1').textContent).toBe('React') // unchanged
		})
	})

	// ==================== Length Property ====================

	describe('length property', () => {
		test('exposes length property on the field', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-1' } }, a =>
					a.id().tags(t => t.id().name()),
				)

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<span data-testid="length">{article.tags.length}</span>
						<HasMany field={article.tags}>
							{tag => <span data-testid="tag"><TagName field={tag.name} /></span>}
						</HasMany>
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

			expect(getByTestId(container, 'length').textContent).toBe('2')
		})

		test('length is 0 for empty relation', async () => {
			const mockData = createHasManyMockData()
			const adapter = new MockAdapter(mockData, { delay: 0 })

			function TestComponent(): React.ReactElement {
				const article = useEntity(schema.Article, { by: { id: 'article-empty' } }, a =>
					a.id().tags(t => t.id().name()),
				)

				if (article.$isLoading) {
					return <div data-testid="loading">Loading...</div>
				}
				if (article.$isError || article.$isNotFound) {
					return <div data-testid="error">Error</div>
				}

				return (
					<div>
						<span data-testid="length">{article.tags.length}</span>
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

			expect(getByTestId(container, 'length').textContent).toBe('0')
		})
	})
})
