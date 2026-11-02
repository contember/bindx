/**
 * Soundness regressions: shapes the analyzer once compiled while selecting LESS than the runtime
 * collector. Each case renders the transformed and the untransformed module under a recording
 * adapter (real schema) and asserts the compiled query covers the runtime one. A bail is always
 * sound — the transformed module then simply runs the runtime path.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator'
if (typeof document === 'undefined') {
	GlobalRegistrator.register()
}

import { afterAll, afterEach, describe, expect, test, spyOn } from 'bun:test'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { cleanup, render, waitFor } from '@testing-library/react'
import { BindxProvider, type Query, type QueryFieldSpec } from '@contember/bindx-react'
import { RecordingMockAdapter, schema, transform } from './rootOracle.js'
import { isSubset } from './harness.js'

const DIR = import.meta.dir

const MOCK_DATA = {
	Article: {
		'article-1': {
			id: 'article-1', title: 'Hello World', content: 'Body',
			author: { id: 'author-1', name: 'John' },
			tags: [{ id: 'tag-1', name: 'news' }],
		},
	},
	Author: { 'author-1': { id: 'author-1', name: 'John' } },
	Tag: { 'tag-1': { id: 'tag-1', name: 'news' } },
}

const IMPORTS = `
import React from 'react'
import { Entity, Field, HasOne, HasMany, Show, createComponent, withCollector, itemOf, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
const AuthorDef = entityDef('Author')
const isCz = Math.random() > 2
const Picker = withCollector((_props) => null, (props) => <HasOne field={props.field}>{entity => props.renderItem(entity)}</HasOne>)
const Select = withCollector((_props) => null, (props) => <HasOne field={props.field}>{entity => props.children(entity)}</HasOne>)
const Blocks = withCollector((_props) => null, (props) => <HasOne field={props.field}>{entity => props.blocks.main(entity)}</HasOne>)
const Repeater = withCollector(function RepeaterRuntime(_props) { return null }, { children: itemOf('field') })
const renderTag = tag => <Field field={tag.name} />
const renderAuthor = author => <Field field={author.name} />
const renderers = { author: author => <Field field={author.name} /> }
const labels = {}
`

/** A module whose `.render()` host is mounted under an `<Entity>` root. */
function hostCase(render: string, prelude = ''): string {
	return `${IMPORTS}${prelude}
const Host = createComponent().entity('article', ArticleDef).render(${render})
export function Route() {
	return <Entity entity={ArticleDef} by={{ id: 'article-1' }}>{article => <div><Host article={article} /></div>}</Entity>
}
`
}

/** A module whose `<Entity>` children closure is the analyzed body. */
function rootCase(body: string, children: string): string {
	return `${IMPORTS}
export function Route() {
	${body}
	return <Entity entity={ArticleDef} by={{ id: 'article-1' }}>{${children}}</Entity>
}
`
}

function normalizeFields(fields: readonly QueryFieldSpec[]): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const field of [...fields].sort((a, b) => a.name.localeCompare(b.name))) {
		out[field.name] = field.nested ? normalizeFields(field.nested.fields) : true
	}
	return out
}

const tmpFiles: string[] = []
let counter = 0

interface RouteModule {
	readonly Route: React.ComponentType
}

/** An under-fetching compiled render throws on the first unfetched read; the query is what we compare. */
class SwallowRenderErrors extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
	override state = { hasError: false }
	static getDerivedStateFromError(): { hasError: boolean } {
		return { hasError: true }
	}
	override render(): React.ReactNode {
		return this.state.hasError ? null : this.props.children
	}
}

/** The Article root selection the adapter is asked for (render errors are irrelevant here). */
async function captureArticleQuery(source: string): Promise<Record<string, unknown>> {
	const path = join(DIR, `.soundness-${counter++}.tsx`)
	writeFileSync(path, source)
	tmpFiles.push(path)
	const mod: RouteModule = await import(path)
	const adapter = new RecordingMockAdapter(structuredClone(MOCK_DATA), { delay: 0 })
	render(<BindxProvider adapter={adapter} schema={schema}><SwallowRenderErrors><mod.Route /></SwallowRenderErrors></BindxProvider>)
	let get: Extract<Query, { type: 'get' }> | undefined
	await waitFor(() => {
		get = adapter.captured.find((q): q is Extract<Query, { type: 'get' }> => q.type === 'get' && q.entityType === 'Article')
		expect(get).toBeDefined()
	})
	return get ? normalizeFields(get.spec.fields) : {}
}

const CASES: ReadonlyArray<readonly [string, string]> = [
	['props destructured in the body', hostCase(`(props) => { const { article } = props; return <Field field={article.title} /> }`)],
	['props aliased in the body', hostCase(`(props) => { const p = props; return <Field field={p.article.title} /> }`)],
	['props passed to a helper', hostCase(`(props) => <div>{renderBody(props)}</div>`, `const renderBody = (props) => <Field field={props.article.title} />`)],
	['string-literal key in the param pattern', hostCase(`({ 'article': a }) => <Field field={a.title} />`)],
	['identifier children of <HasMany>', hostCase(`({ article }) => <HasMany field={article.tags}>{renderTag}</HasMany>`)],
	['children attribute of <HasMany>', hostCase(`({ article }) => <HasMany field={article.tags} children={tag => <Field field={tag.name} />} />`)],
	['identifier children of <HasOne>', hostCase(`({ article }) => <HasOne field={article.author}>{renderAuthor}</HasOne>`)],
	['conditional field of <Field>', hostCase(`({ article }) => <Field field={isCz ? article.title : article.content} />`)],
	['conditional field of <HasMany>', hostCase(`({ article }) => <HasMany field={isCz ? article.tags : article.tags}>{tag => <Field field={tag.name} />}</HasMany>`)],
	['fallback of <Show>', hostCase(`({ article }) => <Show field={article.content} fallback={<Field field={article.title} />}>x</Show>`)],
	['plain children of <Field>', hostCase(`({ article }) => <Field field={article.title}><b>{article.content.value}</b></Field>`)],
	['immediately invoked closure', hostCase(`({ article }) => <div>{(() => <Field field={article.title} />)()}</div>`)],
	['identifier contract callback', hostCase(`({ article }) => <Repeater field={article.tags}>{renderTag}</Repeater>`)],
	['member-expression render prop on a hole', hostCase(`({ article }) => <Picker field={article.author} renderItem={renderers.author} />`)],
	['identifier children on a hole', hostCase(`({ article }) => <Select field={article.author}>{renderAuthor}</Select>`)],
	['children attribute on a hole', hostCase(`({ article }) => <Select field={article.author} children={it => <Field field={it.name} />} />`)],
	['closure capturing a render-scope function declaration', hostCase(`({ article }) => { function wrap(node) { return node } return <Picker field={article.author} renderItem={it => wrap(<Field field={it.name} />)} /> }`)],
	['meta access on a has-one', hostCase(`({ article }) => <span>{String(article.author.$isConnected)}</span>`)],
	['id of a has-one as a key', hostCase(`({ article }) => <span key={article.author.id}>x</span>`)],
	['member access on a conditional entity value', hostCase(`({ article }) => <span>{(isCz ? article.author : article.author).name.value}</span>`)],
	['computed member keyed by a field', hostCase(`({ article }) => <span>{labels[article.content.value ?? '']}</span>`)],
	['member access on a .map() result', hostCase(`({ article }) => <span>{article.tags.map(tag => tag.name.value).length}</span>`)],
	['function children using arguments', hostCase(`({ article }) => <HasMany field={article.tags}>{function () { return <Field field={arguments[0].name} /> }}</HasMany>`)],
	['render-local component shadowing a module binding', hostCase(
		`({ article }) => { const Card = AuthorName; return <Card author={article.author} /> }`,
		`const AuthorName = createComponent().entity('author', AuthorDef).render(({ author }) => <Field field={author.name} />)
const Card = (_props) => null`,
	)],
	['rest of the props object', hostCase(`(props) => { const { ...rest } = props; return <Field field={rest.article.title} /> }`)],
	['function declaration called during render', hostCase(`({ article }) => { function title() { return <Field field={article.title} /> } return <div>{title()}</div> }`)],
	['object of closures capturing a render local', hostCase(`({ article }) => { const wrap = node => node; return <Blocks field={article.author} blocks={{ main: it => wrap(<Field field={it.name} />) }} /> }`)],
	['closure capturing a let assigned later', hostCase(`({ article }) => { let wrap; wrap = node => node; return <Picker field={article.author} renderItem={it => wrap(<Field field={it.name} />)} /> }`)],
	['root closure capturing a component-scope binding', rootCase(
		`const wrap = node => node`,
		`article => <div><Picker field={article.author} renderItem={it => wrap(<Field field={it.name} />)} /></div>`,
	)],
]

afterEach(() => {
	cleanup()
})
afterAll(() => {
	for (const file of tmpFiles) {
		rmSync(file, { force: true })
	}
})

describe('soundness: compiled ⊇ runtime', () => {
	for (const [name, source] of CASES) {
		test(name, async () => {
			const consoleError = spyOn(console, 'error').mockImplementation(() => {})
			try {
				const runtime = await captureArticleQuery(source)
				const compiled = await captureArticleQuery(transform(source, DIR))
				// On a miss, diff the compiled query against the runtime one.
				expect(isSubset(runtime, compiled) ? runtime : compiled).toEqual(runtime)
			} finally {
				consoleError.mockRestore()
			}
		})
	}
})

/** Safe shapes that must still compile (both the root and the host carry a literal). */
const COMPILING: ReadonlyArray<readonly [string, string]> = [
	['inline render prop on a hole', hostCase(`({ article }) => <Picker field={article.author} renderItem={it => <Field field={it.name} />} />`)],
	['module-scope render prop on a hole', hostCase(`({ article }) => <Picker field={article.author} renderItem={renderers.author} />`)],
	['module-scope children on a hole', hostCase(`({ article }) => <Select field={article.author}>{renderAuthor}</Select>`)],
	['object of module-scope closures on a hole', hostCase(`({ article }) => <Blocks field={article.author} blocks={{ main: it => <Field field={it.name} /> }} />`)],
	['props destructured in the body', hostCase(`(props) => { const { article } = props; return <Field field={article.title} /> }`)],
	['event handler calling a field setter in a render-function child', hostCase(`({ article }) => <Field field={article.title}>{title => <input onChange={e => article.title.setValue(e.target.value)} value={title.value ?? ''} />}</Field>`)],
]

describe('safe shapes still compile, equal to the runtime', () => {
	for (const [name, source] of COMPILING) {
		test(name, async () => {
			const transformed = transform(source, DIR)
			expect(transformed.match(/v: 2/g)?.length).toBe(2)
			const runtime = await captureArticleQuery(source)
			const compiled = await captureArticleQuery(transformed)
			expect(compiled).toEqual(runtime)
		})
	}
})

describe('accessor reads stay accessors', () => {
	test('.value and .length are not fetched as nested fields', async () => {
		const source = hostCase(`({ article }) => <span>{article.title.value}{article.tags.length}</span>`)
		const runtime = await captureArticleQuery(source)
		const compiled = await captureArticleQuery(transform(source, DIR))
		expect(compiled).toEqual(runtime)
	})
})
