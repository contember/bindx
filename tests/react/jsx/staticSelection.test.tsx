// Tests for precompiled static selections (deliverable A): the converter,
// the static build path (proxy pass skipped), end-to-end fetch, and validate mode.
import '../../setup'
import { describe, test, expect, afterEach, spyOn } from 'bun:test'
import { cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import {
	createComponent,
	Field,
	HasOne,
	HasMany,
	Entity,
	COMPONENT_SELECTIONS,
	staticSelectionToMeta,
	setStaticSelectionValidation,
	type SelectionMeta,
	type StaticFieldMap,
} from '@contember/bindx-react'
import { SelectionScope } from '@contember/bindx'
import { schema, renderWithBindx, getByTestId } from '../../shared'

afterEach(() => {
	cleanup()
	// Validate mode is a module-level flag — never leak it into other tests.
	setStaticSelectionValidation(false)
})

// Triggers static collection via the `$<propName>` fragment getter, then reads
// the stored SelectionMeta — same mechanism the parent Entity walk uses.
function getComponentSelection(component: unknown, propName: string): SelectionMeta | undefined {
	const fragment = (component as Record<string, unknown>)[`$${propName}`]
	if (!fragment) return undefined
	const selections = (component as Record<symbol, Map<string, { selection: SelectionMeta }>>)[COMPONENT_SELECTIONS]
	return selections?.get(propName)?.selection
}

describe('staticSelectionToMeta — converter equivalence', () => {
	test('scalars, has-one nesting and has-many match proxy collection', () => {
		// Runtime oracle: selection collected from a real component's proxy pass.
		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(({ article }) => (
				<div>
					<Field field={article.title} />
					<Field field={article.content} />
					<HasOne field={article.author}>{a => <Field field={a.name} />}</HasOne>
					<HasMany field={article.tags}>{t => <Field field={t.name} />}</HasMany>
				</div>
			))
		const runtime = getComponentSelection(Comp, 'article')

		const map: StaticFieldMap = {
			title: true,
			content: true,
			author: { fields: { name: true } },
			tags: { fields: { name: true }, many: true },
		}
		expect(staticSelectionToMeta(map)).toEqual(runtime!)
	})

	test('relation touched without nested access matches proxy collection', () => {
		// String(article.author) touches the relation but reads no nested field →
		// runtime records it as a scalar leaf, exactly like the `true` node.
		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(({ article }) => <div>{String(article.author)}</div>)
		const runtime = getComponentSelection(Comp, 'article')

		expect(staticSelectionToMeta({ author: true })).toEqual(runtime!)
	})

	test('has-many with params matches an equivalently built SelectionScope', () => {
		// Standalone createComponent has no schema registry, so its proxy pass does
		// not capture has-many params — SelectionScope is the canonical reference here.
		const scope = new SelectionScope()
		const tags = scope.child('tags')
		scope.markAsArray('tags')
		scope.setHasManyParams('tags', { limit: 5, filter: { active: true } })
		tags.addScalar('name')
		const reference = scope.toSelectionMeta()

		const map: StaticFieldMap = {
			tags: { fields: { name: true }, many: true, params: { limit: 5, filter: { active: true } } },
		}
		const actual = staticSelectionToMeta(map)
		expect(actual).toEqual(reference)
		// Params drive alias generation — the has-many key must be the hashed alias, not "tags".
		expect([...actual.fields.keys()][0]).not.toBe('tags')
		expect([...actual.fields.values()][0]!.hasManyParams).toEqual({ limit: 5, filter: { active: true } })
	})
})

describe('static build path', () => {
	test('static selection is used and the proxy pass (render fn) is skipped', () => {
		let renderCalls = 0
		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(
				({ article }) => {
					renderCalls++
					return <Field field={article.title} />
				},
				{ article: { title: true } },
			)

		const selection = getComponentSelection(Comp, 'article')
		// Proxy pass would have executed the render fn; the static path must not.
		expect(renderCalls).toBe(0)
		expect([...selection!.fields.keys()]).toEqual(['title'])
	})

	test('no static argument leaves proxy collection behavior unchanged (sanity)', () => {
		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(({ article }) => <Field field={article.title} />)

		const selection = getComponentSelection(Comp, 'article')
		expect([...selection!.fields.keys()]).toContain('title')
	})

	test('end-to-end: a static-selection component under <Entity> fetches and renders', async () => {
		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(
				({ article }) => <span data-testid="title"><Field field={article.title} /></span>,
				{ article: { title: true } },
			)

		const { container } = renderWithBindx(
			<Entity entity={schema.Article} by={{ id: 'article-1' }}>
				{article => <Comp article={article} />}
			</Entity>,
		)
		await waitFor(() => {
			expect(getByTestId(container, 'title').textContent).toBe('Hello World')
		})
	})
})

describe('validate mode', () => {
	test('agreeing static and runtime selections emit no warning', () => {
		setStaticSelectionValidation(true)
		const warn = spyOn(console, 'warn').mockImplementation(() => {})

		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(
				({ article }) => <Field field={article.title} />,
				{ article: { title: true } },
			)

		getComponentSelection(Comp, 'article')
		expect(warn).not.toHaveBeenCalled()
		warn.mockRestore()
	})

	test('static superset (extra fields, e.g. branch union) emits no warning', () => {
		setStaticSelectionValidation(true)
		const warn = spyOn(console, 'warn').mockImplementation(() => {})

		// Static declares more than the render body reads (as branch unions do).
		// Over-fetch is acceptable — only under-fetch warns.
		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(
				({ article }) => <Field field={article.title} />,
				{ article: { title: true, content: true, status: true } },
			)

		getComponentSelection(Comp, 'article')
		expect(warn).not.toHaveBeenCalled()
		warn.mockRestore()
	})

	test('has-many params/many-ness only in static (divergence 1) emits no warning', () => {
		setStaticSelectionValidation(true)
		const warn = spyOn(console, 'warn').mockImplementation(() => {})

		// The compiler emits has-many params; the runtime does not record them in
		// implicit collection. Same fields, so a params-only difference must not warn.
		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(
				({ article }) => <HasMany field={article.tags}>{t => <Field field={t.name} />}</HasMany>,
				{ article: { tags: { fields: { name: true }, many: true, params: { limit: 5 } } } },
			)

		getComponentSelection(Comp, 'article')
		expect(warn).not.toHaveBeenCalled()
		warn.mockRestore()
	})

	test('disagreeing selections emit one warning naming the missing field', () => {
		setStaticSelectionValidation(true)
		const warn = spyOn(console, 'warn').mockImplementation(() => {})

		// Static omits `content`, but the render body reads it → runtime finds it.
		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(
				({ article }) => (
					<div>
						<Field field={article.title} />
						<Field field={article.content} />
					</div>
				),
				{ article: { title: true } },
			)

		getComponentSelection(Comp, 'article')
		expect(warn).toHaveBeenCalledTimes(1)
		const message = String(warn.mock.calls[0]![0])
		expect(message).toContain('content')
		expect(message).toContain('BindxComponent(article)')
		warn.mockRestore()
	})
})
