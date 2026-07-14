// Regression test for <issue-url — filled in after filing>
//
// FilteringState offers no bulk artifact replace, and `setArtifact` builds the
// next record from the *render-snapshot* `artifacts` closure instead of the
// functional-update form. Two `setArtifact` calls batched into one React
// commit therefore each spread the same stale record — the second write wins
// and the first is silently lost. Restoring a saved filter combination
// ("filter presets": apply a stored Record<filterName, FilterArtifact> at
// runtime) is impossible without one-write-per-commit workarounds.
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

		// Apply a two-filter "preset" in a single tick — exactly what a
		// save/restore feature does after loading a stored artifact record.
		await act(async () => {
			filteringRef!.setArtifact('title', { mode: 'contains', query: 'alpha' } satisfies TextFilterArtifact)
			filteringRef!.setArtifact('status', { values: ['published'] } satisfies EnumFilterArtifact)
		})

		const statusArtifact = filteringRef!.getArtifact('status') as EnumFilterArtifact | undefined
		const titleArtifact = filteringRef!.getArtifact('title') as TextFilterArtifact | undefined

		// The later write survives…
		expect(statusArtifact?.values).toEqual(['published'])
		// …and so must the earlier one. With the stale-snapshot spread in
		// `setArtifact` this comes back as the default artifact (query: '').
		expect(titleArtifact?.query).toBe('alpha')
	})
})
