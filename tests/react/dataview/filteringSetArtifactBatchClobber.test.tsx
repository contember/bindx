// Regression test for https://github.com/contember/bindx/issues/66: two
// setArtifact calls batched into one commit each spread the same stale record,
// so the earlier write was silently lost.
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	scalar,
} from '@contember/bindx-react'
import { entityDef } from '@contember/bindx'
import type { EnumFilterArtifact, TextFilterArtifact } from '@contember/bindx'
import {
	DataGrid,
	DataGridTextColumn,
	DataGridEnumColumn,
	useDataViewContext,
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

interface TestSchema {
	Article: Article
}

const localSchema = defineSchema<TestSchema>({
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

let filteringRef: FilteringState | null = null

function FilteringProbe(): null {
	filteringRef = useDataViewContext().filtering
	return null
}

describe('FilteringState.setArtifact under React batching', () => {
	test('should keep both artifacts when two filters are set within one commit', async () => {
		const adapter = new MockAdapter(mockData, { delay: 0 })
		filteringRef = null

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={articleDef}>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" filter />
							<DataGridEnumColumn field={it.status} header="Status" filter options={{ published: 'Published', draft: 'Draft' }} />
							<FilteringProbe />
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})
		expect(filteringRef).not.toBeNull()

		// A two-filter "preset" applied in a single tick, as a save/restore feature does.
		await act(async () => {
			filteringRef!.setArtifact('title', { mode: 'contains', query: 'alpha' } satisfies TextFilterArtifact)
			filteringRef!.setArtifact('status', { values: ['published'] } satisfies EnumFilterArtifact)
		})

		// Both writes must survive the commit, not just the later one.
		expect(filteringRef!.getArtifact('status')).toEqual({ values: ['published'] })
		expect(filteringRef!.getArtifact('title')).toEqual({ mode: 'contains', query: 'alpha' })
	})
})
