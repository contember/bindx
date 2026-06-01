import '../../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act } from '@testing-library/react'
import React, { useState } from 'react'
import { BindxProvider, MockAdapter, useEntity } from '@contember/bindx-react'
import { getByTestId, queryByTestId, createMockData, schema, testSchema } from '../../../shared'

afterEach(() => {
	cleanup()
})

describe('useEntity hook - queryKey refetch (stale-while-revalidate)', () => {
	test('changing queryKey refetches without flicker — ready state survives', async () => {
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 20 })

		let setKey: (key: string) => void = () => {}

		function TestComponent() {
			const [key, setLocalKey] = useState('initial')
			setKey = setLocalKey

			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' }, queryKey: key },
				e => e.title(),
			)

			if (article.$isLoading) {
				return <div data-testid="loading">Loading...</div>
			}
			if (article.$isError || article.$isNotFound) {
				return <div data-testid="error">Error</div>
			}

			return (
				<div>
					<div data-testid="title">{article.title.value}</div>
					<div data-testid="refetching">{article.$isRefetching ? 'yes' : 'no'}</div>
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		// Wait for initial load
		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})
		expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		expect(getByTestId(container, 'refetching').textContent).toBe('no')

		// Mutate "server" data behind bindx's back (simulates workflow RPC)
		mockData.Article['article-1']!.title = 'Updated By RPC'

		// Bump queryKey — should refetch WITHOUT showing the loading fallback
		act(() => setKey('after-rpc'))

		// During refetch: loading fallback must NOT mount, title stays visible,
		// $isRefetching must flip to true
		expect(queryByTestId(container, 'loading')).toBeNull()
		expect(queryByTestId(container, 'title')).not.toBeNull()
		expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		expect(getByTestId(container, 'refetching').textContent).toBe('yes')

		// After refetch lands: new data + refetching flips back
		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Updated By RPC')
		})
		expect(getByTestId(container, 'refetching').textContent).toBe('no')
	})

	test('initial load still uses loading state (no data yet → no SWR)', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 20 })

		function TestComponent() {
			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' }, queryKey: 'k1' },
				e => e.title(),
			)

			if (article.$status !== 'ready') {
				return <div data-testid="loading">Loading...</div>
			}
			return <div data-testid="title">{article.title.value}</div>
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		// First render before data: loading fallback present
		expect(queryByTestId(container, 'loading')).not.toBeNull()

		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})
	})

	test('subtree DOM identity preserved across queryKey refetch', async () => {
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 20 })

		let setKey: (key: string) => void = () => {}

		function TestComponent() {
			const [key, setLocalKey] = useState('initial')
			setKey = setLocalKey

			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' }, queryKey: key },
				e => e.title(),
			)

			if (article.$status !== 'ready') {
				return <div data-testid="loading">Loading</div>
			}
			return <div data-testid="title">{article.title.value}</div>
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})

		const elementBeforeRefetch = getByTestId(container, 'title')

		mockData.Article['article-1']!.title = 'Refreshed'

		act(() => setKey('refresh-1'))

		// Same DOM node persists (no remount) during refetch
		const elementDuringRefetch = getByTestId(container, 'title')
		expect(elementDuringRefetch).toBe(elementBeforeRefetch)

		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Refreshed')
		})

		// And the same DOM node still after refetch lands
		const elementAfterRefetch = getByTestId(container, 'title')
		expect(elementAfterRefetch).toBe(elementBeforeRefetch)
	})

	test('refetch overwrites local serverData (dirty markers cleared)', async () => {
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 20 })

		let setKey: (key: string) => void = () => {}

		function TestComponent() {
			const [key, setLocalKey] = useState('v1')
			setKey = setLocalKey

			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' }, queryKey: key },
				e => e.title(),
			)

			if (article.$status !== 'ready') {
				return null
			}
			return <div data-testid="title">{article.title.value}</div>
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'title')).not.toBeNull()
		})

		mockData.Article['article-1']!.title = 'Server Edit'
		act(() => setKey('v2'))

		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Server Edit')
		})
	})
})
