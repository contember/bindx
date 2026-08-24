/**
 * A relation column's cell renderer may render relations of the ROW entity too; those
 * must stay on the row selection and never land in the related entity's selection.
 */
import '../../setup'
import { describe, test, expect } from 'bun:test'
import React from 'react'
import {
	DataGridHasOneColumn,
	DataGridHasManyColumn,
	extractColumnLeaves,
	type ColumnLeafProps,
} from '@contember/bindx-dataview'
import {
	Field,
	HasMany,
	HasOne,
	createCollectorProxy,
	defineSchema,
	scalar,
	hasOne,
	hasMany,
} from '@contember/bindx-react'
import { SelectionScope, SchemaRegistry, type EntityAccessor, type SelectionMeta } from '@contember/bindx'

interface Member { id: string; fullName: string }
interface Organization { id: string; name: string; members: Member[] }
interface Tag { id: string; label: string }
interface Project { id: string; name: string; organization: Organization | null; tags: Tag[] }

const testSchema = defineSchema<{ Project: Project; Organization: Organization; Tag: Tag; Member: Member }>({
	entities: {
		Project: { fields: { id: scalar(), name: scalar(), organization: hasOne('Organization'), tags: hasMany('Tag') } },
		Organization: { fields: { id: scalar(), name: scalar(), members: hasMany('Member') } },
		Tag: { fields: { id: scalar(), label: scalar() } },
		Member: { fields: { id: scalar(), fullName: scalar() } },
	},
})
const schemaRegistry = new SchemaRegistry(testSchema)

function buildColumn(build: (it: EntityAccessor<Project>) => React.ReactNode): {
	rowSelection: SelectionMeta
	leaf: ColumnLeafProps
} {
	const scope = new SelectionScope()
	const collector = createCollectorProxy<Project>(scope, 'Project', schemaRegistry)
	const leaves = extractColumnLeaves(build(collector))
	expect(leaves).toHaveLength(1)
	const leaf = leaves[0]!
	leaf.collectSelection?.(collector)
	return { rowSelection: scope.toSelectionMeta(), leaf }
}

function fieldNames(selection: SelectionMeta | undefined): string[] {
	return [...(selection?.fields.keys() ?? [])].sort()
}

describe('relation column selection must stay on the related entity', () => {
	test('hasOne column: a row-entity hasMany rendered in the cell must not land in the relation selection', () => {
		const { rowSelection, leaf } = buildColumn(it => (
			<DataGridHasOneColumn field={it.organization}>
				{org => (
					<>
						{org.name.value}
						<HasMany field={it.tags}>{tag => <Field field={tag.label} />}</HasMany>
					</>
				)}
			</DataGridHasOneColumn>
		))

		// `tags` belongs to Project, not to Organization.
		expect(fieldNames(rowSelection.fields.get('organization')?.nested)).toEqual(['id', 'name'])
		expect(fieldNames(leaf.relatedSelection)).not.toContain('tags')
		// The row-level selection itself is correct.
		expect(rowSelection.fields.has('tags')).toBe(true)
	})

	test('hasMany column: a row-entity hasOne rendered in the cell must not land in the relation selection', () => {
		const { rowSelection, leaf } = buildColumn(it => (
			<DataGridHasManyColumn field={it.tags}>
				{tag => (
					<>
						<Field field={tag.label} />
						<HasOne field={it.organization}>{org => <Field field={org.name} />}</HasOne>
					</>
				)}
			</DataGridHasManyColumn>
		))

		// `organization` belongs to Project, not to Tag.
		expect(fieldNames(rowSelection.fields.get('tags')?.nested)).toEqual(['id', 'label'])
		expect(fieldNames(leaf.relatedSelection)).not.toContain('organization')
	})
})
