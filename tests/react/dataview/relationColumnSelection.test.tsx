/**
 * Selection collection for relation columns (`createRelationColumn`).
 *
 * A relation column's cell renderer may be written declaratively — returning
 * `<Field>` / `<HasOne>` / `<HasMany>` JSX instead of touching the collector
 * proxy imperatively. The fields such JSX declares must end up in both places
 * the column collects into: the row query selection (nested under the column's
 * own relation) and the standalone `relatedSelection` the filter popover fetches.
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

// ============================================================================
// Schema
// ============================================================================

interface Country {
	id: string
	code: string
}

interface Member {
	id: string
	fullName: string
	value: string
}

interface Organization {
	id: string
	name: string
	country: Country | null
	member: Member | null
	members: Member[]
}

interface Tag {
	id: string
	label: string
	members: Member[]
}

interface Project {
	id: string
	name: string
	organization: Organization | null
	tags: Tag[]
}

interface TestSchema {
	Project: Project
	Organization: Organization
	Tag: Tag
	Member: Member
	Country: Country
}

const testSchema = defineSchema<TestSchema>({
	entities: {
		Project: {
			fields: {
				id: scalar(),
				name: scalar(),
				organization: hasOne('Organization'),
				tags: hasMany('Tag'),
			},
		},
		Organization: {
			fields: {
				id: scalar(),
				name: scalar(),
				country: hasOne('Country'),
				member: hasOne('Member'),
				members: hasMany('Member'),
			},
		},
		Tag: {
			fields: {
				id: scalar(),
				label: scalar(),
				members: hasMany('Member'),
			},
		},
		Member: {
			fields: {
				id: scalar(),
				fullName: scalar(),
				value: scalar(),
			},
		},
		Country: {
			fields: {
				id: scalar(),
				code: scalar(),
			},
		},
	},
})

const schemaRegistry = new SchemaRegistry(testSchema)

// ============================================================================
// Helpers
// ============================================================================

/**
 * Runs the DataGrid collection phase for a single column against a fresh row
 * scope and returns the resulting selection.
 */
function collectColumnSelection(build: (it: EntityAccessor<Project>) => React.ReactNode): SelectionMeta {
	const scope = new SelectionScope()
	const collector = createCollectorProxy<Project>(scope, 'Project', schemaRegistry)
	const leaves = extractColumnLeaves(build(collector))
	expect(leaves).toHaveLength(1)
	for (const leaf of leaves) {
		leaf.collectSelection?.(collector)
	}
	return scope.toSelectionMeta()
}

/** Builds a single column leaf, exactly as the DataGrid's `analyzeChildren` pass does. */
function buildColumnLeaf(build: (it: EntityAccessor<Project>) => React.ReactNode): ColumnLeafProps {
	const scope = new SelectionScope()
	const collector = createCollectorProxy<Project>(scope, 'Project', schemaRegistry)
	const leaves = extractColumnLeaves(build(collector))
	expect(leaves).toHaveLength(1)
	return leaves[0]!
}

/** Descend into a relation's nested selection, failing loudly when it is absent. */
function nested(selection: SelectionMeta, ...path: readonly string[]): SelectionMeta {
	let current = selection
	for (const segment of path) {
		const field = current.fields.get(segment)
		if (!field?.nested) {
			throw new Error(`Expected relation "${segment}" with a nested selection, got: ${[...current.fields.keys()].join(', ') || '<empty>'}`)
		}
		current = field.nested
	}
	return current
}

function fieldNames(selection: SelectionMeta): string[] {
	return [...selection.fields.keys()].sort()
}

// ============================================================================
// hasOne column
// ============================================================================

describe('relation column selection — hasOne', () => {
	test('renderer returning <Field> JSX registers the field', () => {
		const selection = collectColumnSelection(it => (
			<DataGridHasOneColumn field={it.organization}>
				{org => <Field field={org.name} />}
			</DataGridHasOneColumn>
		))

		expect(fieldNames(nested(selection, 'organization'))).toEqual(['id', 'name'])
	})

	test('nested <HasMany> in the renderer registers its children fields', () => {
		const selection = collectColumnSelection(it => (
			<DataGridHasOneColumn field={it.organization}>
				{org => (
					<HasMany field={org.members}>
						{member => <Field field={member.fullName} />}
					</HasMany>
				)}
			</DataGridHasOneColumn>
		))

		const members = nested(selection, 'organization', 'members')
		expect(fieldNames(members)).toEqual(['fullName', 'id'])
		expect(selection.fields.get('organization')?.nested?.fields.get('members')?.isArray).toBe(true)
	})

	test('nested <HasOne> in the renderer registers its children fields', () => {
		const selection = collectColumnSelection(it => (
			<DataGridHasOneColumn field={it.organization}>
				{org => (
					<HasOne field={org.country}>
						{country => <Field field={country.code} />}
					</HasOne>
				)}
			</DataGridHasOneColumn>
		))

		expect(fieldNames(nested(selection, 'organization', 'country'))).toEqual(['code', 'id'])
	})

	test('the .map()-on-proxy pattern still registers the same selection', () => {
		const selection = collectColumnSelection(it => (
			<DataGridHasOneColumn field={it.organization}>
				{org => org.members.map(member => member.fullName.value).join(', ')}
			</DataGridHasOneColumn>
		))

		const members = nested(selection, 'organization', 'members')
		expect(fieldNames(members)).toEqual(['fullName', 'id'])
		expect(selection.fields.get('organization')?.nested?.fields.get('members')?.isArray).toBe(true)
	})
})

// ============================================================================
// hasMany column
// ============================================================================

describe('relation column selection — hasMany', () => {
	test('renderer returning <Field> JSX registers the field', () => {
		const selection = collectColumnSelection(it => (
			<DataGridHasManyColumn field={it.tags}>
				{tag => <Field field={tag.label} />}
			</DataGridHasManyColumn>
		))

		expect(fieldNames(nested(selection, 'tags'))).toEqual(['id', 'label'])
		expect(selection.fields.get('tags')?.isArray).toBe(true)
	})

	test('nested <HasMany> in the renderer registers its children fields', () => {
		const selection = collectColumnSelection(it => (
			<DataGridHasManyColumn field={it.tags}>
				{tag => (
					<HasMany field={tag.members}>
						{member => <Field field={member.fullName} />}
					</HasMany>
				)}
			</DataGridHasManyColumn>
		))

		const members = nested(selection, 'tags', 'members')
		expect(fieldNames(members)).toEqual(['fullName', 'id'])
	})

	test('the .map()-on-proxy pattern still registers the same selection', () => {
		const selection = collectColumnSelection(it => (
			<DataGridHasManyColumn field={it.tags}>
				{tag => tag.members.map(member => member.fullName.value).join(', ')}
			</DataGridHasManyColumn>
		))

		const members = nested(selection, 'tags', 'members')
		expect(fieldNames(members)).toEqual(['fullName', 'id'])
	})
})

// ============================================================================
// relatedSelection — the standalone selection the filter popover fetches with
// ============================================================================

describe('relation column relatedSelection', () => {
	test('schema-bound collection replaces a colliding schema-less scalar with the nested relation', () => {
		const scope = new SelectionScope()
		const collector = createCollectorProxy<Project>(scope, 'Project', schemaRegistry)
		const leaves = extractColumnLeaves(
			<DataGridHasOneColumn field={collector.organization}>
				{organization => String(organization.member.value)}
			</DataGridHasOneColumn>,
		)
		const leaf = leaves[0]
		if (!leaf?.relatedSelection) throw new Error('expected relatedSelection to be built')
		const relatedSelection = leaf.relatedSelection

		expect(relatedSelection.fields.get('member')?.nested).toBeUndefined()
		leaf.collectSelection?.(collector)

		expect(leaf.relatedSelection).toBe(relatedSelection)
		expect(fieldNames(nested(relatedSelection, 'member'))).toEqual(['id', 'value'])
	})

	test('nested <HasMany> in the renderer reaches relatedSelection', () => {
		const leaf = buildColumnLeaf(it => (
			<DataGridHasOneColumn field={it.organization}>
				{org => (
					<HasMany field={org.members}>
						{member => <Field field={member.fullName} />}
					</HasMany>
				)}
			</DataGridHasOneColumn>
		))

		const related = leaf.relatedSelection
		if (!related) throw new Error('expected relatedSelection to be built')
		expect(fieldNames(nested(related, 'members'))).toEqual(['fullName', 'id'])
		expect(related.fields.get('members')?.isArray).toBe(true)
	})

	test('renderer returning <Field> JSX reaches relatedSelection', () => {
		const leaf = buildColumnLeaf(it => (
			<DataGridHasOneColumn field={it.organization}>
				{org => <Field field={org.name} />}
			</DataGridHasOneColumn>
		))

		expect(leaf.relatedSelection?.fields.has('name')).toBe(true)
	})

	test('hasMany column: nested <HasMany> in the renderer reaches relatedSelection', () => {
		const leaf = buildColumnLeaf(it => (
			<DataGridHasManyColumn field={it.tags}>
				{tag => (
					<HasMany field={tag.members}>
						{member => <Field field={member.fullName} />}
					</HasMany>
				)}
			</DataGridHasManyColumn>
		))

		const related = leaf.relatedSelection
		if (!related) throw new Error('expected relatedSelection to be built')
		expect(fieldNames(nested(related, 'members'))).toEqual(['fullName', 'id'])
	})
})
