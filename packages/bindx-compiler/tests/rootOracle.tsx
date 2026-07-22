/**
 * Shared adapter-oracle harness for entity-root / entityLike compilation tests. The oracle is the
 * QuerySpec the adapter receives: render the TRANSFORMED module (compiledSelection injected,
 * children never walked with a collector) and the UNTRANSFORMED one (runtime children walk) under
 * a query-recording MockAdapter, and compare the requested root selection.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator'
if (typeof document === 'undefined') {
	GlobalRegistrator.register()
}

import { transformSync } from '@babel/core'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'bun:test'
import React from 'react'
import { render, waitFor } from '@testing-library/react'
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
import { bindxCompilerPlugin, type BindxCompilerOptions } from '../src/index.js'

interface Schema {
	Article: { id: string; title: string; content: string; author: { id: string; name: string } | null; tags: { id: string; name: string }[] }
	Author: { id: string; name: string }
	Tag: { id: string; name: string }
}

export const schema = defineSchema<Schema>({
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
export class RecordingMockAdapter extends MockAdapter {
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

const tmpFiles: string[] = []
let counter = 0

export function transform(source: string, dir: string, options?: BindxCompilerOptions): string {
	const plugin = options ? [bindxCompilerPlugin, options] : bindxCompilerPlugin
	const out = transformSync(source, { filename: join(dir, 'route.tsx'), plugins: [plugin], configFile: false, babelrc: false })
	if (!out?.code) {
		throw new Error('transform produced no output')
	}
	return out.code
}

export interface RouteModule {
	readonly Route: React.ComponentType
	readonly getCollectorCalls?: () => number
}

async function loadModule<T>(source: string, dir: string, compiled: boolean, options?: BindxCompilerOptions): Promise<T> {
	const code = compiled ? transform(source, dir, options) : source
	const path = join(dir, `.tk-${counter++}.tsx`)
	writeFileSync(path, code)
	tmpFiles.push(path)
	return import(path) as Promise<T>
}

export interface RootSpec {
	readonly fields: Record<string, unknown>
	readonly collectorCalls: number
}

/** Render a fixture's <Route> under a recording adapter; return the Article root spec. */
export async function captureRootSpec(source: string, dir: string, compiled: boolean, options?: BindxCompilerOptions): Promise<RootSpec> {
	const mod = await loadModule<RouteModule>(source, dir, compiled, options)
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

/** Assert transformed and untransformed request the same root selection; return that selection. */
export async function expectRootEquivalent(source: string, dir: string, options?: BindxCompilerOptions): Promise<Record<string, unknown>> {
	const [compiled, runtime] = await Promise.all([
		captureRootSpec(source, dir, true, options),
		captureRootSpec(source, dir, false, options),
	])
	expect(compiled.fields).toEqual(runtime.fields)
	return compiled.fields
}

export function cleanupTmpFiles(): void {
	for (const file of tmpFiles) {
		rmSync(file, { force: true })
	}
	tmpFiles.length = 0
}
