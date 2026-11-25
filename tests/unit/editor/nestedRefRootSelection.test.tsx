import '../../setup'
// An editor bound to a field reached through a has-one (`page.body.content`) must
// select it under that relation only, not also as a root `content` column; the same
// holds for its references (`page.body.references`).
import { describe, expect, test } from 'bun:test'
import type { ReactNode } from 'react'
import React from 'react'
import { Field, collectSelection, createCollectorProxy, defineSchema, hasMany, hasOne, mergeSelections, scalar, type EntityAccessor } from '@contember/bindx-react'
import { SchemaRegistry, SelectionScope, buildQueryFromSelection, type QuerySpec } from '@contember/bindx'
import { BlockEditor, RichTextEditor } from '@contember/bindx-editor'

type JSONPrimitive = string | number | boolean | null
type JSONValue = JSONPrimitive | JSONObject | JSONArray
type JSONObject = { readonly [K in string]?: JSONValue }
type JSONArray = readonly JSONValue[]

interface Reference {
	id: string
	type: string
	caption: string
}

interface Content {
	id: string
	content: JSONValue | null
	references: Reference[]
}

interface Page {
	id: string
	body: Content | null
}

interface TestSchema {
	Page: Page
	Content: Content
	Reference: Reference
}

const schema = defineSchema<TestSchema>({
	entities: {
		Page: { fields: { id: scalar(), body: hasOne('Content', { nullable: true }) } },
		Content: { fields: { id: scalar(), content: scalar(), references: hasMany('Reference') } },
		Reference: { fields: { id: scalar(), type: scalar(), caption: scalar() } },
	},
})

function fieldNames(spec: QuerySpec | undefined): string[] {
	return (spec?.fields ?? []).map(field => field.name).sort()
}

function nestedSpec(spec: QuerySpec | undefined, name: string): QuerySpec | undefined {
	return spec?.fields.find(field => field.name === name)?.nested
}

/** Collects a root Page selection the way `<Entity>` does: collector proxy plus JSX analysis. */
function collectPageQuery(renderPage: (page: EntityAccessor<Page>) => ReactNode): QuerySpec {
	const scope = new SelectionScope()
	const page = createCollectorProxy<Page>(scope, 'Page', new SchemaRegistry(schema))
	const jsxSelection = collectSelection(renderPage(page))
	const selection = scope.toSelectionMeta()
	mergeSelections(selection, jsxSelection)
	return buildQueryFromSelection(selection)
}

const renderNothing = (): null => null

describe('an editor bound to a nested field ref', () => {
	test('<RichTextEditor> selects it under the relation only', () => {
		const query = collectPageQuery(page => <RichTextEditor field={page.body.content}>{renderNothing}</RichTextEditor>)
		expect(fieldNames(query)).toEqual(['body', 'id'])
		expect(fieldNames(query.fields.find(field => field.name === 'body')?.nested)).toEqual(['content', 'id'])
	})

	test('<BlockEditor> selects it under the relation only', () => {
		const query = collectPageQuery(page => <BlockEditor field={page.body.content}>{renderNothing}</BlockEditor>)
		expect(fieldNames(query)).toEqual(['body', 'id'])
		expect(fieldNames(query.fields.find(field => field.name === 'body')?.nested)).toEqual(['content', 'id'])
	})

	test('<BlockEditor references> selects the references under the relation only', () => {
		const query = collectPageQuery(page => (
			<BlockEditor
				field={page.body.content}
				references={page.body.references}
				discriminationField="type"
				blocks={{
					quote: { isVoid: true, render: renderNothing, staticRender: ref => <Field field={ref.caption} /> },
				}}
			>
				{renderNothing}
			</BlockEditor>
		))
		expect(fieldNames(query)).toEqual(['body', 'id'])
		const body = nestedSpec(query, 'body')
		expect(fieldNames(body)).toEqual(['content', 'id', 'references'])
		expect(fieldNames(nestedSpec(body, 'references'))).toEqual(['caption', 'id', 'type'])
	})
})
