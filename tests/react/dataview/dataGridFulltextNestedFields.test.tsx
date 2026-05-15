// Regression test for <issue-url — filled in after Step 7>
//
// `<DataGridQueryFilter />` only renders the toolbar search input when at
// least one column registers `isTextSearchable: true` AND a `fieldName`.
// `DataGridTextColumn` is the only built-in that sets `isTextSearchable`,
// and it extracts `fieldName` from the FieldRef's `FIELD_REF_META.fieldName`
// — which is just the last accessed segment (`"name"`), not a dotted path
// (`"author.name"`).
//
// As a result, when the grid's entity has NO direct scalar text fields and
// the searchable text data lives only inside HasOne relations, there is no
// public API to register a `"author.name"`-style path into the auto-built
// `createFullTextFilterHandler(textFieldPaths)`. The query filter handler
// is not created → toolbar search input never appears.
//
// `createFullTextFilterHandler` itself DOES support dotted paths internally
// (it calls `buildNestedWhere` for each path), so this is a missing
// composition API in the bindx-ui/bindx-dataview surface, not a fundamental
// limitation of the filter handler.
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	defineSchema,
	hasOne,
	MockAdapter,
	scalar,
} from '@contember/bindx-react'
import { entityDef } from '@contember/bindx'
import {
	DataGrid,
	DataGridHasOneColumn,
	DataGridTextColumn,
	QUERY_FILTER_NAME,
	useDataViewContext,
} from '@contember/bindx-dataview'

afterEach(() => {
	cleanup()
})

// ============================================================================
// Schema — Article has only HasOne author, no direct text scalars
// ============================================================================

interface Author {
	id: string
	name: string
	email: string
}

interface Article {
	id: string
	author: Author | null
}

interface TestSchema {
	Article: Article
	Author: Author
}

const localSchema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				author: hasOne('Author', { nullable: true }),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				email: scalar(),
			},
		},
	},
})

const localEntityDefs = {
	Article: entityDef<Article>('Article'),
	Author: entityDef<Author>('Author'),
} as const

function createMockData(): Record<string, Record<string, Record<string, unknown>>> {
	return {
		Article: {
			a1: { id: 'a1', author: { id: 'auth-1', name: 'John', email: 'john@example.com' } },
			a2: { id: 'a2', author: { id: 'auth-2', name: 'Jane', email: 'jane@example.com' } },
		},
		Author: {
			'auth-1': { id: 'auth-1', name: 'John', email: 'john@example.com' },
			'auth-2': { id: 'auth-2', name: 'Jane', email: 'jane@example.com' },
		},
	}
}

interface FilterState {
	registered: readonly string[]
	hasQueryFilter: boolean
}

// ============================================================================
// Failing repro
// ============================================================================

describe('DataGrid fulltext across HasOne nested fields', () => {
	test('public API cannot register a nested HasOne text path for the toolbar query filter', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		let captured: FilterState | null = null

		function FilterProbe(): React.ReactElement | null {
			const { filtering } = useDataViewContext()
			captured = {
				registered: Array.from(filtering.filters.keys()),
				hasQueryFilter: filtering.filters.has(QUERY_FILTER_NAME),
			}
			return null
		}

		// Render a grid where the only displayable content is the HasOne
		// author relation. No direct text scalars on Article.
		render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={localEntityDefs.Article}>
					{it => (
						<>
							{/* Nested access workaround attempt: pass `it.author.name` to a text
							 * column. The collector proxy returns a FieldRef whose `fieldName`
							 * is just `"name"`, so the registered text-searchable path is
							 * `"name"` — wrong entity. The query filter handler ends up looking
							 * for `Article.name` which doesn't exist. */}
							<DataGridTextColumn field={it.author.name} header="Author name" />
							<DataGridHasOneColumn field={it.author} header="Author">
								{author => author.name.value}
							</DataGridHasOneColumn>
							<FilterProbe />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(captured).not.toBeNull()
		})

		// The toolbar query filter IS registered (a text column was found), but it
		// targets the wrong path — `"name"` on Article, not `"author.name"`.
		// Demonstrate the gap by asserting that a properly nested path was the
		// one registered. This assertion is what we'd want to hold once the API
		// supports it; today it fails.
		const filters = Array.from(captured!.registered)
		expect(filters).toContain(QUERY_FILTER_NAME)

		// The full-text handler exposes its target paths via `toWhere` —
		// resolve them by activating the filter and inspecting the where clause.
		// Read the actual handler from the DataView context:
		const _adapter = adapter // keep reference alive for re-render
		let capturedWhere: Record<string, unknown> | undefined
		function WhereProbe(): React.ReactElement | null {
			const { filtering } = useDataViewContext()
			const handler = filtering.filters.get(QUERY_FILTER_NAME)?.handler
			if (handler) {
				capturedWhere = handler.toWhere({ mode: 'contains', query: 'John' } as never)
			}
			return null
		}

		cleanup() // re-render with the WhereProbe in place
		render(
			<BindxProvider adapter={_adapter} schema={localSchema}>
				<DataGrid entity={localEntityDefs.Article}>
					{it => (
						<>
							<DataGridTextColumn field={it.author.name} header="Author name" />
							<DataGridHasOneColumn field={it.author} header="Author">
								{author => author.name.value}
							</DataGridHasOneColumn>
							<WhereProbe />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(capturedWhere).toBeDefined()
		})

		// We WANT: { author: { name: { containsCI: 'John' } } } — full-text
		// search across `author.name`.
		// We GET: { name: { containsCI: 'John' } } — a where clause on a
		// non-existent `Article.name` field, because the collector proxy
		// stripped the parent context off the FieldRef.
		//
		// This assertion documents the desired behavior. It fails today.
		expect(capturedWhere).toEqual({
			author: { name: { containsCI: 'John' } },
		})
	})
})
