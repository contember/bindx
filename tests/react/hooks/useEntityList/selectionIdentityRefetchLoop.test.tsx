// Regression test for <issue-url filled in after the issue is created>
import '../../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	defineSchema,
	entityDef,
	MockAdapter,
	resolveSelectionMeta,
	scalar,
	useEntityList,
} from '@contember/bindx-react'

afterEach(() => {
	cleanup()
})

interface Author {
	id: string
	name: string
	email: string
}

interface TestSchema {
	Author: Author
}

const schema = defineSchema<TestSchema>({
	entities: {
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				email: scalar(),
			},
		},
	},
})

const authorDef = entityDef<Author>('Author')

function createMockData() {
	return {
		Author: {
			'author-1': { id: 'author-1', name: 'John Doe', email: 'john@example.com' },
			'author-2': { id: 'author-2', name: 'Jane Smith', email: 'jane@example.com' },
		},
	}
}

describe('useEntityList — pre-resolved selection identity', () => {
	test('should not refetch when an identical selection object with a stable queryKey gets a fresh identity', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		// Count backend round-trips.
		let queryCount = 0
		const originalQuery = adapter.query.bind(adapter)
		adapter.query = async (...args: Parameters<typeof originalQuery>) => {
			queryCount++
			return originalQuery(...args)
		}

		// Mirrors how DataGrid drives useEntityList: it passes a pre-resolved
		// `selection` (rebuilt by useDataGridSetup's collection useMemo, whose
		// deps include the `children` render-prop) together with a stable
		// serialized `queryKey`. When the grid is nested under a re-rendering
		// store subscriber, `children` gets a fresh identity, so `selection`
		// becomes a brand-new object of identical content — while `queryKey`
		// stays constant.
		//
		// `selectionVersion` controls the `selection` object identity
		// deterministically: bumping it once produces exactly one new
		// (content-identical) selection object, so the assertion is stable
		// and the test cannot livelock on the very loop it is guarding
		// against.
		function GridLike({ selectionVersion }: { selectionVersion: number }): React.ReactElement {
			const selection = React.useMemo(
				() => resolveSelectionMeta<Author, Author>(a => a.id().name().email()),
				[selectionVersion],
			)
			const list = useEntityList(authorDef, {
				selection,
				queryKey: 'stable-author-query-key',
			})
			if (list.$status !== 'ready') return <div data-testid="loading">Loading…</div>
			return <div data-testid="count">{list.length}</div>
		}

		const { container, rerender } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<GridLike selectionVersion={0} />
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(container.querySelector('[data-testid="count"]')?.textContent).toBe('2')
		})

		expect(queryCount).toBe(1)

		// One deliberate selection-identity change. Nothing else about the
		// query changed: same fields, same stable queryKey.
		rerender(
			<BindxProvider adapter={adapter} schema={schema}>
				<GridLike selectionVersion={1} />
			</BindxProvider>,
		)

		// Let any erroneously-scheduled refetch effect fire.
		await new Promise(resolve => setTimeout(resolve, 50))

		// The stable queryKey identifies this query; a new-but-identical
		// selection object must NOT trigger another backend round-trip.
		expect(queryCount).toBe(1)
	})
})
