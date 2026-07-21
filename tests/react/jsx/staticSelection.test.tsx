// Tests for compiled selections (deliverable A): the converter, the compiled
// build path (proxy pass skipped), end-to-end fetch, validate mode, and phase-2
// nested-component hole resolution. CompiledSelection literals are hand-written
// here to simulate the compiler's emit.
import '../../setup'
import { describe, test, expect, afterEach, spyOn } from 'bun:test'
import { cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import {
	createComponent,
	withCollector,
	Field,
	HasOne,
	HasMany,
	Entity,
	COMPONENT_SELECTIONS,
	staticSelectionToMeta,
	setStaticSelectionValidation,
	type SelectionMeta,
	type StaticFieldMap,
	type EntityRef,
} from '@contember/bindx-react'
import { SelectionScope } from '@contember/bindx'
import { schema, renderWithBindx, getByTestId, type Article, type Author } from '../../shared'

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

function fieldNames(meta: SelectionMeta): string[] {
	return [...meta.fields.values()].map(f => f.fieldName)
}

function relation(meta: SelectionMeta, fieldName: string): SelectionMeta {
	const field = [...meta.fields.values()].find(f => f.fieldName === fieldName)
	if (!field?.nested) throw new Error(`no nested relation "${fieldName}"`)
	return field.nested
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

describe('compiled build path (props only)', () => {
	test('compiled selection is used and the proxy pass (render fn) is skipped', () => {
		let renderCalls = 0
		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(
				({ article }) => {
					renderCalls++
					return <Field field={article.title} />
				},
				{ props: { article: { title: true } } },
			)

		const selection = getComponentSelection(Comp, 'article')
		// Proxy pass would have executed the render fn; the compiled path must not.
		expect(renderCalls).toBe(0)
		expect([...selection!.fields.keys()]).toEqual(['title'])
	})

	test('no compiled argument leaves proxy collection behavior unchanged (sanity)', () => {
		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(({ article }) => <Field field={article.title} />)

		const selection = getComponentSelection(Comp, 'article')
		expect([...selection!.fields.keys()]).toContain('title')
	})

	test('end-to-end: a compiled-selection component under <Entity> fetches and renders', async () => {
		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(
				({ article }) => <span data-testid="title"><Field field={article.title} /></span>,
				{ props: { article: { title: true } } },
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
	test('agreeing compiled and runtime selections emit no warning', () => {
		setStaticSelectionValidation(true)
		const warn = spyOn(console, 'warn').mockImplementation(() => {})

		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(
				({ article }) => <Field field={article.title} />,
				{ props: { article: { title: true } } },
			)

		getComponentSelection(Comp, 'article')
		expect(warn).not.toHaveBeenCalled()
		warn.mockRestore()
	})

	test('compiled superset (extra fields, e.g. branch union) emits no warning', () => {
		setStaticSelectionValidation(true)
		const warn = spyOn(console, 'warn').mockImplementation(() => {})

		// Compiled declares more than the render body reads (as branch unions do).
		// Over-fetch is acceptable — only under-fetch warns.
		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(
				({ article }) => <Field field={article.title} />,
				{ props: { article: { title: true, content: true, status: true } } },
			)

		getComponentSelection(Comp, 'article')
		expect(warn).not.toHaveBeenCalled()
		warn.mockRestore()
	})

	test('has-many params/many-ness only in compiled (divergence 1) emits no warning', () => {
		setStaticSelectionValidation(true)
		const warn = spyOn(console, 'warn').mockImplementation(() => {})

		// The compiler emits has-many params; the runtime does not record them in
		// implicit collection. Same fields, so a params-only difference must not warn.
		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(
				({ article }) => <HasMany field={article.tags}>{t => <Field field={t.name} />}</HasMany>,
				{ props: { article: { tags: { fields: { name: true }, many: true, params: { limit: 5 } } } } },
			)

		getComponentSelection(Comp, 'article')
		expect(warn).not.toHaveBeenCalled()
		warn.mockRestore()
	})

	test('disagreeing selections emit one warning naming the missing field', () => {
		setStaticSelectionValidation(true)
		const warn = spyOn(console, 'warn').mockImplementation(() => {})

		// Compiled omits `content`, but the render body reads it → runtime finds it.
		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(
				({ article }) => (
					<div>
						<Field field={article.title} />
						<Field field={article.content} />
					</div>
				),
				{ props: { article: { title: true } } },
			)

		getComponentSelection(Comp, 'article')
		expect(warn).toHaveBeenCalledTimes(1)
		const message = String(warn.mock.calls[0]![0])
		expect(message).toContain('content')
		expect(message).toContain('BindxComponent(article)')
		warn.mockRestore()
	})

	test('a hole-carrying component is not flagged in validate mode', () => {
		setStaticSelectionValidation(true)
		const warn = spyOn(console, 'warn').mockImplementation(() => {})

		const AuthorCard = createComponent()
			.entity('author', schema.Author)
			.render(({ author }) => <Field field={author.name} />)

		// Real render body matches the hole, so the proxy oracle agrees with the
		// compiled (fields + resolved hole) selection — no under-fetch.
		const Comp = createComponent()
			.entity('article', schema.Article)
			.render(
				({ article }) => <AuthorCard author={article.author} />,
				{
					props: { article: {} },
					holes: [{
						component: () => AuthorCard,
						entityProps: { author: { source: 'article', path: ['author'] } },
					}],
				},
			)

		getComponentSelection(Comp, 'article')
		expect(warn).not.toHaveBeenCalled()
		warn.mockRestore()
	})
})

describe('compiled selection v2 — nested-component holes', () => {
	test('hole → createComponent target equals the proxy-pass selection of an inline host', () => {
		const AuthorCard = createComponent()
			.entity('author', schema.Author)
			.render(({ author }) => (
				<div>
					<Field field={author.name} />
					<Field field={author.email} />
				</div>
			))

		// Oracle: a hand-rolled host that renders the target inline, collected via
		// the runtime proxy pass.
		const InlineHost = createComponent()
			.entity('article', schema.Article)
			.render(({ article }) => <AuthorCard author={article.author} />)
		const oracle = getComponentSelection(InlineHost, 'article')

		// Compiled: same composition expressed as a hole; render must never run.
		const CompiledHost = createComponent()
			.entity('article', schema.Article)
			.render(
				() => { throw new Error('render must not run on the compiled path') },
				{
					props: { article: {} },
					holes: [{
						component: () => AuthorCard,
						entityProps: { author: { source: 'article', path: ['author'] } },
					}],
				},
			)
		const compiled = getComponentSelection(CompiledHost, 'article')

		expect(compiled).toEqual(oracle!)
		// Sanity: fields landed under the `author` relation.
		expect(fieldNames(relation(compiled!, 'author')).sort()).toEqual(['email', 'id', 'name'])
	})

	test('hole with empty path passes the root entity to the target', () => {
		const Summary = createComponent()
			.entity('item', schema.Article)
			.render(({ item }) => <Field field={item.title} />)

		const CompiledHost = createComponent()
			.entity('article', schema.Article)
			.render(
				() => { throw new Error('render must not run') },
				{
					props: { article: {} },
					holes: [{
						component: () => Summary,
						entityProps: { item: { source: 'article', path: [] } },
					}],
				},
			)
		const selection = getComponentSelection(CompiledHost, 'article')
		// Root-level path ⇒ merged fields land at the article root, not nested.
		expect(fieldNames(selection!)).toContain('title')
	})

	test('hole → withCollector/staticRender target', () => {
		interface TitleCollectorProps { item: EntityRef<Article> }
		const TitleCollector = withCollector(
			function TitleCollector(_props: TitleCollectorProps): React.ReactNode { return null },
			(props: TitleCollectorProps) => (
				<>
					<Field field={props.item.title} />
					<Field field={props.item.content} />
				</>
			),
		)

		const CompiledHost = createComponent()
			.entity('article', schema.Article)
			.render(
				() => { throw new Error('render must not run') },
				{
					props: { article: {} },
					holes: [{
						component: () => TitleCollector,
						entityProps: { item: { source: 'article', path: [] } },
					}],
				},
			)
		const selection = getComponentSelection(CompiledHost, 'article')
		expect(fieldNames(selection!).sort()).toEqual(['content', 'title'])
	})

	test('hole with entity-derived path merges fields under the relation', () => {
		const AuthorName = createComponent()
			.entity('author', schema.Author)
			.render(({ author }) => <Field field={author.name} />)

		const CompiledHost = createComponent()
			.entity('article', schema.Article)
			.render(
				() => { throw new Error('render must not run') },
				{
					props: { article: { title: true } },
					holes: [{
						component: () => AuthorName,
						entityProps: { author: { source: 'article', path: ['author'] } },
					}],
				},
			)
		const selection = getComponentSelection(CompiledHost, 'article')
		// The host's own static field coexists with the hole's nested contribution.
		expect(fieldNames(selection!)).toContain('title')
		expect(fieldNames(relation(selection!, 'author'))).toContain('name')
	})

	test('hole target defined AFTER the host (thunk avoids TDZ)', () => {
		const CompiledHost = createComponent()
			.entity('article', schema.Article)
			.render(
				() => { throw new Error('render must not run') },
				{
					props: { article: {} },
					holes: [{
						// LateAuthorCard is declared below — the thunk defers resolution
						// until collection time, dodging the temporal dead zone.
						component: () => LateAuthorCard,
						entityProps: { author: { source: 'article', path: ['author'] } },
					}],
				},
			)

		const LateAuthorCard = createComponent()
			.entity('author', schema.Author)
			.render(({ author }) => <Field field={author.name} />)

		const selection = getComponentSelection(CompiledHost, 'article')
		expect(fieldNames(relation(selection!, 'author'))).toContain('name')
	})

	test('multiple entityProps on one hole', () => {
		const Pair = createComponent()
			.entity('author', schema.Author)
			.entity('place', schema.Location)
			.render(({ author, place }) => (
				<>
					<Field field={author.name} />
					<Field field={place.label} />
				</>
			))

		const CompiledHost = createComponent()
			.entity('article', schema.Article)
			.render(
				() => { throw new Error('render must not run') },
				{
					props: { article: {} },
					holes: [{
						component: () => Pair,
						entityProps: {
							author: { source: 'article', path: ['author'] },
							place: { source: 'article', path: ['location'] },
						},
					}],
				},
			)
		const selection = getComponentSelection(CompiledHost, 'article')
		expect(fieldNames(relation(selection!, 'author'))).toContain('name')
		expect(fieldNames(relation(selection!, 'location'))).toContain('label')
	})

	test('plain component target contributes nothing; validate warns, non-validate is silent', () => {
		function PlainThing(_props: { value: unknown }): React.ReactNode { return null }

		const build = (): unknown => createComponent()
			.entity('article', schema.Article)
			.render(
				() => null,
				{
					props: { article: { title: true } },
					holes: [{
						component: () => PlainThing,
						entityProps: { value: { source: 'article', path: ['author'] } },
					}],
				},
			)

		// validate OFF: no warn, no crash.
		const warnOff = spyOn(console, 'warn').mockImplementation(() => {})
		expect(fieldNames(getComponentSelection(build(), 'article')!)).toContain('title')
		expect(warnOff).not.toHaveBeenCalled()
		warnOff.mockRestore()

		// validate ON: exactly one warn naming the blind-spot component.
		setStaticSelectionValidation(true)
		const warnOn = spyOn(console, 'warn').mockImplementation(() => {})
		getComponentSelection(build(), 'article')
		expect(warnOn).toHaveBeenCalledTimes(1)
		expect(String(warnOn.mock.calls[0]![0])).toContain('PlainThing')
		warnOn.mockRestore()
	})

	test('a throwing hole target is contained — siblings and static fields survive', () => {
		const error = spyOn(console, 'error').mockImplementation(() => {})

		const throwingTarget = {
			getSelection(): never { throw new Error('boom') },
		}
		const AuthorCard = createComponent()
			.entity('author', schema.Author)
			.render(({ author }) => <Field field={author.name} />)

		const CompiledHost = createComponent()
			.entity('article', schema.Article)
			.render(
				() => { throw new Error('render must not run') },
				{
					props: { article: { title: true } },
					holes: [
						{
							component: () => throwingTarget,
							entityProps: { author: { source: 'article', path: ['author'] } },
						},
						{
							component: () => AuthorCard,
							entityProps: { author: { source: 'article', path: ['author'] } },
						},
					],
				},
			)
		const selection = getComponentSelection(CompiledHost, 'article')

		// Static field and the sibling hole both survived the throwing one.
		expect(fieldNames(selection!)).toContain('title')
		expect(fieldNames(relation(selection!, 'author'))).toContain('name')
		expect(error).toHaveBeenCalled()
		error.mockRestore()
	})

	test('hole extraProps: a lifted render-prop closure collects through the target staticRender', () => {
		// Mirrors npi's SelectField (and the compiler's phase-2.1 lift): the render-prop child is
		// passed via extraProps, and the target's staticRender INVOKES it with the relation entity.
		interface SelectFieldProps {
			entity: EntityRef<Author>
			children: (entity: EntityRef<Author>) => React.ReactNode
		}
		const SelectField = withCollector(
			function SelectField(_props: SelectFieldProps): React.ReactNode { return null },
			(props: SelectFieldProps) => <>{props.children(props.entity)}</>,
		)

		const CompiledHost = createComponent()
			.entity('article', schema.Article)
			.render(
				() => { throw new Error('render must not run') },
				{
					props: { article: {} },
					holes: [{
						component: () => SelectField,
						entityProps: { entity: { source: 'article', path: ['author'] } },
						// The lifted closure captures nothing; the target replays it with a proxy.
						extraProps: { children: () => (entity: EntityRef<Author>) => <Field field={entity.name} /> },
					}],
				},
			)

		const selection = getComponentSelection(CompiledHost, 'article')
		expect(fieldNames(relation(selection!, 'author'))).toContain('name')
	})

	test('render fn is never executed even when holes are present', () => {
		let renderCalls = 0
		const AuthorCard = createComponent()
			.entity('author', schema.Author)
			.render(({ author }) => <Field field={author.name} />)

		const CompiledHost = createComponent()
			.entity('article', schema.Article)
			.render(
				({ article }) => {
					renderCalls++
					return <AuthorCard author={article.author} />
				},
				{
					props: { article: { title: true } },
					holes: [{
						component: () => AuthorCard,
						entityProps: { author: { source: 'article', path: ['author'] } },
					}],
				},
			)

		getComponentSelection(CompiledHost, 'article')
		expect(renderCalls).toBe(0)
	})
})
