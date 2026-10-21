// Regression test for <issue-url — filled in after Step 7>: `useSortingState`
// refuses a header click on a field outside `sortableFields` (`setOrderBy`), but
// a sort read from `stateStorage` or written by `setDirections` reaches
// `resolvedOrderBy` unchecked. A sort persisted before a field was removed from
// the schema therefore ends up in the list query, which the server rejects
// ("Cannot query field"), and the stored record keeps it there on every mount.
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { renderHook, render, cleanup, act, waitFor } from '@testing-library/react'
import React, { type ReactElement } from 'react'
import { BindxProvider, MockAdapter, defineSchema, scalar } from '@contember/bindx-react'
import { entityDef, type SortingDirections } from '@contember/bindx'
import {
	DataGrid,
	DataGridTextColumn,
	useDataViewContext,
	useSortingState,
	type SortingStateResult,
	type StateStorage,
} from '@contember/bindx-dataview'
import { TestTable, queryByTestId } from './helpers.js'

afterEach(() => {
	cleanup()
})

/** A backend holding a sort saved while the grid still offered a `legacyStatus` column. */
function storageWithSorting(sorting: SortingDirections): StateStorage {
	return {
		get: <T,>(key: string): T | undefined => (key === 'grid:sorting' ? (sorting as T) : undefined),
		set: (): void => {},
		remove: (): void => {},
	}
}

const sortableFields: ReadonlySet<string> = new Set(['title'])

describe('useSortingState — a sort on a field the grid does not offer', () => {
	test('should not order by a stored field outside sortableFields', () => {
		const { result } = renderHook(() => useSortingState({
			sortableFields,
			stateStorage: storageWithSorting({ legacyStatus: 'asc' }),
			storageKey: 'grid',
		}))

		expect(result.current.resolvedOrderBy).toBeUndefined()
		expect(result.current.state.directions).toEqual({})
	})

	test('should keep the stored fields the grid still offers', () => {
		const { result } = renderHook(() => useSortingState({
			sortableFields,
			stateStorage: storageWithSorting({ legacyStatus: 'asc', title: 'desc' }),
			storageKey: 'grid',
		}))

		expect(result.current.resolvedOrderBy).toEqual([{ title: 'desc' }])
	})

	test('should not order by a field outside sortableFields restored through setDirections', () => {
		const { result } = renderHook(() => useSortingState({ sortableFields }))

		act(() => result.current.setDirections({ legacyStatus: 'asc' }))

		expect(result.current.resolvedOrderBy).toBeUndefined()
	})

	test('should keep a stored field named by initialSorting even without a sortable column', () => {
		const { result } = renderHook(() => useSortingState({
			sortableFields,
			initialSorting: { createdAt: 'desc' },
			stateStorage: storageWithSorting({ createdAt: 'asc' }),
			storageKey: 'grid',
		}))

		expect(result.current.resolvedOrderBy).toEqual([{ createdAt: 'asc' }])
	})
})

// ============================================================================
// DataGrid: the stored sort reaches the list query
// ============================================================================

interface Article {
	id: string
	title: string
}

const gridSchema = defineSchema<{ Article: Article }>({
	entities: {
		Article: {
			fields: { id: scalar(), title: scalar() },
		},
	},
})

const ArticleDef = entityDef<Article>('Article')

function SortingProbe({ onSorting }: { onSorting: (sorting: SortingStateResult) => void }): null {
	onSorting(useDataViewContext().sorting)
	return null
}

describe('DataGrid — a stored sort on a field the grid no longer has', () => {
	test('should not order the list query by it', async () => {
		let latest: SortingStateResult | undefined
		const adapter = new MockAdapter({ Article: { a1: { id: 'a1', title: 'Alpha' } } }, { delay: 0 })
		const grid = (): ReactElement => (
			<BindxProvider adapter={adapter} schema={gridSchema}>
				<DataGrid entity={ArticleDef} stateStorage={storageWithSorting({ legacyStatus: 'asc' })} storageKey="grid">
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" />
							<SortingProbe onSorting={sorting => { latest = sorting }} />
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>
		)
		const { container } = render(grid())

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})
		expect(latest?.resolvedOrderBy).toBeUndefined()
	})
})
