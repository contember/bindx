/**
 * Tests for the styled bindx-ui DataGridEnumColumn — `options` record should
 * render as cell label, with fallback to the EnumOptionsFormatter context when
 * `options` is absent but the field carries an `enumName`.
 */
import '../../setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	enumScalar,
} from '@contember/bindx-react'
import { DataGrid } from '@contember/bindx-dataview'
import {
	DataGridEnumColumn,
	DataGridEnumListColumn,
	EnumOptionsFormatterProvider,
} from '@contember/bindx-ui'
import type { FieldRef } from '@contember/bindx'
import { TestTable, queryByTestId, getCellText } from './helpers.js'

afterEach(() => {
	cleanup()
})

interface Article {
	id: string
	status: string
	tags: readonly string[]
}

interface TestSchema {
	Article: Article
}

const localSchema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				status: scalar(),
				tags: scalar(),
			},
		},
	},
})

const schema = {
	Article: entityDef<Article>('Article'),
} as const

function createMockData(): Record<string, Record<string, Record<string, unknown>>> {
	return {
		Article: {
			'a1': { id: 'a1', status: 'draft', tags: ['news', 'featured'] },
			'a2': { id: 'a2', status: 'published', tags: ['featured'] },
		},
	}
}

describe('bindx-ui DataGridEnumColumn', () => {
	test('renders labels from options record in cell', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<DataGridEnumColumn
								field={it.status}
								header="Status"
								options={{ draft: 'Koncept', published: 'Publikováno' }}
							/>
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		expect(getCellText(container, 0, 'status')).toBe('Koncept')
		expect(getCellText(container, 1, 'status')).toBe('Publikováno')
	})

	test('children override wins over options', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<DataGridEnumColumn
								field={it.status}
								header="Status"
								options={{ draft: 'Koncept', published: 'Publikováno' }}
							>
								{(value) => <span data-testid="custom-cell">!{value}!</span>}
							</DataGridEnumColumn>
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		expect(getCellText(container, 0, 'status')).toBe('!draft!')
		expect(getCellText(container, 1, 'status')).toBe('!published!')
	})
})

describe('bindx-ui DataGridEnumColumn — EnumOptionsFormatter fallback', () => {
	interface EnumArticle {
		id: string
		status: 'draft' | 'published'
	}

	const enumLocalSchema = defineSchema<{ Article: EnumArticle }>({
		entities: {
			Article: {
				fields: {
					id: scalar(),
					status: enumScalar('ArticleStatus', ['draft', 'published']),
				},
			},
		},
	})

	const enumEntity = entityDef<EnumArticle>('Article')

	test('uses EnumOptionsFormatterProvider when options prop is absent', async () => {
		const adapter = new MockAdapter({
			Article: {
				'a1': { id: 'a1', status: 'draft' },
				'a2': { id: 'a2', status: 'published' },
			},
		}, { delay: 0 })

		const formatter = (enumName: string): Record<string, React.ReactNode> => {
			if (enumName === 'ArticleStatus') {
				return { draft: 'Koncept (ctx)', published: 'Publikováno (ctx)' }
			}
			return {}
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={enumLocalSchema}>
				<EnumOptionsFormatterProvider formatter={formatter}>
					<DataGrid entity={enumEntity}>
						{it => (
							<>
								<DataGridEnumColumn field={it.status} header="Status" />
								<TestTable />
							</>
						)}
					</DataGrid>
				</EnumOptionsFormatterProvider>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		expect(getCellText(container, 0, 'status')).toBe('Koncept (ctx)')
		expect(getCellText(container, 1, 'status')).toBe('Publikováno (ctx)')
	})

	test('explicit options prop wins over EnumOptionsFormatterProvider', async () => {
		const adapter = new MockAdapter({
			Article: {
				'a1': { id: 'a1', status: 'draft' },
			},
		}, { delay: 0 })

		const formatter = (): Record<string, React.ReactNode> => ({ draft: 'FROM-CTX' })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={enumLocalSchema}>
				<EnumOptionsFormatterProvider formatter={formatter}>
					<DataGrid entity={enumEntity}>
						{it => (
							<>
								<DataGridEnumColumn
									field={it.status}
									header="Status"
									options={{ draft: 'FROM-PROP', published: 'FROM-PROP' }}
								/>
								<TestTable />
							</>
						)}
					</DataGrid>
				</EnumOptionsFormatterProvider>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		expect(getCellText(container, 0, 'status')).toBe('FROM-PROP')
	})
})

describe('bindx-ui DataGridEnumListColumn', () => {
	test('renders labels from options record for each value', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<DataGridEnumListColumn
								field={it.tags as unknown as FieldRef<'news' | 'featured'>}
								header="Tags"
								options={{ news: 'Novinky', featured: 'Doporučené' }}
							/>
							<TestTable />
						</>
					)}
				</DataGrid>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(queryByTestId(container, 'datagrid-loading')).toBeNull()
		})

		const row0 = getCellText(container, 0, 'tags')
		expect(row0).toContain('Novinky')
		expect(row0).toContain('Doporučené')
		expect(row0).not.toContain('news')

		expect(getCellText(container, 1, 'tags')).toBe('Doporučené')
	})
})
