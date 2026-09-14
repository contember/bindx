/**
 * End-to-end: Babel plugin → A's `.render(fn, static)` runtime. Transforms a real
 * createComponent source, loads the transformed module, and proves the static path:
 * (a) the render fn is NOT executed during collection, (b) the field data renders
 * under <Entity> via MockAdapter, (c) validate mode raises no warning.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator'
// Register happy-dom when this file runs standalone (package-local `bun test`);
// the root bunfig preload already registers it for `bun test packages/…`.
if (typeof document === 'undefined') {
	GlobalRegistrator.register()
}

import { afterAll, afterEach, describe, expect, test, spyOn } from 'bun:test'
import { transformSync } from '@babel/core'
import { writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { cleanup, render, waitFor } from '@testing-library/react'
import {
	BindxProvider,
	MockAdapter,
	Entity,
	defineSchema,
	scalar,
	hasOne,
	entityDef,
	setStaticSelectionValidation,
} from '@contember/bindx-react'
import { bindxCompilerPlugin } from '../src/index.js'

interface FixtureModule {
	readonly Card: unknown
	readonly getRenderCalls: () => number
}

interface HoleFixtureModule {
	readonly Host: unknown
	readonly getHostRenderCalls: () => number
}

// A createComponent used implicitly: the render fn increments a module-level
// counter so we can observe whether the proxy pass executed it.
const SOURCE = `
import { createComponent, Field, entityDef } from '@contember/bindx-react'

let renderCalls = 0
export const getRenderCalls = () => renderCalls

const ArticleDef = entityDef('Article')

export const Card = createComponent()
	.entity('article', ArticleDef)
	.render(({ article }) => {
		renderCalls++
		return <span data-testid="title"><Field field={article.title} /></span>
	})
`

const TMP_DIR = import.meta.dir
const tmpFiles: string[] = []
let counter = 0

/** Transform with the plugin, write to a fresh temp module, and import it. */
async function loadTransformed<T>(source: string): Promise<T> {
	const out = transformSync(source, {
		filename: 'card.tsx',
		plugins: [bindxCompilerPlugin],
		configFile: false,
		babelrc: false,
	})
	if (!out?.code) {
		throw new Error('transform produced no output')
	}
	const path = join(TMP_DIR, `.e2e-${counter++}.tsx`)
	writeFileSync(path, out.code)
	tmpFiles.push(path)
	return import(path) as Promise<T>
}

interface Schema {
	Article: { id: string; title: string; author: { id: string; name: string } }
	Author: { id: string; name: string }
}
const schema = defineSchema<Schema>({
	entities: {
		Article: { fields: { id: scalar(), title: scalar(), author: hasOne('Author') } },
		Author: { fields: { id: scalar(), name: scalar() } },
	},
})
const articleDef = entityDef<Schema['Article']>('Article')

afterEach(() => {
	cleanup()
	setStaticSelectionValidation(false)
})
afterAll(() => {
	for (const file of tmpFiles) {
		rmSync(file, { force: true })
	}
})

describe('end-to-end: transformed module runs the static path', () => {
	test('the plugin injects a static selection (sanity)', () => {
		const out = transformSync(SOURCE, {
			filename: 'card.tsx',
			plugins: [bindxCompilerPlugin],
			configFile: false,
			babelrc: false,
		})
		// v2 shape: the injected literal wraps the props map in `props`.
		expect(out?.code).toContain('props:')
		expect(out?.code).toContain('title: true')
	})

	test('collection skips the render fn, then <Entity> fetches and renders the field', async () => {
		const mod = await loadTransformed<FixtureModule>(SOURCE)

		// Trigger static collection via the fragment getter — the proxy pass would
		// have executed the render fn; the injected static selection must not.
		void (mod.Card as Record<string, unknown>).$article
		expect(mod.getRenderCalls()).toBe(0)

		const adapter = new MockAdapter(
			{ Article: { 'article-1': { id: 'article-1', title: 'Hello World' } } },
			{ delay: 0 },
		)
		const Card = mod.Card as React.ComponentType<{ article: unknown }>
		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Entity entity={articleDef} by={{ id: 'article-1' }}>
					{article => <Card article={article} />}
				</Entity>
			</BindxProvider>,
		)

		await waitFor(() => {
			expect(container.querySelector('[data-testid="title"]')?.textContent).toBe('Hello World')
		})
		// The real render did run the fn; only collection skipped it.
		expect(mod.getRenderCalls()).toBeGreaterThan(0)
	})

	test('validate mode raises no warning for the transformed component', async () => {
		setStaticSelectionValidation(true)
		const warn = spyOn(console, 'warn').mockImplementation(() => {})

		const mod = await loadTransformed<FixtureModule>(SOURCE)
		// Collection now also runs the proxy pass and diffs — must agree.
		void (mod.Card as Record<string, unknown>).$article

		expect(warn).not.toHaveBeenCalled()
		warn.mockRestore()
	})
})

// A host whose render passes an entity-derived value (`article.author`) to a nested
// createComponent target. The compiler emits a hole; runtime resolution must fetch the
// target's field WITHOUT executing the host render fn during collection.
const SOURCE_HOLE = `
import { createComponent, Field, entityDef } from '@contember/bindx-react'

let hostRenderCalls = 0
export const getHostRenderCalls = () => hostRenderCalls

const ArticleDef = entityDef('Article')
const AuthorDef = entityDef('Author')

const AuthorName = createComponent()
	.entity('author', AuthorDef)
	.render(({ author }) => <span data-testid="author"><Field field={author.name} /></span>)

export const Host = createComponent()
	.entity('article', ArticleDef)
	.render(({ article }) => {
		hostRenderCalls++
		return <div data-testid="host"><AuthorName author={article.author} /></div>
	})
`

describe('end-to-end: transformed module resolves a hole', () => {
	test('collection skips the host render fn, then the nested target field fetches and renders', async () => {
		const mod = await loadTransformed<HoleFixtureModule>(SOURCE_HOLE)

		// (a) Static collection resolves the hole via AuthorName's selection surface —
		// the host render fn must not run (proxy pass would have incremented the counter).
		void (mod.Host as Record<string, unknown>).$article
		expect(mod.getHostRenderCalls()).toBe(0)

		const adapter = new MockAdapter(
			{
				Article: { 'article-1': { id: 'article-1', title: 'Hello World', author: { id: 'author-1', name: 'John' } } },
				Author: { 'author-1': { id: 'author-1', name: 'John' } },
			},
			{ delay: 0 },
		)
		const Host = mod.Host as React.ComponentType<{ article: unknown }>
		const { container } = render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Entity entity={articleDef} by={{ id: 'article-1' }}>
					{article => <Host article={article} />}
				</Entity>
			</BindxProvider>,
		)

		// (b) The hole put author.name into the fetch plan, so the nested field renders.
		await waitFor(() => {
			expect(container.querySelector('[data-testid="author"]')?.textContent).toBe('John')
		})
		expect(mod.getHostRenderCalls()).toBeGreaterThan(0)
	})

	test('validate mode raises no warning for the hole-carrying component', async () => {
		setStaticSelectionValidation(true)
		const warn = spyOn(console, 'warn').mockImplementation(() => {})

		const mod = await loadTransformed<HoleFixtureModule>(SOURCE_HOLE)
		// The diff of compiled-vs-proxy selection must agree; createComponent target is
		// not a blind spot, so no blind-spot warn either.
		void (mod.Host as Record<string, unknown>).$article

		expect(warn).not.toHaveBeenCalled()
		warn.mockRestore()
	})
})
