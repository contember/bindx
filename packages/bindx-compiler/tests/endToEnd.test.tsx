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
	entityDef,
	setStaticSelectionValidation,
} from '@contember/bindx-react'
import { bindxCompilerPlugin } from '../src/index.js'

interface FixtureModule {
	readonly Card: unknown
	readonly getRenderCalls: () => number
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
async function loadTransformed(source: string): Promise<FixtureModule> {
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
	return import(path) as Promise<FixtureModule>
}

interface Schema {
	Article: { id: string; title: string }
}
const schema = defineSchema<Schema>({
	entities: { Article: { fields: { id: scalar(), title: scalar() } } },
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
		expect(out?.code).toContain('title: true')
	})

	test('collection skips the render fn, then <Entity> fetches and renders the field', async () => {
		const mod = await loadTransformed(SOURCE)

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

		const mod = await loadTransformed(SOURCE)
		// Collection now also runs the proxy pass and diffs — must agree.
		void (mod.Card as Record<string, unknown>).$article

		expect(warn).not.toHaveBeenCalled()
		warn.mockRestore()
	})
})
