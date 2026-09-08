// Follow-up to issue #66: `useDataViewFilter` resolved its `SetStateAction`
// updater against the render snapshot (`filtering.getArtifact`), so two
// functional updates on the *same* filter name batched into one commit both
// saw the same `prev` and the second erased the first. Every action hook
// (enum/boolean/relation/null) drives its `set()` through that path.
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, renderHook, waitFor, cleanup, act } from '@testing-library/react'
import React, { type Dispatch, type SetStateAction } from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	scalar,
} from '@contember/bindx-react'
import { createEnumFilterHandler, createTextFilterHandler, entityDef } from '@contember/bindx'
import type { EnumFilterArtifact, FilterArtifact, FilterHandler, TextFilterArtifact } from '@contember/bindx'
import {
	DataGrid,
	DataGridEnumColumn,
	DataGridTextColumn,
	useDataViewContext,
	useDataViewEnumFilter,
	useDataViewFilter,
	useFilteringState,
	type FilteringState,
} from '@contember/bindx-dataview'
import { queryByTestId, TestTable } from './helpers.js'

afterEach(() => {
	cleanup()
})

interface Article {
	id: string
	title: string
	status: string
}

const localSchema = defineSchema<{ Article: Article }>({
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

const articleDef = entityDef<Article>('Article')

const mockData = {
	Article: {
		'a1': { id: 'a1', title: 'Alpha Article', status: 'published' },
		'a2': { id: 'a2', title: 'Beta Post', status: 'draft' },
	},
}

const filterDefs = new Map<string, { handler: FilterHandler<FilterArtifact> }>([
	['title', { handler: createTextFilterHandler('title') }],
	['status', { handler: createEnumFilterHandler('status') }],
])

function appendEnumValue(value: string): (current: FilterArtifact | undefined) => EnumFilterArtifact {
	return current => ({
		values: [...(current !== undefined && 'values' in current ? current.values ?? [] : []), value],
	})
}

describe('FilteringState.setArtifact — updaters', () => {
	test('should compose two updaters on the same filter within one commit', () => {
		const { result } = renderHook(() => useFilteringState({ filters: filterDefs }))

		act(() => {
			result.current.setArtifact('status', appendEnumValue('draft'))
			result.current.setArtifact('status', appendEnumValue('published'))
		})

		expect(result.current.getArtifact('status')).toEqual({ values: ['draft', 'published'] })
	})

	test('should reset to the default artifact when an updater returns undefined', () => {
		const { result } = renderHook(() => useFilteringState({ filters: filterDefs }))

		act(() => {
			result.current.setArtifact('title', { mode: 'startsWith', query: 'alpha' } satisfies TextFilterArtifact)
		})
		expect(result.current.hasActiveFilters).toBe(true)

		act(() => {
			result.current.setArtifact('title', () => undefined)
		})

		expect(result.current.getArtifact('title')).toEqual({ mode: 'contains', query: '' })
		expect(result.current.hasActiveFilters).toBe(false)
	})

	test('should still accept a plain artifact value', () => {
		const { result } = renderHook(() => useFilteringState({ filters: filterDefs }))

		act(() => {
			result.current.setArtifact('title', { mode: 'equals', query: 'beta' } satisfies TextFilterArtifact)
		})

		expect(result.current.getArtifact('title')).toEqual({ mode: 'equals', query: 'beta' })
	})
})

let filteringRef: FilteringState | null = null
let setStatusFilter: Dispatch<SetStateAction<EnumFilterArtifact | undefined>> | null = null
let toggleDraft: (() => void) | null = null
let togglePublished: (() => void) | null = null

function FilterProbe(): null {
	filteringRef = useDataViewContext().filtering
	const [, setFilter] = useDataViewFilter<EnumFilterArtifact>('status')
	setStatusFilter = setFilter

	const [, setDraft] = useDataViewEnumFilter('status', 'draft')
	const [, setPublished] = useDataViewEnumFilter('status', 'published')
	toggleDraft = () => setDraft('toggleInclude')
	togglePublished = () => setPublished('toggleInclude')

	return null
}

function renderGrid(): ReturnType<typeof render> {
	filteringRef = null
	setStatusFilter = null
	const adapter = new MockAdapter(mockData, { delay: 0 })

	return render(
		<BindxProvider adapter={adapter} schema={localSchema}>
			<DataGrid entity={articleDef}>
				{it => (
					<>
						<DataGridTextColumn field={it.title} header="Title" filter />
						<DataGridEnumColumn field={it.status} header="Status" filter options={{ published: 'Published', draft: 'Draft' }} />
						<FilterProbe />
						<TestTable />
					</>
				)}
			</DataGrid>
		</BindxProvider>,
	)
}

async function renderLoadedGrid(): Promise<Element> {
	const { container } = renderGrid()
	await waitFor(() => {
		expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
	})
	return container
}

function statusArtifact(): EnumFilterArtifact | undefined {
	return filteringRef!.getArtifact('status')
}

describe('useDataViewFilter — updaters reach the state layer', () => {
	test('should keep both updates when two functional writes land in one commit', async () => {
		await renderLoadedGrid()

		await act(async () => {
			setStatusFilter!(current => ({ ...current, values: [...(current?.values ?? []), 'draft'] }))
			setStatusFilter!(current => ({ ...current, values: [...(current?.values ?? []), 'published'] }))
		})

		expect(statusArtifact()?.values).toEqual(['draft', 'published'])
	})

	test('should keep both values when one handler toggles two enum values', async () => {
		await renderLoadedGrid()

		await act(async () => {
			toggleDraft!()
			togglePublished!()
		})

		expect(statusArtifact()?.values).toEqual(['draft', 'published'])
	})

	test('should reset to the default artifact when an updater returns undefined', async () => {
		await renderLoadedGrid()

		await act(async () => {
			setStatusFilter!({ values: ['draft'] })
		})
		expect(statusArtifact()?.values).toEqual(['draft'])

		await act(async () => {
			setStatusFilter!(() => undefined)
		})

		expect(statusArtifact()).toEqual({})
		expect(filteringRef!.hasActiveFilters).toBe(false)
	})

	test('should still accept a plain artifact value', async () => {
		await renderLoadedGrid()

		await act(async () => {
			setStatusFilter!({ values: ['published'] })
		})

		expect(statusArtifact()?.values).toEqual(['published'])
	})
})
