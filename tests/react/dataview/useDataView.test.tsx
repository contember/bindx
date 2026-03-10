/**
 * Tests for the useDataView hook — the low-level hook API for data views.
 */
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { renderHook, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	scalar,
	resolveSelectionMeta,
	type SelectionMeta,
} from '@contember/bindx-react'
import { useDataView } from '@contember/bindx-dataview'
import {
	createTextFilterHandler,
	createEnumFilterHandler,
} from '@contember/bindx'

afterEach(() => {
	cleanup()
})

// ============================================================================
// Schema
// ============================================================================

interface Article {
	id: string
	title: string
	status: string
}

interface TestSchema {
	Article: Article
}

const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				status: scalar(),
			},
		},
	},
})

function createData(): Record<string, Record<string, Record<string, unknown>>> {
	return {
		Article: {
			'a1': { id: 'a1', title: 'Alpha', status: 'published' },
			'a2': { id: 'a2', title: 'Beta', status: 'draft' },
			'a3': { id: 'a3', title: 'Charlie', status: 'published' },
			'a4': { id: 'a4', title: 'Delta', status: 'archived' },
		},
	}
}

// Build a simple selection with title and status fields
function buildSelection(): SelectionMeta {
	return resolveSelectionMeta<Article, Article>((e: any) => e.title().status())
}

function createWrapper(data: Record<string, Record<string, Record<string, unknown>>>) {
	const adapter = new MockAdapter(data, { delay: 0 })
	return function Wrapper({ children }: { children: React.ReactNode }) {
		return (
			<BindxProvider adapter={adapter} schema={schema}>
				{children}
			</BindxProvider>
		)
	}
}

// ============================================================================
// Tests
// ============================================================================

describe('useDataView', () => {
	test('loads data and returns items', async () => {
		const wrapper = createWrapper(createData())
		const selection = buildSelection()

		const { result } = renderHook(
			() => useDataView('Article', { selection }),
			{ wrapper },
		)

		// Initially loading
		expect(result.current.status).toBe('loading')

		// Wait for ready
		await waitFor(() => {
			expect(result.current.status).toBe('ready')
		})

		expect(result.current.items.length).toBe(4)
	})

	test('static filter restricts results', async () => {
		const wrapper = createWrapper(createData())
		const selection = buildSelection()

		const { result } = renderHook(
			() => useDataView('Article', {
				selection,
				filter: { status: { eq: 'published' } },
			}),
			{ wrapper },
		)

		await waitFor(() => {
			expect(result.current.status).toBe('ready')
		})

		expect(result.current.items.length).toBe(2)
	})

	test('filtering state is accessible and functional', async () => {
		const wrapper = createWrapper(createData())
		const selection = buildSelection()
		const filters = new Map([
			['title', { handler: createTextFilterHandler('title') }],
		])

		const { result } = renderHook(
			() => useDataView('Article', { selection, filters }),
			{ wrapper },
		)

		await waitFor(() => {
			expect(result.current.status).toBe('ready')
		})

		expect(result.current.items.length).toBe(4)
		expect(result.current.filtering.hasActiveFilters).toBe(false)

		// Apply a text filter
		await act(async () => {
			result.current.filtering.setArtifact('title', { mode: 'contains', query: 'Al' })
		})

		expect(result.current.filtering.hasActiveFilters).toBe(true)

		// Wait for refetch
		await waitFor(() => {
			expect(result.current.items.length).toBe(1)
		})
	})

	test('sorting state is accessible and functional', async () => {
		const wrapper = createWrapper(createData())
		const selection = buildSelection()

		const { result } = renderHook(
			() => useDataView('Article', {
				selection,
				sortableFields: new Set(['title']),
				initialSorting: { title: 'asc' },
			}),
			{ wrapper },
		)

		await waitFor(() => {
			expect(result.current.status).toBe('ready')
		})

		expect(result.current.sorting.state.directions).toEqual({ title: 'asc' })

		// Data should be sorted alphabetically
		const titles = result.current.items.map(i => i.data['title'])
		expect(titles).toEqual(['Alpha', 'Beta', 'Charlie', 'Delta'])
	})

	test('paging state limits results', async () => {
		const wrapper = createWrapper(createData())
		const selection = buildSelection()

		const { result } = renderHook(
			() => useDataView('Article', {
				selection,
				itemsPerPage: 2,
			}),
			{ wrapper },
		)

		await waitFor(() => {
			expect(result.current.status).toBe('ready')
		})

		expect(result.current.items.length).toBe(2)
		expect(result.current.paging.state.pageIndex).toBe(0)
		expect(result.current.paging.state.itemsPerPage).toBe(2)
	})

	test('paging navigation works', async () => {
		const wrapper = createWrapper(createData())
		const selection = buildSelection()

		const { result } = renderHook(
			() => useDataView('Article', {
				selection,
				itemsPerPage: 2,
				sortableFields: new Set(['title']),
				initialSorting: { title: 'asc' },
			}),
			{ wrapper },
		)

		await waitFor(() => {
			expect(result.current.status).toBe('ready')
		})

		// Page 1
		const page1Items = result.current.items.map(i => i.data['title'])
		expect(page1Items).toEqual(['Alpha', 'Beta'])

		// Go to page 2
		await act(async () => {
			result.current.paging.next()
		})

		await waitFor(() => {
			const page2Items = result.current.items.map(i => i.data['title'])
			expect(page2Items).toEqual(['Charlie', 'Delta'])
		})
	})

	test('empty data returns empty items', async () => {
		const wrapper = createWrapper({ Article: {} })
		const selection = buildSelection()

		const { result } = renderHook(
			() => useDataView('Article', { selection }),
			{ wrapper },
		)

		await waitFor(() => {
			expect(result.current.status).toBe('ready')
		})

		expect(result.current.items.length).toBe(0)
	})
})
