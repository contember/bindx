/**
 * A column whose `field` is not a field ref (the common "actions" column bound to `it.id`, which the
 * entity proxy resolves to a plain id string) gets its name from `Math.random()`. Consumers key their
 * cells by that name, so an unstable name re-mounts the cell on every re-render of the grid.
 */
// Regression test for <this-issue-url>
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	scalar,
} from '@contember/bindx-react'
import { schema } from '../../shared/index.js'
import { DataGrid, DataGridTextColumn, useDataViewContext } from '@contember/bindx-dataview'

afterEach(() => {
	cleanup()
})

interface Article {
	id: string
	title: string
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
			},
		},
	},
})

function createData(): Record<string, Record<string, Record<string, unknown>>> {
	return {
		Article: {
			'a1': { id: 'a1', title: 'Alpha' },
		},
	}
}

/** Records the column names of every render, the way a table keys its cells by `col.name`. */
function ColumnNameProbe({ onNames }: { onNames: (names: string[]) => void }): null {
	const { columns } = useDataViewContext()
	onNames(columns.map(col => col.name))
	return null
}

describe('DataGrid column names', () => {
	test('should stay stable across re-renders when a column has no field ref', async () => {
		const adapter = new MockAdapter(createData(), { delay: 0 })
		const renders: string[][] = []

		function Grid(): React.ReactElement {
			return (
				<BindxProvider adapter={adapter} schema={localSchema}>
					<DataGrid entity={schema.Article}>
						{it => (
							<>
								<DataGridTextColumn field={it.title} header="Title" />
								{/* An actions column: `it.id` is the entity id string, not a field ref. */}
								<DataGridTextColumn field={it.id} header="">
									{() => <span>actions</span>}
								</DataGridTextColumn>
								<ColumnNameProbe onNames={names => renders.push(names)} />
							</>
						)}
					</DataGrid>
				</BindxProvider>
			)
		}

		const { rerender } = render(<Grid />)
		await waitFor(() => expect(renders.length).toBeGreaterThan(0))
		const before = renders[renders.length - 1]!

		rerender(<Grid />)
		await waitFor(() => expect(renders.length).toBeGreaterThan(1))
		const after = renders[renders.length - 1]!

		expect(after).toEqual(before)
	})
})
