import './setup'
import { describe, test, expect } from 'bun:test'
import React, { type ReactNode } from 'react'
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
	If,
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
					<span>{entity.name.inputProps.value}</span>
					<span>{entity.slug.inputProps.value}</span>
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
					<span>{entity.name.inputProps.value}</span>
					<span>{entity.organization.name.inputProps.value}</span>
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
					<span>{entity.code.inputProps.value}</span>
					<HasMany field={entity.usages}>
						{usage => <span>{usage.creditedAmount.inputProps.value}</span>}
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

	test('createComponent fragment inside <If> via collectSelection path', () => {
		const { SelectionScope } = require('@contember/bindx')
		const { createCollectorProxy, collectSelection, mergeSelections } = require('@contember/bindx-react')

		const VoucherCode = createComponent()
			.entity('entity', schema.Voucher)
			.render(({ entity }: any) => (
				<div>
					<span>{entity.code.value}</span>
					<span>{entity.label.value}</span>
				</div>
			))
		// Trigger collection
		;(VoucherCode as any).$entity

		const registry = new SchemaRegistry(schemaDef)
		const scope = new SelectionScope()
		const collector = createCollectorProxy(scope, 'Voucher', registry)

		// Simulate Entity children callback with createComponent fragment inside <If>
		const jsx = (
			<If
				condition={true}
				then={<VoucherCode entity={collector} />}
			/>
		)

		const jsxSel = collectSelection(jsx)
		const selection = scope.toSelectionMeta()
		mergeSelections(selection, jsxSel)

		const query = buildQueryFromSelection(selection)

		// code and label from VoucherCode should be in the query
		const codeSpec = query.fields.find((f: any) => f.name === 'code')
		expect(codeSpec).toBeDefined()
		const labelSpec = query.fields.find((f: any) => f.name === 'label')
		expect(labelSpec).toBeDefined()
	})

	test('createComponent fragment inside <If> else branch via collectSelection path', () => {
		const { SelectionScope } = require('@contember/bindx')
		const { createCollectorProxy, collectSelection, mergeSelections } = require('@contember/bindx-react')

		const VoucherCode = createComponent()
			.entity('entity', schema.Voucher)
			.render(({ entity }: any) => <span>{entity.code.value}</span>)
		;(VoucherCode as any).$entity

		const VoucherLabel = createComponent()
			.entity('entity', schema.Voucher)
			.render(({ entity }: any) => <span>{entity.label.value}</span>)
		;(VoucherLabel as any).$entity

		const registry = new SchemaRegistry(schemaDef)
		const scope = new SelectionScope()
		const collector = createCollectorProxy(scope, 'Voucher', registry)

		const jsx = (
			<If
				condition={true}
				then={<VoucherCode entity={collector} />}
				else={<VoucherLabel entity={collector} />}
			/>
		)

		const jsxSel = collectSelection(jsx)
		const selection = scope.toSelectionMeta()
		mergeSelections(selection, jsxSel)

		const query = buildQueryFromSelection(selection)

		// Both branches should contribute their fields
		expect(query.fields.find((f: any) => f.name === 'code')).toBeDefined()
		expect(query.fields.find((f: any) => f.name === 'label')).toBeDefined()
	})

	test('createComponent with HasMany inside <If> via collectSelection path', () => {
		const { SelectionScope } = require('@contember/bindx')
		const { createCollectorProxy, collectSelection, mergeSelections } = require('@contember/bindx-react')

		const VoucherUsages = createComponent()
			.entity('entity', schema.Voucher)
			.render(({ entity }: any) => (
				<HasMany field={entity.usages}>
					{(usage: any) => (
						<div>
							<Field field={usage.organization.name} />
							<Field field={usage.creditedAmount} />
						</div>
					)}
				</HasMany>
			))
		;(VoucherUsages as any).$entity

		const registry = new SchemaRegistry(schemaDef)
		const scope = new SelectionScope()
		const collector = createCollectorProxy(scope, 'Voucher', registry)

		const jsx = (
			<If
				condition={true}
				then={<VoucherUsages entity={collector} />}
			/>
		)

		const jsxSel = collectSelection(jsx)
		const selection = scope.toSelectionMeta()
		mergeSelections(selection, jsxSel)

		const query = buildQueryFromSelection(selection)

		// usages should be in the query with nested fields
		const usagesSpec = query.fields.find((f: any) => f.name === 'usages')
		expect(usagesSpec).toBeDefined()
		expect(usagesSpec!.nested).toBeDefined()

		const orgSpec = usagesSpec!.nested!.fields.find((f: any) => f.name === 'organization')
		expect(orgSpec).toBeDefined()
		expect(orgSpec!.nested).toBeDefined()
		expect(orgSpec!.nested!.fields.find((f: any) => f.name === 'name')).toBeDefined()
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
					<span>{entity.name.inputProps.value}</span>
					<MockSelectField field={entity.featureFlagSet}>
						{it => <span>{it.name.inputProps.value}</span>}
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

	test('createComponent with explicit fragment inside <If> is collected', () => {
		// Fragment component with explicit selection
		const OrganizationInfo = createComponent()
			.entity('org', schema.Organization, e => e.name())
			.render(({ org }) => (
				<span>{org.name.value}</span>
			))

		// Parent component using OrganizationInfo inside <If>
		const ProjectForm = createComponent()
			.entity('entity', schema.Project)
			.render(({ entity }) => (
				<div>
					<Field field={entity.name} />
					<If
						condition={true}
						then={
							<HasOne field={entity.organization}>
								{org => <OrganizationInfo org={org} />}
							</HasOne>
						}
					/>
				</div>
			))

		const sel = getComponentSelection(ProjectForm, 'entity')
		expect(sel).toBeDefined()
		expect(getField(sel!, 'name')).toBeDefined()

		// The organization relation from <If> → <HasOne> should be collected
		const orgField = getField(sel!, 'organization')
		expect(orgField).toBeDefined()
		expect(orgField!.isRelation).toBe(true)
		expect(orgField!.nested).toBeDefined()
		// The OrganizationInfo fragment's explicit selection (name) should be merged
		expect(orgField!.nested!.fields.has('name')).toBe(true)
	})

	test('createComponent with explicit fragment inside <If> else branch is collected', () => {
		const OrganizationInfo = createComponent()
			.entity('org', schema.Organization, e => e.name())
			.render(({ org }) => (
				<span>{org.name.value}</span>
			))

		const FeatureFlagInfo = createComponent()
			.entity('ffs', schema.FeatureFlagSet, e => e.name())
			.render(({ ffs }) => (
				<span>{ffs.name.value}</span>
			))

		// Both branches of <If> should contribute to selection
		const ProjectForm = createComponent()
			.entity('entity', schema.Project)
			.render(({ entity }) => (
				<div>
					<Field field={entity.slug} />
					<If
						condition={true}
						then={
							<HasOne field={entity.organization}>
								{org => <OrganizationInfo org={org} />}
							</HasOne>
						}
						else={
							<HasOne field={entity.featureFlagSet}>
								{ffs => <FeatureFlagInfo ffs={ffs} />}
							</HasOne>
						}
					/>
				</div>
			))

		const sel = getComponentSelection(ProjectForm, 'entity')
		expect(sel).toBeDefined()

		// Both branches should be collected
		const orgField = getField(sel!, 'organization')
		expect(orgField).toBeDefined()
		expect(orgField!.isRelation).toBe(true)
		expect(orgField!.nested!.fields.has('name')).toBe(true)

		const ffsField = getField(sel!, 'featureFlagSet')
		expect(ffsField).toBeDefined()
		expect(ffsField!.isRelation).toBe(true)
		expect(ffsField!.nested!.fields.has('name')).toBe(true)
	})

	test('createComponent children via `children` prop contribute to selection', () => {
		const { SelectionScope } = require('@contember/bindx')
		const { createCollectorProxy, collectSelection, mergeSelections } = require('@contember/bindx-react')

		const VoucherLabel = createComponent()
			.entity('entity', schema.Voucher, e => e.label())
			.render(({ entity }: any) => <span>{entity.label.value}</span>)
		;(VoucherLabel as any).$entity

		const VoucherShell = createComponent()
			.entity('entity', schema.Voucher, e => e.code())
			.props<{ children: ReactNode }>()
			.render(({ entity, children }: any) => (
				<section>
					<span>{entity.code.value}</span>
					{children}
				</section>
			))
		;(VoucherShell as any).$entity

		const registry = new SchemaRegistry(schemaDef)
		const scope = new SelectionScope()
		const collector = createCollectorProxy(scope, 'Voucher', registry)

		const jsx = (
			<VoucherShell entity={collector}>
				<VoucherLabel entity={collector} />
			</VoucherShell>
		)

		const jsxSel = collectSelection(jsx)
		const selection = scope.toSelectionMeta()
		mergeSelections(selection, jsxSel)

		expect(selection.fields.has('code')).toBe(true)
		expect(selection.fields.has('label')).toBe(true)
	})

	test('createComponent custom slot contributes to selection when listed via .slots()', () => {
		const { SelectionScope } = require('@contember/bindx')
		const { createCollectorProxy, collectSelection, mergeSelections } = require('@contember/bindx-react')

		const VoucherCode = createComponent()
			.entity('entity', schema.Voucher, e => e.code())
			.render(({ entity }: any) => <span>{entity.code.value}</span>)
		;(VoucherCode as any).$entity

		const VoucherShell = createComponent()
			.entity('entity', schema.Voucher, e => e.label())
			.props<{ header: ReactNode; footer: ReactNode }>()
			.slots(['header', 'footer'])
			.render(({ entity, header, footer }: any) => (
				<section>
					<header>{header}</header>
					<span>{entity.label.value}</span>
					<footer>{footer}</footer>
				</section>
			))
		;(VoucherShell as any).$entity

		const registry = new SchemaRegistry(schemaDef)
		const scope = new SelectionScope()
		const collector = createCollectorProxy(scope, 'Voucher', registry)

		const jsx = (
			<VoucherShell
				entity={collector}
				header={<VoucherCode entity={collector} />}
				footer={null}
			/>
		)

		const jsxSel = collectSelection(jsx)
		const selection = scope.toSelectionMeta()
		mergeSelections(selection, jsxSel)

		expect(selection.fields.has('label')).toBe(true)
		expect(selection.fields.has('code')).toBe(true)
	})

	test('createComponent opts out of slot analysis via .slots([])', () => {
		const { SelectionScope } = require('@contember/bindx')
		const { createCollectorProxy, collectSelection, mergeSelections } = require('@contember/bindx-react')

		const VoucherLabel = createComponent()
			.entity('entity', schema.Voucher, e => e.label())
			.render(({ entity }: any) => <span>{entity.label.value}</span>)
		;(VoucherLabel as any).$entity

		const OpaqueShell = createComponent()
			.entity('entity', schema.Voucher, e => e.code())
			.props<{ children: ReactNode }>()
			.slots([])
			.render(({ entity, children }: any) => (
				<section>
					<span>{entity.code.value}</span>
					{children}
				</section>
			))
		;(OpaqueShell as any).$entity

		const registry = new SchemaRegistry(schemaDef)
		const scope = new SelectionScope()
		const collector = createCollectorProxy(scope, 'Voucher', registry)

		const jsx = (
			<OpaqueShell entity={collector}>
				<VoucherLabel entity={collector} />
			</OpaqueShell>
		)

		const jsxSel = collectSelection(jsx)
		const selection = scope.toSelectionMeta()
		mergeSelections(selection, jsxSel)

		expect(selection.fields.has('code')).toBe(true)
		expect(selection.fields.has('label')).toBe(false)
	})
})
