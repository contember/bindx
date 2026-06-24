// Regression guard for fulltext query filters over HasOne nested text fields.
//
// `<DataGridQueryFilter />` only renders the toolbar search input when at
// least one column registers `isTextSearchable: true` AND a `fieldName`.
// `DataGridTextColumn` is the only built-in that sets `isTextSearchable`, and
// it extracts the field path from the FieldRef's `FIELD_REF_META`.
//
// Previously that path was just the last accessed segment (`"name"`), not the
// dotted chain (`"author.name"`): a text column bound to a HasOne field like
// `it.author.name` registered the wrong path (`Article.name`), so the auto-built
// `createFullTextFilterHandler(textFieldPaths)` produced a where clause against
// a non-existent field. Now the collector proxy threads the absolute `fullPath`,
// so the registered path is the full dotted chain and the where clause nests
// correctly through the relation.
//
// `createFullTextFilterHandler` already supports dotted paths internally (it
// calls `buildNestedWhere` for each path); this test guards the composition
// across the bindx-dataview column surface.
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
// Regression guard
// ============================================================================

describe('DataGrid fulltext across HasOne nested fields', () => {
	test('registers the full nested HasOne text path for the toolbar query filter', async () => {
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
							{/* Pass `it.author.name` (a field reached through the HasOne
							 * relation) to a text column. The collector proxy threads the
							 * absolute `fullPath`, so the registered text-searchable path is
							 * the dotted chain `"author.name"` and the query filter handler
							 * builds a where clause nested under the relation. */}
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

		// The toolbar query filter is registered (a text column was found) and
		// targets the correct nested path `"author.name"` (asserted via the
		// resulting where clause below).
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

		// Expect { author: { name: { containsCI: 'John' } } } — full-text search
		// nested through `author.name`. The collector proxy preserves the parent
		// context on the FieldRef via `fullPath`, so the where clause nests under
		// the relation instead of targeting a non-existent `Article.name` field.
		expect(capturedWhere).toEqual({
			author: { name: { containsCI: 'John' } },
		})
	})
})
