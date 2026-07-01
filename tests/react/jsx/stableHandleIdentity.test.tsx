import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, act, fireEvent, cleanup } from '@testing-library/react'
import React, { memo, useState } from 'react'
import { BindxProvider, MockAdapter, Entity, Field, useField, useEntity } from '@contember/bindx-react'
import type { EntityRef, FieldRef, FieldAccessor } from '@contember/bindx'
import type { Article } from '../../shared'
import { getByTestId, queryByTestId, createMockData, schema, testSchema } from '../../shared'

afterEach(() => {
	cleanup()
})

/**
 * EntityHandle is a stateless live view over the store, so it keeps a *stable identity*
 * across data changes — it is no longer recreated on every snapshot bump. The host still
 * re-renders (so inline reads stay fresh), but reactivity for memoized leaves now flows
 * through their own store subscription (<Field>/useField), not through a churning handle
 * reference. These tests lock in both halves of that contract.
 */
describe('<Entity> handle identity across data-driven re-render', () => {
	test('hands children the same accessor instance even though the host re-renders', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const seen: FieldAccessor<string>[] = []
		let bump: (() => void) | null = null

		// Passing the field ref down as a prop makes `article.title` collectable during the
		// selection phase (a component body, where useField runs, is not executed then).
		function Capture({ title: titleRef }: { title: FieldRef<string> }): React.ReactElement {
			// useAccessor returns the same ref it was given, so this is the field accessor identity.
			const title = useField(titleRef)
			seen.push(title)
			bump = () => title.setValue(`${title.value}!`)
			return <span data-testid="title">{title.value}</span>
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<Entity entity={schema.Article} by={{ id: 'article-1' }}>
					{article => <Capture title={article.title} />}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})

		const rendersBefore = seen.length
		act(() => {
			bump!()
		})

		// The host re-rendered on the data change (inline reads stay fresh) ...
		expect(getByTestId(container, 'title').textContent).toBe('Hello World!')
		expect(seen.length).toBeGreaterThan(rendersBefore)
		// ... yet every render received the exact same accessor instance (stable identity).
		expect(new Set(seen).size).toBe(1)
	})

	test('a memoized child holding the accessor does not re-render on a data change, while <Field> stays live', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		let memoRenders = 0
		let bump: (() => void) | null = null

		const StaticChild = memo(function StaticChild(_props: { article: EntityRef<Article> }): React.ReactElement {
			memoRenders++
			return <span data-testid="static">static</span>
		})

		function Controls({ article }: { article: EntityRef<Article> }): null {
			const title = useField(article.title)
			bump = () => title.setValue(`${title.value}!`)
			return null
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<Entity entity={schema.Article} by={{ id: 'article-1' }}>
					{article => (
						<>
							<StaticChild article={article} />
							<span data-testid="field-value"><Field field={article.title} /></span>
							<Controls article={article} />
						</>
					)}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'static')).not.toBeNull()
		})

		const memoRendersBefore = memoRenders
		act(() => {
			bump!()
		})

		// <Field> re-rendered from its own subscription — fine-grained reactivity preserved.
		expect(getByTestId(container, 'field-value').textContent).toBe('Hello World!')
		// The memoized child received a stable accessor prop — React.memo bailed, no re-render.
		expect(memoRenders).toBe(memoRendersBefore)
	})
})

describe('useEntity handle identity across data-driven re-render', () => {
	test('the returned ready accessor and field accessor keep stable identities', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const seenArticles: object[] = []
		const seenTitle: FieldAccessor<string>[] = []

		function Probe(): React.ReactElement {
			const article = useEntity(schema.Article, { by: { id: 'article-1' } }, e => e.title())
			if (article.$status !== 'ready') {
				return <span data-testid="loading">loading</span>
			}
			seenArticles.push(article)
			seenTitle.push(article.title)
			return (
				<button
					data-testid="title"
					onClick={() => article.title.setValue(`${article.title.value}!`)}
				>
					{article.title.value}
				</button>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<Probe />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})

		const rendersBefore = seenTitle.length
		act(() => {
			fireEvent.click(getByTestId(container, 'title'))
		})

		expect(getByTestId(container, 'title').textContent).toBe('Hello World!')
		// Re-rendered on the data change ...
		expect(seenTitle.length).toBeGreaterThan(rendersBefore)
		// The top-level ready accessor is also the same proxy, not just article.title.
		expect(new Set(seenArticles).size).toBe(1)
		// ... but the field accessor was the same instance every time (handle cache survived).
		expect(new Set(seenTitle).size).toBe(1)
	})

	test('the stable ready accessor exposes fresh refetch metadata', async () => {
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 20 })
		const seenArticles: object[] = []
		const seenRefetching: boolean[] = []
		let setKey: (key: string) => void = () => {}

		function Probe(): React.ReactElement {
			const [key, setLocalKey] = useState('v1')
			setKey = setLocalKey

			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' }, queryKey: key },
				e => e.title(),
			)
			if (article.$status !== 'ready') {
				return <span data-testid="loading">loading</span>
			}

			seenArticles.push(article)
			seenRefetching.push(article.$isRefetching)
			return (
				<div>
					<span data-testid="title">{article.title.value}</span>
					<span data-testid="refetching">{article.$isRefetching ? 'yes' : 'no'}</span>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<Probe />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})
		const firstReadyArticle = seenArticles[seenArticles.length - 1]
		expect(getByTestId(container, 'refetching').textContent).toBe('no')

		mockData.Article['article-1']!.title = 'Updated By RPC'
		act(() => {
			setKey('v2')
		})

		expect(getByTestId(container, 'refetching').textContent).toBe('yes')
		expect(seenArticles[seenArticles.length - 1]).toBe(firstReadyArticle)

		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Updated By RPC')
		})
		expect(getByTestId(container, 'refetching').textContent).toBe('no')
		expect(new Set(seenArticles).size).toBe(1)
		expect(seenRefetching).toContain(true)
	})
})
