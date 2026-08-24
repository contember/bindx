// Regression test for https://github.com/contember/bindx/issues/57
import '../../setup'
import { describe, test, expect } from 'bun:test'
import React from 'react'
import { createComponent, Field, COMPONENT_SELECTIONS, type SelectionMeta } from '@contember/bindx-react'
import { schema } from '../../shared'

// Triggers lazy implicit-selection collection by reading the `$<propName>`
// fragment getter (same mechanism the parent collector uses).
function getComponentSelection(component: unknown, propName: string): SelectionMeta | undefined {
	const fragment = (component as Record<string, unknown>)[`$${propName}`]
	if (!fragment) return undefined
	const selections = (component as Record<symbol, Map<string, { selection: SelectionMeta }>>)[COMPONENT_SELECTIONS]
	return selections?.get(propName)?.selection
}

function getFieldNames(selection: SelectionMeta): string[] {
	return [...selection.fields.keys()]
}

describe('createComponent — scalar prop used in render body during collection', () => {
	// During implicit-selection collection bindx runs the render body with a
	// proxy whose scalar (`.props<>()`) values are `undefined`, and the
	// `renderFn(propsProxy)` pass is unguarded. So a render body that uses a
	// scalar prop value — e.g. calling a translator `t(key)` — crashes the
	// whole collection with "t is not a function", even though this is correct
	// usage (no hook, no `.value` read on a ref).
	test('should not crash collection when render body calls a scalar function prop', () => {
		const Comp = createComponent()
			.entity('entity', schema.Article)
			.props<{ t: (key: string) => string }>()
			.render(({ entity, t }) => (
				<div>
					<h2>{t('some.heading')}</h2>
					<Field field={entity.title} />
				</div>
			))

		expect(() => getComponentSelection(Comp, 'entity')).not.toThrow()

		// Collection must still discover the entity fields.
		const sel = getComponentSelection(Comp, 'entity')
		expect(sel).toBeDefined()
		expect(getFieldNames(sel!)).toContain('title')
	})

	test('should not crash collection when render body reads a scalar object prop', () => {
		const Comp = createComponent()
			.entity('entity', schema.Article)
			.props<{ labels: { heading: string } }>()
			.render(({ entity, labels }) => (
				<div>
					<h2>{labels.heading}</h2>
					<Field field={entity.title} />
				</div>
			))

		expect(() => getComponentSelection(Comp, 'entity')).not.toThrow()
	})
})
