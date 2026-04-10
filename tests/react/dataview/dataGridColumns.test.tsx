/**
 * Tests for the extensible column architecture:
 * - Custom column via defineColumnType() + createColumn()
 * - Custom column via manual staticRender
 * - extractColumnLeaves() with nested custom components
 * - Filter artifact type flows through to renderFilter
 * - analyzeChildren() with multiple marker types
 * - DataGridToolbarContent and DataGridLayout markers
 */
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
import { schema, testSchema } from '../../shared/index.js'
import { FIELD_REF_META, type TextFilterArtifact } from '@contember/bindx'
import {
	DataGrid,
	DataGridTextColumn,
	DataGridToolbarContent,
	DataGridLayout,
	defineColumnType,
	createColumn,
	ColumnLeaf,
	extractColumnLeaves,
	analyzeChildren,
	type ColumnLeafProps,
} from '@contember/bindx-dataview'
import { createTextFilterHandler } from '@contember/bindx'
import { Field, HasOne } from '@contember/bindx-react'
import { TestTable, getByTestId, queryByTestId, getRowCount, getCellText } from './helpers.js'

afterEach(() => {
	cleanup()
})

// ============================================================================
// Schema & Data
// ============================================================================

interface Article {
	id: string
	title: string
	status: string
	views: number
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
				views: scalar(),
			},
		},
	},
})

function createMockData(): Record<string, Record<string, Record<string, unknown>>> {
	return {
		Article: {
			'a1': { id: 'a1', title: 'Alpha', status: 'published', views: 100 },
			'a2': { id: 'a2', title: 'Beta', status: 'draft', views: 50 },
			'a3': { id: 'a3', title: 'Charlie', status: 'archived', views: 200 },
		},
	}
}

// ============================================================================
// Custom column type: uppercase text
// ============================================================================

const uppercaseColumnDef = defineColumnType<string, TextFilterArtifact>({
	name: 'uppercase',
	defaultSortable: true,
	isTextSearchable: true,
	createFilterHandler: createTextFilterHandler,
	extractValue: (accessor, fieldName) => {
		const fieldRef = (accessor as any)[fieldName]
		if (!fieldRef || typeof fieldRef !== 'object') return ''
		const value = (fieldRef as { value?: unknown }).value
		return typeof value === 'string' ? value.toUpperCase() : ''
	},
})

const UppercaseColumn = createColumn(uppercaseColumnDef, {
	renderCell: ({ value }) => value ?? '',
})

// ============================================================================
// Custom column type with renderFilter
// ============================================================================

const filteredColumnDef = defineColumnType<string, TextFilterArtifact>({
	name: 'filteredText',
	defaultSortable: false,
	isTextSearchable: false,
	createFilterHandler: createTextFilterHandler,
	extractValue: (accessor, fieldName) => {
		const fieldRef = (accessor as any)[fieldName]
		if (!fieldRef || typeof fieldRef !== 'object') return ''
		return ((fieldRef as { value?: unknown }).value as string) ?? ''
	},
})

const FilteredColumn = createColumn(filteredColumnDef, {
	renderCell: ({ value }) => value ?? '',
	renderFilter: ({ artifact, setArtifact }) => {
		return (
			<input
				data-testid="custom-filter-input"
				type="text"
				value={artifact?.query ?? ''}
				onChange={e => setArtifact({ ...artifact, query: e.target.value })}
			/>
		)
	},
})

// ============================================================================
// Custom column via manual staticRender
// ============================================================================

function BadgeColumn(_props: { field: unknown; header?: React.ReactNode }): React.ReactElement | null {
	return null
}

;(BadgeColumn as unknown as { staticRender: (props: Record<string, unknown>) => React.ReactNode }).staticRender = (
	props: Record<string, unknown>,
): React.ReactNode => {
	const fieldName = 'status' // hardcoded for test simplicity
	const header = (props['header'] as React.ReactNode) ?? fieldName

	const leafProps: ColumnLeafProps = {
		name: fieldName,
		fieldName,
		fieldRef: null,
		sortingField: null,
		filterName: null,
		filterHandler: undefined,
		isTextSearchable: false,
		columnType: 'badge',
		header,
		renderCell: (accessor) => {
			const ref = (accessor as unknown as Record<string, unknown>)[fieldName]
			const value = ref && typeof ref === 'object' && 'value' in ref
				? String((ref as { value: unknown }).value ?? '')
				: ''
			return <span data-testid="badge">[{value}]</span>
		},
	}

	return React.createElement(ColumnLeaf, leafProps as ColumnLeafProps)
}

// ============================================================================
// Wrapper component for testing nested extraction
// ============================================================================

function ColumnGroup(_props: { children: React.ReactNode }): React.ReactElement | null {
	return null
}

;(ColumnGroup as unknown as { staticRender: (props: Record<string, unknown>) => React.ReactNode }).staticRender = (
	props: Record<string, unknown>,
): React.ReactNode => {
	return (props['children'] as React.ReactNode) ?? null
}

// ============================================================================
// Tests
// ============================================================================

describe('Custom column via defineColumnType + createColumn', () => {
	test('renders cell with custom extractValue (uppercase)', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<UppercaseColumn field={it.title} header="Title (Upper)" />
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		expect(getRowCount(container)).toBe(3)
		expect(getCellText(container, 0, 'title')).toBe('ALPHA')
		expect(getCellText(container, 1, 'title')).toBe('BETA')
		expect(getCellText(container, 2, 'title')).toBe('CHARLIE')
	})

	test('custom column inherits defaultSortable from column type def', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<UppercaseColumn field={it.title} header="Title" />
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// uppercaseColumnDef has defaultSortable: true
		const header = getByTestId(container, 'datagrid-header-title')
		expect(header.querySelector('[data-testid="sort-indicator"]')).not.toBeNull()
	})

	test('custom column with children override', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<UppercaseColumn field={it.title} header="Title">
								{(value: string | null) => <em>{value}</em>}
							</UppercaseColumn>
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// children override should use the extractValue result (uppercase)
		const cell = getByTestId(container, 'datagrid-row-0-col-title')
		expect(cell.querySelector('em')).not.toBeNull()
		expect(cell.textContent).toBe('ALPHA')
	})
})

describe('Custom column via manual staticRender', () => {
	test('renders cell with custom rendering', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" />
							<BadgeColumn field={it.status} header="Status" />
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		expect(getRowCount(container)).toBe(3)
		// BadgeColumn wraps value in brackets
		expect(getCellText(container, 0, 'status')).toBe('[published]')
		expect(getCellText(container, 1, 'status')).toBe('[draft]')
	})

	test('manual staticRender column has correct columnType', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		let capturedColumns: readonly ColumnLeafProps[] = []
		const { useDataViewContext: useCtx } = await import('@contember/bindx-dataview')

		function Probe(): React.ReactElement | null {
			capturedColumns = useCtx().columns
			return null
		}

		render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<BadgeColumn field={it.status} header="Status" />
							<Probe />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(capturedColumns.length).toBeGreaterThan(0)
		})

		const badgeCol = capturedColumns.find(c => c.name === 'status')
		expect(badgeCol).toBeDefined()
		expect(badgeCol!.columnType).toBe('badge')
	})
})

describe('extractColumnLeaves with nested custom components', () => {
	test('resolves staticRender wrapper components recursively', () => {
		const elements = (
			<ColumnGroup>
				<DataGridTextColumn field={{ [FIELD_REF_META]: { fieldName: 'title' } } as any} header="Title" />
			</ColumnGroup>
		)

		const leaves = extractColumnLeaves(elements)
		expect(leaves.length).toBe(1)
		expect(leaves[0]!.fieldName).toBe('title')
		expect(leaves[0]!.header).toBe('Title')
	})

	test('resolves deeply nested wrapper components', () => {
		const elements = (
			<ColumnGroup>
				<>
					<ColumnGroup>
						<DataGridTextColumn field={{ [FIELD_REF_META]: { fieldName: 'a' } } as any} header="A" />
					</ColumnGroup>
					<DataGridTextColumn field={{ [FIELD_REF_META]: { fieldName: 'b' } } as any} header="B" />
				</>
			</ColumnGroup>
		)

		const leaves = extractColumnLeaves(elements)
		expect(leaves.length).toBe(2)
		expect(leaves[0]!.fieldName).toBe('a')
		expect(leaves[1]!.fieldName).toBe('b')
	})

	test('mixes createColumn and manual staticRender components', () => {
		const elements = (
			<>
				<DataGridTextColumn field={{ [FIELD_REF_META]: { fieldName: 'title' } } as any} header="Title" />
				<BadgeColumn field={{}} header="Badge" />
			</>
		)

		const leaves = extractColumnLeaves(elements)
		expect(leaves.length).toBe(2)
		expect(leaves[0]!.columnType).toBe('text')
		expect(leaves[1]!.columnType).toBe('badge')
	})
})

describe('Filter artifact type safety', () => {
	test('renderFilter receives typed artifact from createColumn', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<FilteredColumn field={it.title} header="Title" filter />
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		// The FilteredColumn has renderFilter defined — verify the column has it
		const { useDataViewContext: useCtx } = await import('@contember/bindx-dataview')

		let hasRenderFilter = false
		function FilterProbe(): React.ReactElement | null {
			const { columns } = useCtx()
			const col = columns.find(c => c.fieldName === 'title')
			hasRenderFilter = col?.renderFilter !== undefined
			return null
		}

		cleanup()
		render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<FilteredColumn field={it.title} header="Title" filter />
							<FilterProbe />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(hasRenderFilter).toBe(true)
		})
	})

	test('column without filter=true has no filterHandler', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const { useDataViewContext: useCtx } = await import('@contember/bindx-dataview')

		let columns: readonly ColumnLeafProps[] = []
		function Probe(): React.ReactElement | null {
			columns = useCtx().columns
			return null
		}

		render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<FilteredColumn field={it.title} header="Title" />
							<Probe />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(columns.length).toBeGreaterThan(0)
		})

		const col = columns.find(c => c.fieldName === 'title')
		expect(col?.filterHandler).toBeUndefined()
		expect(col?.filterName).toBeNull()
	})
})

// ============================================================================
// Layout marker — JSX analysis for selection (via DataGridLayout marker)
// ============================================================================

describe('DataGrid layout via DataGridLayout marker', () => {
	test('layout with Field and HasOne renders per item', async () => {
		const adapter = new MockAdapter({
			Article: {
				'a1': { id: 'a1', title: 'Alpha', author: { id: 'auth1', name: 'Alice' } },
				'a2': { id: 'a2', title: 'Beta', author: { id: 'auth2', name: 'Bob' } },
			},
			Author: {
				'auth1': { id: 'auth1', name: 'Alice' },
				'auth2': { id: 'auth2', name: 'Bob' },
			},
		}, { delay: 0 })

		const { useDataViewContext: useCtx } = await import('@contember/bindx-dataview')

		function LayoutRenderer(): React.ReactElement | null {
			const { layoutRenders, items, loaderState } = useCtx()
			const gridRender = layoutRenders.get('grid')
			if (loaderState !== 'loaded' || !gridRender) return <div data-testid="loading">loading</div>
			return (
				<div data-testid="tiles">
					{items.map((item, i) => (
						<div key={item.id} data-testid={`tile-${i}`}>
							{gridRender(item)}
						</div>
					))}
				</div>
			)
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={testSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" />
							<DataGridLayout name="grid" item={it}>
								{(item: typeof it) => (
									<div>
										<span data-testid="tile-title"><Field field={item.title} /></span>
										<span data-testid="tile-author">
											<HasOne field={item.author!}>
												{(author: any) => <Field field={author.name} />}
											</HasOne>
										</span>
									</div>
								)}
							</DataGridLayout>
							<LayoutRenderer />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'loading')).toBeNull()
		})

		// Tiles should render with Field/HasOne data
		const tile0 = getByTestId(container, 'tile-0')
		expect(tile0.querySelector('[data-testid="tile-title"]')?.textContent).toBe('Alpha')
		expect(tile0.querySelector('[data-testid="tile-author"]')?.textContent).toBe('Alice')

		const tile1 = getByTestId(container, 'tile-1')
		expect(tile1.querySelector('[data-testid="tile-title"]')?.textContent).toBe('Beta')
		expect(tile1.querySelector('[data-testid="tile-author"]')?.textContent).toBe('Bob')
	})

	test('layoutRenders has entry when DataGridLayout is present', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const { useDataViewContext: useCtx } = await import('@contember/bindx-dataview')

		let hasGridRender = false
		function Probe(): React.ReactElement | null {
			hasGridRender = useCtx().layoutRenders.has('grid')
			return null
		}

		render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" />
							<DataGridLayout name="grid" item={it}>
								{() => <Field field={it.title} />}
							</DataGridLayout>
							<Probe />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(hasGridRender).toBe(true)
		})
	})

	test('layoutRenders is empty when no DataGridLayout is present', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const { useDataViewContext: useCtx } = await import('@contember/bindx-dataview')

		let layoutRendersSize: number = -1
		function Probe(): React.ReactElement | null {
			layoutRendersSize = useCtx().layoutRenders.size
			return null
		}

		render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" />
							<Probe />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(layoutRendersSize).toBe(0)
		})
	})

	test('multiple DataGridLayout markers are collected', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const { useDataViewContext: useCtx } = await import('@contember/bindx-dataview')

		let layoutNames: string[] = []
		function Probe(): React.ReactElement | null {
			layoutNames = Array.from(useCtx().layoutRenders.keys())
			return null
		}

		render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" />
							<DataGridLayout name="grid" label="Grid" item={it}>
								{() => <Field field={it.title} />}
							</DataGridLayout>
							<DataGridLayout name="rows" label="Rows" item={it}>
								{() => <Field field={it.title} />}
							</DataGridLayout>
							<Probe />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(layoutNames.length).toBe(2)
		})

		expect(layoutNames).toContain('grid')
		expect(layoutNames).toContain('rows')
	})
})

// ============================================================================
// analyzeChildren with multiple marker types
// ============================================================================

describe('analyzeChildren with multiple marker types', () => {
	test('collects ColumnLeaf and DataGridToolbarContent markers', () => {
		const toolbarJsx = <div>Filter UI</div>
		const elements = (
			<>
				<DataGridTextColumn field={{ [FIELD_REF_META]: { fieldName: 'title' } } as any} header="Title" />
				<DataGridToolbarContent>{toolbarJsx}</DataGridToolbarContent>
			</>
		)

		const MARKERS = new Set([
			ColumnLeaf as React.ComponentType,
			DataGridToolbarContent as React.ComponentType,
		])
		const result = analyzeChildren(elements, MARKERS)

		expect(result.getAll(ColumnLeaf).length).toBe(1)
		expect(result.getFirst(DataGridToolbarContent)).toBeDefined()
		expect(result.getFirst(DataGridToolbarContent)?.children).toBeDefined()
	})

	test('collects DataGridLayout marker', () => {
		const layoutCallback = () => <div>Grid Item</div>
		const elements = (
			<>
				<DataGridTextColumn field={{ [FIELD_REF_META]: { fieldName: 'title' } } as any} header="Title" />
				<DataGridLayout name="grid">{layoutCallback}</DataGridLayout>
			</>
		)

		const MARKERS = new Set([
			ColumnLeaf as React.ComponentType,
			DataGridLayout as React.ComponentType,
		])
		const result = analyzeChildren(elements, MARKERS)

		expect(result.getAll(ColumnLeaf).length).toBe(1)
		const layouts = result.getAll(DataGridLayout)
		expect(layouts.length).toBe(1)
		expect((layouts[0] as any).name).toBe('grid')
		expect(typeof (layouts[0] as any).children).toBe('function')
	})

	test('collects multiple DataGridLayout markers', () => {
		const elements = (
			<>
				<DataGridTextColumn field={{ [FIELD_REF_META]: { fieldName: 'title' } } as any} header="Title" />
				<DataGridLayout name="grid">{() => <div>Grid</div>}</DataGridLayout>
				<DataGridLayout name="rows">{() => <div>Row</div>}</DataGridLayout>
			</>
		)

		const MARKERS = new Set([
			ColumnLeaf as React.ComponentType,
			DataGridLayout as React.ComponentType,
		])
		const result = analyzeChildren(elements, MARKERS)

		const layouts = result.getAll(DataGridLayout)
		expect(layouts.length).toBe(2)
		expect((layouts[0] as any).name).toBe('grid')
		expect((layouts[1] as any).name).toBe('rows')
	})

	test('returns undefined for missing marker types', () => {
		const elements = (
			<DataGridTextColumn field={{ [FIELD_REF_META]: { fieldName: 'title' } } as any} header="Title" />
		)

		const MARKERS = new Set([
			ColumnLeaf as React.ComponentType,
			DataGridToolbarContent as React.ComponentType,
		])
		const result = analyzeChildren(elements, MARKERS)

		expect(result.getAll(ColumnLeaf).length).toBe(1)
		expect(result.getFirst(DataGridToolbarContent)).toBeUndefined()
	})

	test('DataGridToolbarContent available in context via children render', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const { useDataViewContext: useCtx } = await import('@contember/bindx-dataview')

		let toolbarContent: React.ReactNode = undefined
		function Probe(): React.ReactElement | null {
			toolbarContent = useCtx().toolbarContent
			return null
		}

		render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<DataGridTextColumn field={it.title} header="Title" />
							<DataGridToolbarContent>
								<div data-testid="my-toolbar">Custom Toolbar</div>
							</DataGridToolbarContent>
							<Probe />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(toolbarContent).toBeDefined()
		})
	})
})
