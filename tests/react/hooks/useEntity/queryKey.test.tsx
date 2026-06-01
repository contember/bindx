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

	test('refetch updates a clean (un-edited) field to the new server value', async () => {
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

	test('refetch preserves a locally edited (dirty) field while updating a clean sibling', async () => {
		// The issue's contract: a refetch must NOT silently overwrite local dirty
		// edits. The user edits `title`; the server changes `content`. After the
		// refetch the edit on `title` survives and stays dirty, while `content`
		// (untouched locally) picks up the fresh server value.
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 20 })

		let setKey: (key: string) => void = () => {}

		function TestComponent() {
			const [key, setLocalKey] = useState('v1')
			setKey = setLocalKey

			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' }, queryKey: key },
				e => e.title().content(),
			)

			if (article.$status !== 'ready') return null
			return (
				<div>
					<div data-testid="title">{article.title.value}</div>
					<div data-testid="content">{article.content.value}</div>
					<div data-testid="title-dirty">{String(article.title.isDirty)}</div>
					<button data-testid="edit" onClick={() => article.title.setValue('LOCAL DRAFT')} />
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => expect(queryByTestId(container, 'title')).not.toBeNull())

		// User edits title locally -> dirty
		act(() => (getByTestId(container, 'edit') as HTMLButtonElement).click())
		expect(getByTestId(container, 'title').textContent).toBe('LOCAL DRAFT')
		expect(getByTestId(container, 'title-dirty').textContent).toBe('true')

		// Server changes a DIFFERENT field, then a queryKey bump refetches
		mockData.Article['article-1']!.content = 'fresh server content'
		act(() => setKey('v2'))

		await waitFor(() => {
			expect(getByTestId(container, 'content').textContent).toBe('fresh server content')
		})

		// The local edit on title survived and is still dirty
		expect(getByTestId(container, 'title').textContent).toBe('LOCAL DRAFT')
		expect(getByTestId(container, 'title-dirty').textContent).toBe('true')
	})

	test('refetch keeps the dirty edit but advances the server baseline ($reset reveals new server value)', async () => {
		// The user edits `title`; the server ALSO changes `title` to a different
		// value. The local edit wins (not clobbered), but the baseline moves: a
		// subsequent $reset drops to the NEW server value, not the stale one.
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 20 })

		let setKey: (key: string) => void = () => {}

		function TestComponent() {
			const [key, setLocalKey] = useState('v1')
			setKey = setLocalKey

			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' }, queryKey: key },
				e => e.title().content(),
			)

			if (article.$status !== 'ready') return null
			return (
				<div>
					<div data-testid="title">{article.title.value}</div>
					{/* clean sibling — used purely as a "refetch landed" signal */}
					<div data-testid="content">{article.content.value}</div>
					<div data-testid="dirty">{String(article.title.isDirty)}</div>
					<button data-testid="edit" onClick={() => article.title.setValue('LOCAL DRAFT')} />
					<button data-testid="reset" onClick={() => article.$reset()} />
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => expect(queryByTestId(container, 'title')).not.toBeNull())

		act(() => (getByTestId(container, 'edit') as HTMLButtonElement).click())
		expect(getByTestId(container, 'title').textContent).toBe('LOCAL DRAFT')

		// Server changes the SAME field (plus a clean sibling as a landed-signal), then refetch
		mockData.Article['article-1']!.title = 'SERVER WINS'
		mockData.Article['article-1']!.content = 'landed'
		act(() => setKey('v2'))

		// The clean sibling updating proves the refetch landed
		await waitFor(() => {
			expect(getByTestId(container, 'content').textContent).toBe('landed')
		})
		// The dirty edit on title survived the refetch
		expect(getByTestId(container, 'title').textContent).toBe('LOCAL DRAFT')
		expect(getByTestId(container, 'dirty').textContent).toBe('true')

		// Reset drops to the NEW server baseline, proving it was advanced
		act(() => (getByTestId(container, 'reset') as HTMLButtonElement).click())
		expect(getByTestId(container, 'title').textContent).toBe('SERVER WINS')
		expect(getByTestId(container, 'dirty').textContent).toBe('false')
	})
})

describe('useEntity hook - queryKey refetch with relations', () => {
	test('refetch updates a has-one relation field to the new server value', async () => {
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 20 })

		let setKey: (key: string) => void = () => {}

		function TestComponent() {
			const [key, setLocalKey] = useState('v1')
			setKey = setLocalKey

			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' }, queryKey: key },
				e => e.title().author(a => a.id().name()),
			)

			if (article.$status !== 'ready') return null
			return <div data-testid="author">{article.author.name.value}</div>
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => expect(queryByTestId(container, 'author')).not.toBeNull())
		expect(getByTestId(container, 'author').textContent).toBe('John Doe')

		// Server renames the related author behind bindx's back
		mockData.Article['article-1']!.author = { id: 'author-1', name: 'Renamed Author', email: 'john@example.com', bio: 'Writer' }
		act(() => setKey('v2'))

		await waitFor(() => {
			expect(getByTestId(container, 'author').textContent).toBe('Renamed Author')
		})
	})

	test('refetch updates a has-many relation to the new server items', async () => {
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 20 })

		let setKey: (key: string) => void = () => {}

		function TestComponent() {
			const [key, setLocalKey] = useState('v1')
			setKey = setLocalKey

			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' }, queryKey: key },
				e => e.title().tags(t => t.id().name()),
			)

			if (article.$status !== 'ready') return null
			return <div data-testid="tags">{article.$data!.tags!.map(t => t.name).join(',')}</div>
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => expect(queryByTestId(container, 'tags')).not.toBeNull())
		expect(getByTestId(container, 'tags').textContent).toBe('JavaScript,React')

		mockData.Article['article-1']!.tags = [{ id: 'tag-3', name: 'TypeScript', color: '#3178c6' }]
		act(() => setKey('v2'))

		await waitFor(() => {
			expect(getByTestId(container, 'tags').textContent).toBe('TypeScript')
		})
	})

	test('refetch preserves a locally edited has-one relation field while updating a clean parent sibling', async () => {
		// The dirty-edit contract extends to related entities: editing a related
		// entity's field locally must survive a parent refetch, even when the
		// server changes that same related field. (Regression: the embedded-data
		// propagation used to overwrite the child snapshot wholesale.)
		const mockData = createMockData()
		const adapter = new MockAdapter(mockData, { delay: 20 })

		let setKey: (key: string) => void = () => {}

		function TestComponent() {
			const [key, setLocalKey] = useState('v1')
			setKey = setLocalKey

			const article = useEntity(
				schema.Article,
				{ by: { id: 'article-1' }, queryKey: key },
				e => e.title().author(a => a.id().name()),
			)

			if (article.$status !== 'ready') return null
			return (
				<div>
					<div data-testid="title">{article.title.value}</div>
					<div data-testid="author">{article.author.name.value}</div>
					<div data-testid="author-dirty">{String(article.author.name.isDirty)}</div>
					<button data-testid="edit" onClick={() => article.author.name.setValue('LOCAL AUTHOR DRAFT')} />
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<TestComponent />
			</BindxProvider>,
		)

		await waitFor(() => expect(queryByTestId(container, 'author')).not.toBeNull())

		// Edit the related author's name locally -> dirty
		act(() => (getByTestId(container, 'edit') as HTMLButtonElement).click())
		expect(getByTestId(container, 'author').textContent).toBe('LOCAL AUTHOR DRAFT')
		expect(getByTestId(container, 'author-dirty').textContent).toBe('true')

		// Server changes the parent's title (clean -> landed signal) AND the
		// author's name (same field the user is editing).
		mockData.Article['article-1']!.title = 'landed'
		mockData.Article['article-1']!.author = { id: 'author-1', name: 'SERVER AUTHOR', email: 'john@example.com', bio: 'Writer' }
		act(() => setKey('v2'))

		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('landed')
		})

		// The local edit on the related author survived and is still dirty
		expect(getByTestId(container, 'author').textContent).toBe('LOCAL AUTHOR DRAFT')
		expect(getByTestId(container, 'author-dirty').textContent).toBe('true')
	})
})
