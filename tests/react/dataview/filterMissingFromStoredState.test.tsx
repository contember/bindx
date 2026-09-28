// Regression test for https://github.com/contember/bindx/issues/125: a
// persisted filter record that predates a registered filter (it was written
// before the filter existed) leaves that filter out of `resolvedWhere`, while
// `filters` reports an artifact for it. The filter's `initialArtifact` is not
// applied either, so a filter meant to start constrained starts unconstrained.
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { renderHook, render, cleanup, act, waitFor } from '@testing-library/react'
import React, { type ReactElement, type ReactNode } from 'react'
import { BindxProvider, MockAdapter, defineSchema, hasOne, scalar } from '@contember/bindx-react'
import { createEnumFilterHandler, createTextFilterHandler, entityDef } from '@contember/bindx'
import type {
	EntityAccessor,
	EnumFilterArtifact,
	FilterArtifact,
	FilterHandler,
	RelationFilterArtifact,
	TextFilterArtifact,
} from '@contember/bindx'
import {
	DataGrid,
	DataGridEnumColumn,
	DataGridHasOneColumn,
	DataGridTextColumn,
	useDataViewContext,
	useFilteringState,
	type FilteringState,
	type StateStorage,
} from '@contember/bindx-dataview'
import { TestTable, getRowCount, queryByTestId } from './helpers.js'

afterEach(() => {
	cleanup()
})

/** A backend holding a record saved while the grid had only the `title` filter. */
function storageWithRecordWithoutStatus(): StateStorage {
	return {
		get: <T,>(key: string): T | undefined =>
			key === 'grid:filters' ? ({ title: { mode: 'contains', query: '' } } as T) : undefined,
		set: (): void => {},
		remove: (): void => {},
	}
}

const publishedOnly: EnumFilterArtifact = { values: ['published'] }

const filterDefs = new Map<string, { handler: FilterHandler<FilterArtifact>; initialArtifact?: FilterArtifact }>([
	['title', { handler: createTextFilterHandler('title') }],
	['status', { handler: createEnumFilterHandler('status'), initialArtifact: publishedOnly }],
])

describe('useFilteringState — stored record that predates a filter', () => {
	test('should start the missing filter at its initial artifact', () => {
		const { result } = renderHook(() => useFilteringState({
			filters: filterDefs,
			stateStorage: storageWithRecordWithoutStatus(),
			storageKey: 'grid',
		}))

		expect(result.current.getArtifact('status')).toEqual(publishedOnly)
		expect(result.current.resolvedWhere).toEqual({ status: { in: ['published'] } })
		expect(result.current.hasActiveFilters).toBe(true)
	})

	test('should report the same artifact through filters, getArtifact and resolvedWhere', () => {
		const { result } = renderHook(() => useFilteringState({
			filters: filterDefs,
			stateStorage: storageWithRecordWithoutStatus(),
			storageKey: 'grid',
		}))

		const shown = result.current.filters.get('status')?.artifact
		const handler = filterDefs.get('status')?.handler
		expect(result.current.getArtifact('status')).toEqual(shown)
		expect(result.current.resolvedWhere).toEqual(shown === undefined ? undefined : handler?.toWhere(shown))
	})
})

describe('useFilteringState — a record that omits a registered filter', () => {
	test('should read a filter omitted by setAllArtifacts at its initial artifact everywhere', () => {
		const { result } = renderHook(() => useFilteringState({ filters: filterDefs }))

		act(() => result.current.setAllArtifacts({ title: { mode: 'contains', query: 'x' } }))

		expect(result.current.getArtifact('status')).toEqual(publishedOnly)
		expect(result.current.filters.get('status')?.artifact).toEqual(publishedOnly)
		expect(result.current.resolvedWhere).toEqual({
			and: [{ title: { containsCI: 'x' } }, { status: { in: ['published'] } }],
		})
	})

	test('should hand an updater the initial artifact of a filter the record omits', () => {
		const { result } = renderHook(() => useFilteringState({
			filters: filterDefs,
			stateStorage: storageWithRecordWithoutStatus(),
			storageKey: 'grid',
		}))
		let seen: FilterArtifact | undefined

		act(() => result.current.setArtifact('status', current => {
			seen = current
			return current
		}))

		expect(seen).toEqual(publishedOnly)
	})

	test('should clear one filter to the handler default and reset all to the initial artifacts', () => {
		const { result } = renderHook(() => useFilteringState({ filters: filterDefs }))

		act(() => result.current.resetFilter('status'))
		expect(result.current.getArtifact('status')).toEqual({})
		expect(result.current.resolvedWhere).toBeUndefined()

		act(() => result.current.resetAll())
		expect(result.current.getArtifact('status')).toEqual(publishedOnly)
	})
})

// ============================================================================
// DataGrid: a column declares where its filter starts
// ============================================================================

interface Author {
	id: string
	name: string
}

interface Article {
	id: string
	title: string
	status: string
	author: Author | null
}

const gridSchema = defineSchema<{ Article: Article; Author: Author }>({
	entities: {
		Article: {
			fields: { id: scalar(), title: scalar(), status: scalar(), author: hasOne('Author', { nullable: true }) },
		},
		Author: {
			fields: { id: scalar(), name: scalar() },
		},
	},
})

const ArticleDef = entityDef<Article>('Article')

function createArticles(): Record<string, Record<string, Record<string, unknown>>> {
	return {
		Article: {
			a1: { id: 'a1', title: 'Alpha', status: 'published', author: { id: 'au1', name: 'John' } },
			a2: { id: 'a2', title: 'Beta', status: 'draft', author: { id: 'au2', name: 'Jane' } },
			a3: { id: 'a3', title: 'Gamma', status: 'published', author: { id: 'au1', name: 'John' } },
		},
	}
}

function FilteringProbe({ onFiltering }: { onFiltering: (filtering: FilteringState) => void }): null {
	onFiltering(useDataViewContext().filtering)
	return null
}

type ArticleColumns = (it: EntityAccessor<Article>) => ReactNode

const statusColumnStartingPublished: ArticleColumns = it => (
	<>
		<DataGridTextColumn field={it.title} header="Title" filter />
		<DataGridEnumColumn field={it.status} header="Status" options={['published', 'draft']} filter filterInitialArtifact={publishedOnly} />
	</>
)

function renderGrid(
	columns: ArticleColumns,
	stateStorage?: StateStorage,
): { container: HTMLElement; filtering: () => FilteringState } {
	let latest: FilteringState | undefined
	const adapter = new MockAdapter(createArticles(), { delay: 0 })
	const grid = (): ReactElement => (
		<BindxProvider adapter={adapter} schema={gridSchema}>
			<DataGrid entity={ArticleDef} stateStorage={stateStorage} storageKey="grid">
				{it => (
					<>
						{columns(it)}
						<FilteringProbe onFiltering={filtering => { latest = filtering }} />
						<TestTable />
					</>
				)}
			</DataGrid>
		</BindxProvider>
	)
	const { container } = render(grid())
	return {
		container,
		filtering: () => {
			if (!latest) throw new Error('DataGrid has not rendered its context yet')
			return latest
		},
	}
}

describe('DataGrid — a column with an initial filter artifact', () => {
	test('should start the grid filtered by the column initial artifact', async () => {
		const { container, filtering } = renderGrid(statusColumnStartingPublished)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
			expect(getRowCount(container)).toBe(2)
		})
		expect(filtering().getArtifact('status')).toEqual(publishedOnly)
		expect(filtering().hasActiveFilters).toBe(true)
	})

	test('should apply the initial artifact when the stored record predates the filter', async () => {
		const { container, filtering } = renderGrid(statusColumnStartingPublished, storageWithRecordWithoutStatus())

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
			expect(getRowCount(container)).toBe(2)
		})
		expect(filtering().filters.get('status')?.artifact).toEqual(publishedOnly)
	})

	test('should pass the initial artifact of a createColumn column to its filter', async () => {
		const alphaOnly: TextFilterArtifact = { mode: 'contains', query: 'Alpha' }
		const { container, filtering } = renderGrid(it => (
			<DataGridTextColumn field={it.title} header="Title" filter filterInitialArtifact={alphaOnly} />
		))

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
			expect(getRowCount(container)).toBe(1)
		})
		expect(filtering().getArtifact('title')).toEqual(alphaOnly)
	})

	test('should pass the initial artifact of a relation column to its filter', async () => {
		const janeOnly: RelationFilterArtifact = { id: ['au2'] }
		const { container, filtering } = renderGrid(it => (
			<DataGridHasOneColumn field={it.author} header="Author" filter filterInitialArtifact={janeOnly}>
				{author => author.name.value}
			</DataGridHasOneColumn>
		))

		// MockAdapter does not evaluate conditions on a relation, so this asserts the query, not the rows.
		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})
		expect(filtering().getArtifact('author')).toEqual(janeOnly)
		expect(filtering().resolvedWhere).toEqual({ author: { id: { eq: 'au2' } } })
	})
})
