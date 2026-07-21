// Regression: rendering a raw ref as a JSX child (`{article.title}` instead of
// <Field field={article.title}/>) must not pollute the collected selection.
// React's isValidElement probes `$$typeof` on the collector proxy; that probe
// used to upgrade the scalar to a bogus relation `{ id, $$typeof }`.
import '../../setup'
import { describe, test, expect } from 'bun:test'
import React from 'react'
import { createComponent, Field, COMPONENT_SELECTIONS, type SelectionMeta } from '@contember/bindx-react'
import { schema } from '../../shared'

function collect(component: unknown, prop: string): SelectionMeta | undefined {
	void (component as Record<string, unknown>)[`$${prop}`]
	const selections = (component as Record<symbol, Map<string, { selection: SelectionMeta }>>)[COMPONENT_SELECTIONS]
	return selections?.get(prop)?.selection
}

describe('collector proxy React probe keys', () => {
	test('a raw scalar ref rendered as a child stays a scalar (no $$typeof relation)', () => {
		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(({ article }) => (
				<div>
					<Field field={article.title} />
					{article.status}
				</div>
			))

		const selection = collect(Comp, 'article')!
		const status = selection.fields.get('status')
		expect(status).toBeDefined()
		// The probe must not have turned `status` into a relation.
		expect(status!.isRelation).toBe(false)
		expect(status!.nested).toBeUndefined()
		// No bogus `$$typeof` field anywhere in the selection.
		expect([...selection.fields.keys()]).not.toContain('$$typeof')
	})
})
