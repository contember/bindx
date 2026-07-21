/**
 * Phase 3 end-to-end: Babel plugin → compiled `<Entity>` root selection. The oracle for
 * roots is the QuerySpec the adapter receives: for each fixture we render the TRANSFORMED
 * module (compiledSelection injected, children never walked with a collector) and the
 * UNTRANSFORMED module (runtime children walk) under a query-recording MockAdapter, and
 * compare the requested root selection. Branch-union fixtures assert runtime ⊆ compiled.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator'
if (typeof document === 'undefined') {
	GlobalRegistrator.register()
}

import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import { transformSync } from '@babel/core'
import { writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { cleanup, render, waitFor } from '@testing-library/react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	scalar,
	hasOne,
	hasMany,
	type Query,
	type QueryOptions,
	type QueryResult,
	type QueryFieldSpec,
} from '@contember/bindx-react'
import { analyzeEntityRoots, analyzeSource, isBailed, isEntityRootBailed, bindxCompilerPlugin } from '../src/index.js'

// ── Schema + recording adapter ──────────────────────────────────────────────

interface Schema {
	Article: { id: string; title: string; content: string; author: { id: string; name: string } | null; tags: { id: string; name: string }[] }
	Author: { id: string; name: string }
	Tag: { id: string; name: string }
}
const schema = defineSchema<Schema>({
	entities: {
		Article: { fields: { id: scalar(), title: scalar(), content: scalar(), author: hasOne('Author'), tags: hasMany('Tag') } },
		Author: { fields: { id: scalar(), name: scalar() } },
		Tag: { fields: { id: scalar(), name: scalar() } },
	},
})

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

/** MockAdapter that records every query it receives — the root oracle. */
class RecordingMockAdapter extends MockAdapter {
	readonly captured: Query[] = []
	override async query(queries: readonly Query[], options?: QueryOptions): Promise<QueryResult[]> {
		this.captured.push(...queries)
		return super.query(queries, options)
	}
}

/** The requested selection as a sorted plain tree (params dropped) — comparable across paths. */
function normalizeFields(fields: readonly QueryFieldSpec[]): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const f of [...fields].sort((a, b) => a.name.localeCompare(b.name))) {
		out[f.name] = f.nested ? normalizeFields(f.nested.fields) : true
	}
	return out
}

// ── Module loading (transform → temp .tsx → import) ─────────────────────────

const TMP_DIR = import.meta.dir
const tmpFiles: string[] = []
let counter = 0

function transform(source: string): string {
	const out = transformSync(source, { filename: 'route.tsx', plugins: [bindxCompilerPlugin], configFile: false, babelrc: false })
	if (!out?.code) {
		throw new Error('transform produced no output')
	}
	return out.code
}

async function loadModule<T>(source: string, compiled: boolean): Promise<T> {
	const code = compiled ? transform(source) : source
	const path = join(TMP_DIR, `.p3-${counter++}.tsx`)
	writeFileSync(path, code)
	tmpFiles.push(path)
	return import(path) as Promise<T>
}

interface RouteModule {
	readonly Route: React.ComponentType
	readonly getCollectorCalls?: () => number
}

/** Render a fixture's <Route> under a recording adapter; return the Article root spec. */
async function captureRootSpec(source: string, compiled: boolean): Promise<{ fields: Record<string, unknown>; collectorCalls: number }> {
	const mod = await loadModule<RouteModule>(source, compiled)
	const adapter = new RecordingMockAdapter(structuredClone(MOCK_DATA), { delay: 0 })
	const { container } = render(
		<BindxProvider adapter={adapter} schema={schema}>
			<mod.Route />
		</BindxProvider>,
	)
	await waitFor(() => {
		expect(container.querySelector('[data-testid="ready"]')).not.toBeNull()
	})
	const get = adapter.captured.find((q): q is Extract<Query, { type: 'get' }> => q.type === 'get' && q.entityType === 'Article')
	if (!get) {
		throw new Error('no Article get query captured')
	}
	return { fields: normalizeFields(get.spec.fields), collectorCalls: mod.getCollectorCalls?.() ?? 0 }
}

/** Assert transformed and untransformed request the same root selection. */
async function expectRootEquivalent(source: string): Promise<Record<string, unknown>> {
	const [compiled, runtime] = await Promise.all([captureRootSpec(source, true), captureRootSpec(source, false)])
	expect(compiled.fields).toEqual(runtime.fields)
	return compiled.fields
}

afterEach(() => cleanup())
afterAll(() => {
	for (const file of tmpFiles) {
		rmSync(file, { force: true })
	}
})

// ── Fixtures ────────────────────────────────────────────────────────────────

const SCALARS = `
import { Entity, Field, entityDef, SCOPE_REF } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
let collectorCalls = 0
export const getCollectorCalls = () => collectorCalls
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => {
				if (article && typeof article === 'object' && SCOPE_REF in article) collectorCalls++
				return <div data-testid="ready"><Field field={article.title} /><Field field={article.content} /></div>
			}}
		</Entity>
	)
}
`

const NESTED_HAS_ONE = `
import { Entity, Field, HasOne, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => (
				<div data-testid="ready">
					<Field field={article.title} />
					<HasOne field={article.author}>{author => <Field field={author.name} />}</HasOne>
				</div>
			)}
		</Entity>
	)
}
`

// A compiled createComponent used inside the closure, receiving the ROOT entity. Its
// fragment merges into the root (strict equality — createComponent targets are not blind).
const COMPILED_COMPONENT = `
import { Entity, Field, createComponent, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
const ArticleExtra = createComponent()
	.entity('article', ArticleDef)
	.render(({ article }) => <Field field={article.content} />)
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => <div data-testid="ready"><Field field={article.title} /><ArticleExtra article={article} /></div>}
		</Entity>
	)
}
`

// A hole: an entity-DERIVED value (article.author) into a nested createComponent.
const HOLE = `
import { Entity, Field, createComponent, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
const AuthorDef = entityDef('Author')
const AuthorCard = createComponent()
	.entity('author', AuthorDef)
	.render(({ author }) => <Field field={author.name} />)
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => <div data-testid="ready"><Field field={article.title} /><AuthorCard author={article.author} /></div>}
		</Entity>
	)
}
`

// A collector-contract target inside the closure: its item callback captures the root
// relation; forms NO hole (param becomes a root at tags). Strict equality.
const CONTRACT = `
import { Entity, Field, HasMany, withCollector, itemOf, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
const TagsRepeater = withCollector(
	function TagsRepeaterRuntime(props) { return props.children ? null : null },
	{ children: itemOf('field') },
)
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => (
				<div data-testid="ready">
					<Field field={article.title} />
					<TagsRepeater field={article.tags}>{tag => <Field field={tag.name} />}</TagsRepeater>
				</div>
			)}
		</Entity>
	)
}
`

// Branch union: the runtime walk follows one branch (module const true → title); the
// compiler unions both (title + content). Assert runtime ⊆ compiled.
const BRANCH_UNION = `
import { Entity, Field, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
const FLAG = true
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => <div data-testid="ready">{FLAG ? <Field field={article.title} /> : <Field field={article.content} />}</div>}
		</Entity>
	)
}
`

// Create-mode Entity — no fetch. Assert it renders and skips the collector walk.
const CREATE_MODE = `
import { Entity, Field, entityDef, SCOPE_REF } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
let collectorCalls = 0
export const getCollectorCalls = () => collectorCalls
export function Route() {
	return (
		<Entity entity={ArticleDef} create>
			{article => {
				if (article && typeof article === 'object' && SCOPE_REF in article) collectorCalls++
				return <div data-testid="ready"><Field field={article.title} /></div>
			}}
		</Entity>
	)
}
`

// <Entity> nested inside a createComponent render body. The HOST chain collects its own
// selection (article-level) unchanged; the Entity emits its own root selection.
const NESTED_IN_COMPONENT = `
import { Entity, Field, createComponent, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
export const Host = createComponent()
	.entity('article', ArticleDef)
	.render(({ article }) => (
		<div>
			<Field field={article.title} />
			<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
				{inner => <div data-testid="ready"><Field field={inner.content} /></div>}
			</Entity>
		</div>
	))
export function Route() {
	return <Host article={{ title: 'x' }} />
}
`

// Bail: non-function children — the runtime walk stays; no attribute is injected.
const BAIL_NON_FUNCTION = `
import { Entity, Field, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			<Field field={undefined} />
		</Entity>
	)
}
`

// ── Static analysis (no runtime) ─────────────────────────────────────────────

describe('phase 3 — entity root static analysis', () => {
	test('scalar root collects the touched fields under key "entity"', () => {
		const [root] = analyzeEntityRoots(SCALARS, 'scalars.tsx')
		expect(root && !isEntityRootBailed(root)).toBe(true)
		if (root && !isEntityRootBailed(root)) {
			expect(root.selection).toEqual({ title: true, content: true })
			expect(root.holes).toHaveLength(0)
		}
	})

	test('a hole roots its source at "entity"', () => {
		const [root] = analyzeEntityRoots(HOLE, 'hole.tsx')
		expect(root && !isEntityRootBailed(root)).toBe(true)
		if (root && !isEntityRootBailed(root)) {
			expect(root.holes).toHaveLength(1)
			expect(root.holes[0]!.entityProps.author).toEqual({ source: 'entity', path: ['author'] })
		}
	})

	test('non-function children bails ENTITY_NO_FUNCTION_CHILDREN', () => {
		const [root] = analyzeEntityRoots(BAIL_NON_FUNCTION, 'bail.tsx')
		expect(root && isEntityRootBailed(root)).toBe(true)
		if (root && isEntityRootBailed(root)) {
			expect(root.bailout.code).toBe('ENTITY_NO_FUNCTION_CHILDREN')
		}
	})

	test('nested-in-component: host chain and entity root are analyzed independently', () => {
		const chains = analyzeSource(NESTED_IN_COMPONENT, 'nested.tsx')
		const roots = analyzeEntityRoots(NESTED_IN_COMPONENT, 'nested.tsx')
		// Host chain compiles and collects only its own root fields (title) — NOT the
		// Entity closure's `inner.content` (its param shadows the host root).
		expect(chains).toHaveLength(1)
		expect(isBailed(chains[0]!)).toBe(false)
		if (!isBailed(chains[0]!)) {
			expect(chains[0]!.selection.article).toEqual({ title: true })
		}
		// The Entity emit contains only paths rooted at its own closure param.
		expect(roots).toHaveLength(1)
		expect(isEntityRootBailed(roots[0]!)).toBe(false)
		if (!isEntityRootBailed(roots[0]!)) {
			expect(roots[0]!.selection).toEqual({ content: true })
		}
	})
})

// ── Emit / idempotence ───────────────────────────────────────────────────────

describe('phase 3 — plugin emit', () => {
	test('injects compiledSelection onto a proven <Entity>', () => {
		const out = transform(SCALARS)
		expect(out).toContain('compiledSelection')
		expect(out).toContain('entity:')
		expect(out).toContain('title: true')
	})

	test('a bailed <Entity> is left untouched (no attribute)', () => {
		const out = transform(BAIL_NON_FUNCTION)
		expect(out).not.toContain('compiledSelection')
	})

	test('idempotent — an already-compiled <Entity> is not double-injected', () => {
		const once = transform(SCALARS)
		const twice = transform(once)
		expect(twice.match(/compiledSelection/g)?.length).toBe(1)
	})
})

// ── Adapter-oracle equivalence ───────────────────────────────────────────────

describe('phase 3 — adapter-oracle equivalence', () => {
	test('scalar fields — collection skips children, query equals runtime', async () => {
		const compiled = await captureRootSpec(SCALARS, true)
		expect(compiled.collectorCalls).toBe(0) // children never invoked with a collector
		const fields = await expectRootEquivalent(SCALARS)
		expect(fields).toMatchObject({ title: true, content: true })
	})

	test('nested has-one', async () => {
		const fields = await expectRootEquivalent(NESTED_HAS_ONE)
		expect(fields.author).toMatchObject({ name: true })
	})

	test('compiled createComponent inside the closure (fragment merges)', async () => {
		const fields = await expectRootEquivalent(COMPILED_COMPONENT)
		expect(fields).toMatchObject({ title: true, content: true })
	})

	test('a hole (entity-derived value into a nested component)', async () => {
		const fields = await expectRootEquivalent(HOLE)
		expect(fields.author).toMatchObject({ name: true })
	})

	test('collector-contract target inside the closure', async () => {
		const fields = await expectRootEquivalent(CONTRACT)
		expect(fields.tags).toMatchObject({ name: true })
	})

	test('branch union — runtime ⊆ compiled superset', async () => {
		const [compiled, runtime] = await Promise.all([captureRootSpec(BRANCH_UNION, true), captureRootSpec(BRANCH_UNION, false)])
		// Compiler unions both branches; runtime follows the FLAG=true branch only.
		expect(compiled.fields).toMatchObject({ title: true, content: true })
		expect(runtime.fields).toMatchObject({ title: true })
		expect(runtime.fields).not.toHaveProperty('content')
	})

	test('Entity nested inside a createComponent body renders + fetches correctly', async () => {
		const fields = await expectRootEquivalent(NESTED_IN_COMPONENT)
		expect(fields).toMatchObject({ content: true })
	})

	test('create-mode Entity renders and skips the collector walk', async () => {
		const mod = await loadModule<RouteModule>(CREATE_MODE, true)
		const adapter = new RecordingMockAdapter(structuredClone(MOCK_DATA), { delay: 0 })
		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<mod.Route />
			</BindxProvider>,
		)
		await waitFor(() => {
			expect(container.querySelector('[data-testid="ready"]')).not.toBeNull()
		})
		expect(mod.getCollectorCalls?.()).toBe(0)
	})
})
