/**
 * Phase-2.1 closure lifting. A render-prop child of a hole element is dropped from the emitted
 * hole by default, but the target's staticRender may invoke it with a collector proxy during
 * collection. A child capturing nothing from render scope (own params + module bindings only) is
 * LIFTED verbatim into `extraProps` so collection proceeds oracle-equal; one capturing a render
 * value (`.use()` output, entity root) BAILS; a param-less, root-free extra prop stays safe to drop.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { transformSync } from '@babel/core'
import { analyzeSource, bindxCompilerPlugin, isBailed } from '../src/index.js'
import { runtimePlain } from './harness.js'
import * as oracleModule from './fixtures/holeClosures.js'

const DIR = import.meta.dir
const FIXTURE = join(DIR, 'fixtures', 'holeClosures.tsx')

describe('hole closure safety (fixtures/holeClosures.tsx)', () => {
	const code = readFileSync(FIXTURE, 'utf8')
	const results = analyzeSource(code, 'holeClosures.tsx')

	test('three host chains recognized (lift, bail, drop)', () => {
		expect(results.length).toBe(3)
	})

	test('#0 LiftedRenderProp compiles with the render-prop child lifted into extraProps', () => {
		const result = results[0]!
		expect(isBailed(result)).toBe(false)
		if (!isBailed(result)) {
			const hole = result.holes[0]!
			expect(hole.component).toBe('SelectField')
			expect(hole.entityProps).toEqual({ field: { source: 'article', path: ['author'] } })
			expect(Object.keys(hole.extraProps ?? {})).toEqual(['children'])
		}
	})

	test('#1 CapturingRenderProp bails FUNCTION_PROP_ON_HOLE (captures a .use() value)', () => {
		const result = results[1]!
		expect(isBailed(result)).toBe(true)
		if (isBailed(result)) {
			expect(result.bailout.code).toBe('FUNCTION_PROP_ON_HOLE')
		}
	})

	test('#2 SafeHoleClosures compiles with the AuthorSummary hole (safe props omitted)', () => {
		const result = results[2]!
		expect(isBailed(result)).toBe(false)
		if (!isBailed(result)) {
			const hole = result.holes[0]!
			expect(hole.component).toBe('AuthorSummary')
			expect(hole.entityProps).toEqual({ author: { source: 'article', path: ['author'] } })
			expect(hole.extraProps).toBeUndefined() // both function props dropped as safe
		}
	})
})

describe('hole closure lifting — plugin injection', () => {
	function transform(code: string): string {
		const out = transformSync(code, { filename: 'inline.tsx', plugins: [bindxCompilerPlugin], configFile: false, babelrc: false })
		if (!out?.code) {
			throw new Error('transform produced no output')
		}
		return out.code
	}

	// Non-capturing render-prop child — lifted verbatim into the hole.
	const LIFT = `
import { createComponent, Field, HasOne, withCollector, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
const Select = withCollector((props) => null, (props) => (
	<HasOne field={props.field}>{entity => props.children(entity)}</HasOne>
))
export const Host = createComponent().entity('article', ArticleDef).render(({ article }) => (
	<Select field={article.author}>{it => <Field field={it.name} />}</Select>
))
`

	// Render-prop child capturing a render root — cannot be lifted, chain bails.
	const BAIL = `
import { createComponent, Field, HasOne, withCollector, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
const Select = withCollector((props) => null, (props) => (
	<HasOne field={props.field}>{entity => props.children(entity)}</HasOne>
))
export const Host = createComponent().entity('article', ArticleDef).render(({ article }) => (
	<Select field={article.author}>{it => <Field field={it.name} format={() => article.title} />}</Select>
))
`

	test('lifted chain emits extraProps with the closure verbatim', () => {
		const out = transform(LIFT).replace(/\s+/g, ' ')
		expect(out).toContain('holes:')
		expect(out).toContain('extraProps:')
		expect(out).toContain('children: () => it => <Field field={it.name} />')
	})

	test('bailed capturing chain gets no injected 2nd argument (runtime fallback)', () => {
		const out = transform(BAIL)
		expect(out).not.toContain('props:')
		expect(out).not.toContain('holes:')
	})
})

// End-to-end: the COMPILED module must produce the same field tree as the ORACLE. The lifted chain
// resolves the render-prop child through SelectField's staticRender; the capturing chain bails →
// runtime proxy fallback (trivially equal); the safe chain drops its extra props.
describe('hole closure lifting — equivalence vs runtime oracle', () => {
	const tmpPath = join(DIR, 'fixtures', '.holeClosures-compiled.tsx')
	let compiled: Record<string, unknown> = {}
	const oracle = oracleModule as unknown as Record<string, unknown>

	beforeAll(async () => {
		const source = readFileSync(FIXTURE, 'utf8')
		const out = transformSync(source, { filename: 'holeClosures.tsx', plugins: [bindxCompilerPlugin], configFile: false, babelrc: false })
		if (!out?.code) {
			throw new Error('transform produced no output')
		}
		writeFileSync(tmpPath, out.code)
		compiled = (await import(tmpPath)) as Record<string, unknown>
	})

	afterAll(() => {
		rmSync(tmpPath, { force: true })
	})

	test('LiftedRenderProp — compiled (lifted closure) equals the oracle (both collect author.name)', () => {
		const reference = runtimePlain(oracle.LiftedRenderProp, 'article')
		expect(reference).toMatchObject({ author: { name: true } })
		expect(runtimePlain(compiled.LiftedRenderProp, 'article')).toEqual(reference)
	})

	test('CapturingRenderProp — bailed compiled path equals the oracle (both collect author.name)', () => {
		const reference = runtimePlain(oracle.CapturingRenderProp, 'article')
		expect(reference).toMatchObject({ author: { name: true } })
		expect(runtimePlain(compiled.CapturingRenderProp, 'article')).toEqual(reference)
	})

	test('SafeHoleClosures — compiled hole equals the oracle (both collect author.name)', () => {
		const reference = runtimePlain(oracle.SafeHoleClosures, 'article')
		expect(reference).toMatchObject({ author: { name: true } })
		expect(runtimePlain(compiled.SafeHoleClosures, 'article')).toEqual(reference)
	})
})
