/**
 * Tests for createRelationColumn factory:
 * - Produces ColumnLeafProps with correct metadata (relatedEntityName, filterName, etc.)
 * - renderFilter is set when uiConfig provides it
 * - renderCellWrapper is set when uiConfig provides it
 * - filter defaults to enabled
 * - filter can be disabled
 * - children render function flows through to renderFilterItem and renderCell
 */
import '../../setup'
import { describe, test, expect } from 'bun:test'
import React from 'react'
import {
	createRelationColumn,
	hasOneCellConfig,
	hasManyCellConfig,
	hasOneColumnDef,
	hasManyColumnDef,
	extractColumnLeaves,
	type RelationFilterContext,
	type RelationCellWrapperContext,
} from '@contember/bindx-dataview'
import {
	defineSchema,
	scalar,
	hasOne,
	hasMany,
	createCollectorProxy,
} from '@contember/bindx-react'
import { SelectionScope, SchemaRegistry } from '@contember/bindx'

// ============================================================================
// Schema
// ============================================================================

interface Organization {
	id: string
	name: string
}

interface Tag {
	id: string
	label: string
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
			},
		},
		Tag: {
			fields: {
				id: scalar(),
				label: scalar(),
			},
		},
	},
})

const schemaRegistry = new SchemaRegistry(testSchema)

function createProjectProxy() {
	const scope = new SelectionScope()
	return createCollectorProxy<Project>(scope, 'Project', schemaRegistry)
}

// ============================================================================
// HasOne Column Tests
// ============================================================================

describe('createRelationColumn — hasOne', () => {
	const HeadlessHasOneColumn = createRelationColumn(hasOneColumnDef, hasOneCellConfig)

	test('produces leaf with correct metadata', () => {
		const proxy = createProjectProxy()
		const jsx = (
			<HeadlessHasOneColumn field={proxy.organization} header="Org">
				{(org: any) => org.name.value}
			</HeadlessHasOneColumn>
		)
		const leaves = extractColumnLeaves(jsx)
		expect(leaves).toHaveLength(1)
		const leaf = leaves[0]!

		expect(leaf.fieldName).toBe('organization')
		expect(leaf.columnType).toBe('hasOne')
		expect(leaf.relatedEntityName).toBe('Organization')
		expect(leaf.filterName).toBe('organization')
		expect(leaf.header).toBe('Org')
		expect(leaf.filterHandler).toBeDefined()
		expect(leaf.renderFilterItem).toBeTypeOf('function')
		expect(leaf.renderCell).toBeTypeOf('function')
		expect(leaf.collectSelection).toBeTypeOf('function')
	})

	test('filter is enabled by default', () => {
		const proxy = createProjectProxy()
		const jsx = (
			<HeadlessHasOneColumn field={proxy.organization}>
				{(org: any) => org.name.value}
			</HeadlessHasOneColumn>
		)
		const leaf = extractColumnLeaves(jsx)[0]!
		expect(leaf.filterName).toBe('organization')
		expect(leaf.filterHandler).toBeDefined()
	})

	test('filter can be disabled', () => {
		const proxy = createProjectProxy()
		const jsx = (
			<HeadlessHasOneColumn field={proxy.organization} filter={false}>
				{(org: any) => org.name.value}
			</HeadlessHasOneColumn>
		)
		const leaf = extractColumnLeaves(jsx)[0]!
		expect(leaf.filterName).toBeNull()
		expect(leaf.filterHandler).toBeUndefined()
	})

	test('headless column has no renderFilter', () => {
		const proxy = createProjectProxy()
		const jsx = (
			<HeadlessHasOneColumn field={proxy.organization}>
				{(org: any) => org.name.value}
			</HeadlessHasOneColumn>
		)
		const leaf = extractColumnLeaves(jsx)[0]!
		expect(leaf.renderFilter).toBeUndefined()
	})

	test('UI config renderFilter is set on leaf', () => {
		const mockRenderFilter = (ctx: RelationFilterContext) => <div>filter for {ctx.entityName}</div>
		const StyledHasOneColumn = createRelationColumn(hasOneColumnDef, hasOneCellConfig, {
			renderFilter: mockRenderFilter,
		})
		const proxy = createProjectProxy()
		const jsx = (
			<StyledHasOneColumn field={proxy.organization}>
				{(org: any) => org.name.value}
			</StyledHasOneColumn>
		)
		const leaf = extractColumnLeaves(jsx)[0]!
		expect(leaf.renderFilter).toBeTypeOf('function')
	})

	test('UI config renderCellWrapper is set on leaf', () => {
		const mockWrapper = (ctx: RelationCellWrapperContext) => <span>{ctx.content}</span>
		const StyledHasOneColumn = createRelationColumn(hasOneColumnDef, hasOneCellConfig, {
			renderCellWrapper: mockWrapper,
		})
		const proxy = createProjectProxy()
		const jsx = (
			<StyledHasOneColumn field={proxy.organization}>
				{(org: any) => org.name.value}
			</StyledHasOneColumn>
		)
		const leaf = extractColumnLeaves(jsx)[0]!
		expect(leaf.renderCellWrapper).toBeTypeOf('function')
	})

	test('user renderCellWrapper prop overrides UI config', () => {
		const uiWrapper = (ctx: RelationCellWrapperContext) => <span>ui</span>
		const userWrapper = (_content: React.ReactNode, _item: any) => <span>user</span>
		const StyledHasOneColumn = createRelationColumn(hasOneColumnDef, hasOneCellConfig, {
			renderCellWrapper: uiWrapper,
		})
		const proxy = createProjectProxy()
		const jsx = (
			<StyledHasOneColumn field={proxy.organization} renderCellWrapper={userWrapper}>
				{(org: any) => org.name.value}
			</StyledHasOneColumn>
		)
		const leaf = extractColumnLeaves(jsx)[0]!
		expect(leaf.renderCellWrapper).toBe(userWrapper)
	})

	test('relatedSelection captures fields from children', () => {
		const proxy = createProjectProxy()
		const jsx = (
			<HeadlessHasOneColumn field={proxy.organization}>
				{(org: any) => org.name.value}
			</HeadlessHasOneColumn>
		)
		const leaf = extractColumnLeaves(jsx)[0]!
		expect(leaf.relatedSelection).toBeDefined()
		expect(leaf.relatedSelection?.fields.has('name')).toBe(true)
	})
})

// ============================================================================
// HasMany Column Tests
// ============================================================================

describe('createRelationColumn — hasMany', () => {
	const HeadlessHasManyColumn = createRelationColumn(hasManyColumnDef, hasManyCellConfig)

	test('produces leaf with correct metadata', () => {
		const proxy = createProjectProxy()
		const jsx = (
			<HeadlessHasManyColumn field={proxy.tags}>
				{(tag: any) => tag.label.value}
			</HeadlessHasManyColumn>
		)
		const leaves = extractColumnLeaves(jsx)
		expect(leaves).toHaveLength(1)
		const leaf = leaves[0]!

		expect(leaf.fieldName).toBe('tags')
		expect(leaf.columnType).toBe('hasMany')
		expect(leaf.relatedEntityName).toBe('Tag')
		expect(leaf.filterName).toBe('tags')
		expect(leaf.filterHandler).toBeDefined()
	})

	test('UI config renderFilter is set on leaf', () => {
		const mockRenderFilter = (ctx: RelationFilterContext) => <div>filter</div>
		const StyledHasManyColumn = createRelationColumn(hasManyColumnDef, hasManyCellConfig, {
			renderFilter: mockRenderFilter,
		})
		const proxy = createProjectProxy()
		const jsx = (
			<StyledHasManyColumn field={proxy.tags}>
				{(tag: any) => tag.label.value}
			</StyledHasManyColumn>
		)
		const leaf = extractColumnLeaves(jsx)[0]!
		expect(leaf.renderFilter).toBeTypeOf('function')
	})
})
