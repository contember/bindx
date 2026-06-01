import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act } from '@testing-library/react'
import React, { useEffect, useRef, useState } from 'react'
import { BindxProvider, MockAdapter, Entity, EntityList, Field } from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, schema, testSchema } from '../../shared'

afterEach(() => {
	cleanup()
})

describe('<Entity> queryKey prop', () => {
	test('changing queryKey refetches without unmounting the subtree', async () => {
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 20 })

		let setKey: (key: string) => void = () => {}

		// Sibling component used purely to assert that the subtree does not unmount.
		// useEffect with empty deps fires once per mount — counts (re)mounts.
		let mountCount = 0
		function MountSentinel() {
			useEffect(() => {
				mountCount++
			}, [])
			return <span data-testid="sentinel" />
		}

		function App() {
			const [key, setLocalKey] = useState('v1')
			setKey = setLocalKey

			return (
				<Entity entity={schema.Article} by={{ id: 'article-1' }} queryKey={key}>
					{article => (
						<div>
							<MountSentinel />
							<div data-testid="title"><Field field={article.title} /></div>
						</div>
					)}
				</Entity>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<App />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})
		expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		const mountsAfterInitialLoad = mountCount
		expect(mountsAfterInitialLoad).toBeGreaterThanOrEqual(1)

		mockData.Article['article-1']!.title = 'After RPC'
		act(() => setKey('v2'))

		// During refetch: subtree still mounted, no remount happened
		expect(mountCount).toBe(mountsAfterInitialLoad)
		expect(queryByTestId(container, 'title')).not.toBeNull()

		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('After RPC')
		})

		// After refetch lands: still no remount
		expect(mountCount).toBe(mountsAfterInitialLoad)
	})

	test('preserves DOM node identity across queryKey refetch', async () => {
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 20 })

		let setKey: (key: string) => void = () => {}

		function App() {
			const [key, setLocalKey] = useState('v1')
			setKey = setLocalKey

			return (
				<Entity entity={schema.Article} by={{ id: 'article-1' }} queryKey={key}>
					{article => <div data-testid="title"><Field field={article.title} /></div>}
				</Entity>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<App />
			</BindxProvider>,
		)

		await waitFor(() => expect(queryByTestId(container, 'title')).not.toBeNull())
		const elBefore = getByTestId(container, 'title')

		mockData.Article['article-1']!.title = 'Refreshed'
		act(() => setKey('v2'))

		expect(getByTestId(container, 'title')).toBe(elBefore)

		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Refreshed')
		})
		expect(getByTestId(container, 'title')).toBe(elBefore)
	})

	test('preserves locally-held React state across queryKey refetch', async () => {
		// Concrete proxy for "scroll position / open dialogs / form drafts survive".
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 20 })

		let setKey: (key: string) => void = () => {}
		const inputRef = { current: null as HTMLInputElement | null }

		function LocalStateChild() {
			const ref = useRef<HTMLInputElement>(null)
			useEffect(() => {
				inputRef.current = ref.current
			})
			return <input ref={ref} data-testid="local-input" />
		}

		function App() {
			const [key, setLocalKey] = useState('v1')
			setKey = setLocalKey

			return (
				<Entity entity={schema.Article} by={{ id: 'article-1' }} queryKey={key}>
					{article => (
						<div>
							<div data-testid="title"><Field field={article.title} /></div>
							<LocalStateChild />
						</div>
					)}
				</Entity>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<App />
			</BindxProvider>,
		)

		await waitFor(() => expect(queryByTestId(container, 'title')).not.toBeNull())
		expect(inputRef.current).not.toBeNull()
		inputRef.current!.value = 'user typed draft'

		mockData.Article['article-1']!.title = 'Refreshed'
		act(() => setKey('v2'))

		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Refreshed')
		})

		// Input still mounted with user's draft intact — would be lost with key={} remount
		const inputAfter = getByTestId(container, 'local-input') as HTMLInputElement
		expect(inputAfter.value).toBe('user typed draft')
	})
})

describe('<EntityList> queryKey prop', () => {
	test('changing queryKey refetches list without showing loading fallback', async () => {
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 20 })

		let setKey: (key: string) => void = () => {}

		function App() {
			const [key, setLocalKey] = useState('v1')
			setKey = setLocalKey

			return (
				<EntityList entity={schema.Article} queryKey={key}>
					{article => (
						<div data-testid={`item-${article.id}`}>
							<Field field={article.title} />
						</div>
					)}
				</EntityList>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<App />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'item-article-1')).not.toBeNull()
		})
		expect(getByTestId(container, 'item-article-1').textContent).toBe('Hello World')

		mockData.Article['article-1']!.title = 'List Refreshed'
		act(() => setKey('v2'))

		// During refetch: the items stay visible, no "Loading..." fallback
		expect(container.textContent ?? '').not.toContain('Loading...')
		expect(getByTestId(container, 'item-article-1').textContent).toBe('Hello World')

		await waitFor(() => {
			expect(getByTestId(container, 'item-article-1').textContent).toBe('List Refreshed')
		})
	})

	test('queryKey refetch preserves a locally edited item field', async () => {
		// Same dirty-preservation contract as <Entity>: a list refetch must not
		// silently clobber a local edit on one of its items.
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 20 })

		let setKey: (key: string) => void = () => {}

		function App() {
			const [key, setLocalKey] = useState('v1')
			setKey = setLocalKey

			return (
				<EntityList entity={schema.Article} queryKey={key}>
					{article => (
						<div key={article.id}>
							<div data-testid={`title-${article.id}`}>{article.title.value}</div>
							<div data-testid={`dirty-${article.id}`}>{String(article.title.isDirty)}</div>
							{article.id === 'article-1' && (
								<button
									data-testid="edit"
									onClick={() => article.title.setValue('LOCAL DRAFT')}
								/>
							)}
						</div>
					)}
				</EntityList>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<App />
			</BindxProvider>,
		)

		await waitFor(() => expect(queryByTestId(container, 'title-article-1')).not.toBeNull())

		act(() => (getByTestId(container, 'edit') as HTMLButtonElement).click())
		expect(getByTestId(container, 'title-article-1').textContent).toBe('LOCAL DRAFT')

		// Server changes article-1's title behind bindx's back; article-2 (clean)
		// changes too and serves as the "refetch landed" signal.
		mockData.Article['article-1']!.title = 'server changed'
		mockData.Article['article-2']!.title = 'landed'
		act(() => setKey('v2'))

		await waitFor(() => {
			expect(getByTestId(container, 'title-article-2').textContent).toBe('landed')
		})

		// Local edit on article-1 survived the list refetch
		expect(getByTestId(container, 'title-article-1').textContent).toBe('LOCAL DRAFT')
		expect(getByTestId(container, 'dirty-article-1').textContent).toBe('true')
	})
})
