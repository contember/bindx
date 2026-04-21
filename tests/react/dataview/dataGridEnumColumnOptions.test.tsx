/**
 * Tests for DataGridEnumColumn / DataGridEnumListColumn — `options` prop
 * as a label record should be used when rendering cells, not only filters.
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
} from '@contember/bindx-react'
import {
	DataGrid,
	DataGridEnumColumn,
	DataGridEnumListColumn,
} from '@contember/bindx-dataview'
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
			'a3': { id: 'a3', status: 'archived', tags: [] },
		},
	}
}

describe('DataGridEnumColumn options → cell labels', () => {
	test('renders label from options record instead of raw enum value', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const statusLabels = {
			draft: 'Koncept',
			published: 'Publikováno',
			archived: 'Archivováno',
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<DataGridEnumColumn
								field={it.status}
								header="Status"
								options={statusLabels}
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
		expect(getCellText(container, 2, 'status')).toBe('Archivováno')
	})

	test('falls back to raw value when options is an array (no label mapping)', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<DataGridEnumColumn
								field={it.status}
								header="Status"
								options={['draft', 'published', 'archived']}
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

		expect(getCellText(container, 0, 'status')).toBe('draft')
		expect(getCellText(container, 1, 'status')).toBe('published')
	})
})

describe('DataGridEnumListColumn options → cell labels', () => {
	test('renders labels for list values from options record', async () => {
		const adapter = new MockAdapter(createMockData(), { delay: 0 })
		const tagLabels = {
			news: 'Novinky',
			featured: 'Doporučené',
		}

		const { container } = render(
			<BindxProvider adapter={adapter} schema={localSchema}>
				<DataGrid entity={schema.Article}>
					{it => (
						<>
							<DataGridEnumListColumn
								field={it.tags as unknown as FieldRef<'news' | 'featured'>}
								header="Tags"
								options={tagLabels}
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
		expect(row0).not.toContain('featured')

		expect(getCellText(container, 1, 'tags')).toBe('Doporučené')
	})
})
