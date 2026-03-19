import './setup'
import { describe, test, expect } from 'bun:test'
import React from 'react'
import {
	createComponent,
	entityDef,
	defineSchema,
	scalar,
	hasOne,
	hasMany,
	Field,
	HasMany,
	HasOne,
	buildQueryFromSelection,
	COMPONENT_SELECTIONS,
	withCollector,
	type SelectionMeta,
} from '@contember/bindx-react'
import { SchemaRegistry } from '@contember/bindx'

// ============================================================================
// Schema
// ============================================================================

interface Organization {
	id: string
	name: string
}

interface VoucherUsage {
	id: string
	creditedAmount: number
	organization: Organization
	createdAt: string
}

interface Voucher {
	id: string
	code: string
	label: string
	usages: VoucherUsage[]
}

interface FeatureFlagSet {
	id: string
	name: string
}

interface Project {
	id: string
	name: string
	slug: string
	organization: Organization
	featureFlagSet: FeatureFlagSet
}

const schemaDef = defineSchema<{
	Organization: Organization
	VoucherUsage: VoucherUsage
	Voucher: Voucher
	FeatureFlagSet: FeatureFlagSet
	Project: Project
}>({
	entities: {
		Organization: { fields: { id: scalar(), name: scalar() } },
		VoucherUsage: {
			fields: {
				id: scalar(),
				creditedAmount: scalar(),
				organization: hasOne('Organization'),
				createdAt: scalar(),
			},
		},
		Voucher: {
			fields: {
				id: scalar(),
				code: scalar(),
				label: scalar(),
				usages: hasMany('VoucherUsage'),
			},
		},
		FeatureFlagSet: { fields: { id: scalar(), name: scalar() } },
		Project: {
			fields: {
				id: scalar(),
				name: scalar(),
				slug: scalar(),
				organization: hasOne('Organization'),
				featureFlagSet: hasOne('FeatureFlagSet'),
			},
		},
	},
})

const schema = {
	Organization: entityDef<Organization>('Organization', schemaDef),
	VoucherUsage: entityDef<VoucherUsage>('VoucherUsage', schemaDef),
	Voucher: entityDef<Voucher>('Voucher', schemaDef),
	FeatureFlagSet: entityDef<FeatureFlagSet>('FeatureFlagSet', schemaDef),
	Project: entityDef<Project>('Project', schemaDef),
}

// ============================================================================
// Helpers
// ============================================================================

function getComponentSelection(component: unknown, propName: string): SelectionMeta | undefined {
	// Trigger lazy implicit collection via $propName access
	const fragment = (component as Record<string, unknown>)[`$${propName}`]
	if (!fragment) return undefined
	const selections = (component as Record<symbol, Map<string, { selection: SelectionMeta }>>)[COMPONENT_SELECTIONS]
	return selections?.get(propName)?.selection
}

function getFieldNames(selection: SelectionMeta): string[] {
	return [...selection.fields.keys()]
}

function getField(selection: SelectionMeta, name: string) {
	return selection.fields.get(name)
}

// ============================================================================
// Tests
// ============================================================================

describe('Selection Collection with Schema', () => {

	test('createComponent collects scalar fields', () => {
		const Comp = createComponent()
			.entity('entity', schema.Project)
			.render(({ entity }) => (
				<div>
					<span>{entity.name.value}</span>
					<span>{entity.slug.value}</span>
				</div>
			))

		const sel = getComponentSelection(Comp, 'entity')
		expect(sel).toBeDefined()
		expect(getFieldNames(sel!)).toContain('name')
		expect(getFieldNames(sel!)).toContain('slug')
	})

	test('createComponent detects has-one relation via schema', () => {
		const Comp = createComponent()
			.entity('entity', schema.Project)
			.render(({ entity }) => (
				<div>
					<span>{entity.name.value}</span>
					<span>{entity.organization.name.value}</span>
				</div>
			))

		const sel = getComponentSelection(Comp, 'entity')
		expect(sel).toBeDefined()

		const orgField = getField(sel!, 'organization')
		expect(orgField).toBeDefined()
		expect(orgField!.isRelation).toBe(true)
		expect(orgField!.nested).toBeDefined()
		expect(orgField!.nested!.fields.has('name')).toBe(true)
	})

	test('createComponent detects has-many relation via schema', () => {
		const Comp = createComponent()
			.entity('entity', schema.Voucher)
			.render(({ entity }) => (
				<div>
					<span>{entity.code.value}</span>
					<HasMany field={entity.usages}>
						{usage => <span>{usage.creditedAmount.value}</span>}
					</HasMany>
				</div>
			))

		const sel = getComponentSelection(Comp, 'entity')
		expect(sel).toBeDefined()
		expect(getField(sel!, 'code')).toBeDefined()

		const usagesField = getField(sel!, 'usages')
		expect(usagesField).toBeDefined()
		expect(usagesField!.isRelation).toBe(true)
		expect(usagesField!.isArray).toBe(true)
		expect(usagesField!.nested).toBeDefined()
		expect(usagesField!.nested!.fields.has('creditedAmount')).toBe(true)
	})

	test('HasMany with nested has-one: organization.name on VoucherUsage', () => {
		const Comp = createComponent()
			.entity('entity', schema.Voucher)
			.render(({ entity }) => (
				<div>
					<HasMany field={entity.usages}>
						{usage => (
							<div>
								<Field field={usage.organization.name} />
								<Field field={usage.creditedAmount} />
							</div>
						)}
					</HasMany>
				</div>
			))

		const sel = getComponentSelection(Comp, 'entity')
		expect(sel).toBeDefined()

		const usagesField = getField(sel!, 'usages')
		expect(usagesField).toBeDefined()
		expect(usagesField!.nested).toBeDefined()

		// creditedAmount should be a scalar on VoucherUsage
		expect(usagesField!.nested!.fields.has('creditedAmount')).toBe(true)

		// organization should be a relation on VoucherUsage with nested name
		const orgField = usagesField!.nested!.fields.get('organization')
		expect(orgField).toBeDefined()
		expect(orgField!.isRelation).toBe(true)
		expect(orgField!.nested).toBeDefined()
		expect(orgField!.nested!.fields.has('name')).toBe(true)
	})

	test('selection builds valid query for nested has-one in has-many', () => {
		const Comp = createComponent()
			.entity('entity', schema.Voucher)
			.render(({ entity }) => (
				<div>
					<HasMany field={entity.usages}>
						{usage => (
							<div>
								<Field field={usage.organization.name} />
								<Field field={usage.creditedAmount} />
							</div>
						)}
					</HasMany>
				</div>
			))

		const sel = getComponentSelection(Comp, 'entity')
		expect(sel).toBeDefined()

		const query = buildQueryFromSelection(sel!)
		// Should have 'usages' field with nested fields
		const usagesSpec = query.fields.find(f => f.name === 'usages')
		expect(usagesSpec).toBeDefined()
		expect(usagesSpec!.nested).toBeDefined()

		// Nested should have 'organization' with its own nested 'name'
		const orgSpec = usagesSpec!.nested!.fields.find(f => f.name === 'organization')
		expect(orgSpec).toBeDefined()
		expect(orgSpec!.nested).toBeDefined()
		expect(orgSpec!.nested!.fields.find(f => f.name === 'name')).toBeDefined()

		// Should NOT have a flat 'name' field on VoucherUsage level
		const flatName = usagesSpec!.nested!.fields.find(f => f.name === 'name')
		expect(flatName).toBeUndefined()
	})

	test('useSelectionCollection path: inline HasMany with nested has-one', () => {
		// Simulate what useSelectionCollection does for Entity with inline HasMany
		const { SelectionScope } = require('@contember/bindx')
		const { createCollectorProxy, collectSelection, mergeSelections } = require('@contember/bindx-react')

		// Create VoucherForm like in the real app
		const VoucherForm = createComponent()
			.entity('entity', schema.Voucher)
			.render(({ entity }: any) => (
				<div>
					<span>{entity.code.value}</span>
					<span>{entity.label.value}</span>
				</div>
			))
		// Trigger collection
		;(VoucherForm as any).$entity

		const registry = new SchemaRegistry(schemaDef)
		const scope = new SelectionScope()
		const collector = createCollectorProxy(scope, 'Voucher', registry)

		// Simulate Entity children callback — includes BOTH VoucherForm AND inline HasMany
		const jsx = (
			<div>
				<VoucherForm entity={collector} />
				<HasMany field={collector.usages} orderBy={{ createdAt: 'desc' }}>
					{(usage: any) => (
						<div>
							<Field field={usage.organization.name} />
							<Field field={usage.creditedAmount} />
						</div>
					)}
				</HasMany>
			</div>
		)

		// Analyze JSX (like useSelectionCollection does)
		const jsxSel = collectSelection(jsx)
		const selection = scope.toSelectionMeta()
		mergeSelections(selection, jsxSel)

		// Build query
		const query = buildQueryFromSelection(selection)

		// usages should be in the query
		const usagesSpec = query.fields.find((f: any) => f.name === 'usages')
		expect(usagesSpec).toBeDefined()
		expect(usagesSpec!.nested).toBeDefined()

		// organization should be nested inside usages with name
		const orgSpec = usagesSpec!.nested!.fields.find((f: any) => f.name === 'organization')
		expect(orgSpec).toBeDefined()
		expect(orgSpec!.nested).toBeDefined()
		expect(orgSpec!.nested!.fields.find((f: any) => f.name === 'name')).toBeDefined()

		// No flat 'name' at VoucherUsage level
		const flatName = usagesSpec!.nested!.fields.find((f: any) => f.name === 'name')
		expect(flatName).toBeUndefined()
	})

	test('SelectField with staticRender collects has-one relation fields', () => {
		// Simulate SelectField pattern
		const MockSelectField = withCollector(
			function MockSelectField({ field, children }: { field: any; children: (it: any) => React.ReactNode }) {
				return <div>{children(field.$entity)}</div>
			},
			(props: any) => (
				<HasOne field={props.field}>
					{entity => props.children(entity)}
				</HasOne>
			),
		)

		const Comp = createComponent()
			.entity('entity', schema.Project)
			.render(({ entity }) => (
				<div>
					<span>{entity.name.value}</span>
					<MockSelectField field={entity.featureFlagSet}>
						{it => <span>{it.name.value}</span>}
					</MockSelectField>
				</div>
			))

		const sel = getComponentSelection(Comp, 'entity')
		expect(sel).toBeDefined()
		expect(getField(sel!, 'name')).toBeDefined()

		const ffsField = getField(sel!, 'featureFlagSet')
		expect(ffsField).toBeDefined()
		expect(ffsField!.isRelation).toBe(true)
		expect(ffsField!.nested).toBeDefined()
		expect(ffsField!.nested!.fields.has('name')).toBe(true)
	})
})
