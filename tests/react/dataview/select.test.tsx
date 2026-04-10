import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	scalar,
	hasOne,
	hasMany,
	useEntity,
	entityDef,
} from '@contember/bindx-react'
import {
	Select,
	MultiSelect,
	SelectDataView,
	SelectOption,
	SelectItemTrigger,
	SelectEachValue,
	SelectPlaceholder,
	DataViewLoaderState,
	DataViewEachRow,
} from '@contember/bindx-dataview'
import { getByTestId, queryByTestId } from './helpers.js'

afterEach(() => {
	cleanup()
})

// ============================================================================
// Schema
// ============================================================================

interface Category {
	id: string
	name: string
}

interface Tag {
	id: string
	name: string
}

interface Article {
	id: string
	title: string
	category: Category | null
	tags: Tag[]
}

interface TestSchema {
	Article: Article
	Category: Category
	Tag: Tag
}

const localSchema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				category: hasOne('Category'),
				tags: hasMany('Tag'),
			},
		},
		Category: {
			fields: {
				id: scalar(),
				name: scalar(),
			},
		},
		Tag: {
			fields: {
				id: scalar(),
				name: scalar(),
			},
		},
	},
})

const entities = {
	Article: entityDef<Article>('Article'),
	Category: entityDef<Category>('Category'),
	Tag: entityDef<Tag>('Tag'),
} as const

function createMockData() {
	return {
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'Test Article',
				category: { id: 'cat-1', name: 'Tech' },
				tags: [
					{ id: 'tag-1', name: 'JS' },
					{ id: 'tag-2', name: 'React' },
				],
			},
			'article-no-cat': {
				id: 'article-no-cat',
				title: 'No Category',
				category: null,
				tags: [],
			},
		},
		Category: {
			'cat-1': { id: 'cat-1', name: 'Tech' },
			'cat-2': { id: 'cat-2', name: 'Science' },
			'cat-3': { id: 'cat-3', name: 'Art' },
		},
		Tag: {
			'tag-1': { id: 'tag-1', name: 'JS' },
			'tag-2': { id: 'tag-2', name: 'React' },
			'tag-3': { id: 'tag-3', name: 'TypeScript' },
		},
	}
}

// ============================================================================
// Select (has-one)
// ============================================================================

describe('Select', () => {
	test('renders current selection and placeholder', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entities.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().category(c => c.id().name()),
			)

			if (article.$isLoading || article.$isError || article.$isNotFound) {
				return <div data-testid="loading">Loading...</div>
			}

			return (
				<Select relation={article.category!} options={entities.Category}>
					<div>
						<SelectPlaceholder>
							<span data-testid="placeholder">Select category</span>
						</SelectPlaceholder>
						<SelectEachValue>
							{(entity) => (
								<span data-testid="selected">{(entity as unknown as { name: { value: string } }).name.value}</span>
							)}
						</SelectEachValue>
					</div>
				</Select>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'loading')).toBeNull()
		})

		// Should show selected category, not placeholder
		expect(queryByTestId(container, 'placeholder')).toBeNull()
		expect(getByTestId(container, 'selected').textContent).toBe('Tech')
	})

	test('shows placeholder when no selection', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entities.Article, { by: { id: 'article-no-cat' } }, e =>
				e.id().title().category(c => c.id().name()),
			)

			if (article.$isLoading || article.$isError || article.$isNotFound) {
				return <div data-testid="loading">Loading...</div>
			}

			return (
				<Select relation={article.category!} options={entities.Category}>
					<div>
						<SelectPlaceholder>
							<span data-testid="placeholder">Select category</span>
						</SelectPlaceholder>
						<SelectEachValue>
							{(entity) => <span data-testid="selected">should not appear</span>}
						</SelectEachValue>
					</div>
				</Select>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'loading')).toBeNull()
		})

		// Should show placeholder, not selected
		expect(queryByTestId(container, 'selected')).toBeNull()
		expect(getByTestId(container, 'placeholder').textContent).toBe('Select category')
	})

	test('connect and disconnect via Select handler', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entities.Article, { by: { id: 'article-no-cat' } }, e =>
				e.id().title().category(c => c.id().name()),
			)

			if (article.$isLoading || article.$isError || article.$isNotFound) {
				return <div data-testid="loading">Loading...</div>
			}

			return (
				<Select relation={article.category!} options={entities.Category}>
					<div>
						<span data-testid="state">{article.category!.$state}</span>
						<span data-testid="cat-id">{article.category!.$state === 'connected' ? article.category!.$id : 'none'}</span>
						<button
							data-testid="connect-cat-2"
							onClick={() => article.category!.$connect('cat-2')}
						>
							Connect
						</button>
						<button
							data-testid="disconnect"
							onClick={() => article.category!.$disconnect()}
						>
							Disconnect
						</button>
					</div>
				</Select>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'loading')).toBeNull()
		})

		// Initially disconnected
		expect(getByTestId(container, 'state').textContent).toBe('disconnected')
		expect(getByTestId(container, 'cat-id').textContent).toBe('none')

		// Connect cat-2
		act(() => {
			;(getByTestId(container, 'connect-cat-2') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'state').textContent).toBe('connected')
		expect(getByTestId(container, 'cat-id').textContent).toBe('cat-2')

		// Disconnect
		act(() => {
			;(getByTestId(container, 'disconnect') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'state').textContent).toBe('disconnected')
	})

	test('SelectDataView loads options and renders list', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entities.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().category(c => c.id().name()),
			)

			if (article.$isLoading || article.$isError || article.$isNotFound) {
				return <div data-testid="loading">Loading...</div>
			}

			return (
				<Select relation={article.category!} options={entities.Category}>
					<SelectDataView selection={it => <span>{(it as unknown as { name: { value: string } }).name.value}</span>}>
						<DataViewLoaderState loaded>
							<DataViewEachRow>
								{(item) => (
									<div key={item.id} data-testid={`option-${item.id}`}>
										<SelectOption entity={item}>
											<SelectItemTrigger entity={item}>
												<button>{(item as unknown as { name: { value: string } }).name.value}</button>
											</SelectItemTrigger>
										</SelectOption>
									</div>
								)}
							</DataViewEachRow>
						</DataViewLoaderState>
						<DataViewLoaderState initial>
							<div data-testid="options-loading">Loading options...</div>
						</DataViewLoaderState>
					</SelectDataView>
				</Select>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'loading')).toBeNull()
		})

		// Wait for options to load
		await waitFor(() => {
			expect(queryByTestId(container, 'options-loading')).toBeNull()
		})

		// Should render 3 category options
		expect(queryByTestId(container, 'option-cat-1')).not.toBeNull()
		expect(queryByTestId(container, 'option-cat-2')).not.toBeNull()
		expect(queryByTestId(container, 'option-cat-3')).not.toBeNull()
	})
})

// ============================================================================
// MultiSelect (has-many)
// ============================================================================

describe('MultiSelect', () => {
	test('renders selected items and allows disconnect', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entities.Article, { by: { id: 'article-1' } }, e =>
				e.id().title().tags(t => t.id().name()),
			)

			if (article.$isLoading || article.$isError || article.$isNotFound) {
				return <div data-testid="loading">Loading...</div>
			}

			return (
				<MultiSelect relation={article.tags} options={entities.Tag}>
					<div>
						<SelectPlaceholder>
							<span data-testid="placeholder">Select tags</span>
						</SelectPlaceholder>
						<span data-testid="count">{article.tags.length}</span>
						<SelectEachValue>
							{(entity) => (
								<span data-testid={`tag-${entity.id}`}>{(entity as unknown as { name: { value: string } }).name.value}</span>
							)}
						</SelectEachValue>
						<button
							data-testid="disconnect-tag-1"
							onClick={() => article.tags.disconnect('tag-1')}
						>
							Remove tag-1
						</button>
						<button
							data-testid="connect-tag-3"
							onClick={() => article.tags.connect('tag-3')}
						>
							Add tag-3
						</button>
					</div>
				</MultiSelect>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'loading')).toBeNull()
		})

		// Should show 2 tags, no placeholder
		expect(queryByTestId(container, 'placeholder')).toBeNull()
		expect(getByTestId(container, 'count').textContent).toBe('2')
		expect(getByTestId(container, 'tag-tag-1').textContent).toBe('JS')
		expect(getByTestId(container, 'tag-tag-2').textContent).toBe('React')

		// Disconnect tag-1
		act(() => {
			;(getByTestId(container, 'disconnect-tag-1') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'count').textContent).toBe('1')
		expect(queryByTestId(container, 'tag-tag-1')).toBeNull()

		// Connect tag-3
		act(() => {
			;(getByTestId(container, 'connect-tag-3') as HTMLButtonElement).click()
		})

		expect(getByTestId(container, 'count').textContent).toBe('2')
		expect(queryByTestId(container, 'tag-tag-3')).not.toBeNull()
	})

	test('shows placeholder when no tags', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		function TestComponent(): React.ReactElement {
			const article = useEntity(entities.Article, { by: { id: 'article-no-cat' } }, e =>
				e.id().title().tags(t => t.id().name()),
			)

			if (article.$isLoading || article.$isError || article.$isNotFound) {
				return <div data-testid="loading">Loading...</div>
			}

			return (
				<MultiSelect relation={article.tags} options={entities.Tag}>
					<div>
						<SelectPlaceholder>
							<span data-testid="placeholder">Select tags</span>
						</SelectPlaceholder>
						<SelectEachValue>
							{() => <span data-testid="selected">should not appear</span>}
						</SelectEachValue>
					</div>
				</MultiSelect>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'loading')).toBeNull()
		})

		expect(queryByTestId(container, 'selected')).toBeNull()
		expect(getByTestId(container, 'placeholder').textContent).toBe('Select tags')
	})
})
