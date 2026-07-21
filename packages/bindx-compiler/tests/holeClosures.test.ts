/**
 * Phase-2 under-fetch guard (FUNCTION_PROP_ON_HOLE). A function prop / render-prop child of
 * a hole element is dropped from the emitted hole, but the target's staticRender may invoke
 * it with a collector proxy during collection. Unsafe closures (own params / captured roots)
 * must bail the chain; param-less, root-free closures stay safe to omit and keep compiling.
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

	test('two host chains: unsafe render-prop bails, safe closures compile', () => {
		expect(results.length).toBe(2)
	})

	test('#0 UnsafeRenderProp bails FUNCTION_PROP_ON_HOLE', () => {
		const result = results[0]!
		expect(isBailed(result)).toBe(true)
		if (isBailed(result)) {
			expect(result.bailout.code).toBe('FUNCTION_PROP_ON_HOLE')
		}
	})

	test('#1 SafeHoleClosures compiles with the AuthorSummary hole (safe props omitted)', () => {
		const result = results[1]!
		expect(isBailed(result)).toBe(false)
		if (!isBailed(result)) {
			expect(result.holes).toEqual([
				{ component: 'AuthorSummary', entityProps: { author: { source: 'article', path: ['author'] } }, literalProps: undefined },
			])
		}
	})
})

describe('hole closure safety — plugin injection', () => {
	function transform(code: string): string {
		const out = transformSync(code, { filename: 'inline.tsx', plugins: [bindxCompilerPlugin], configFile: false, babelrc: false })
		if (!out?.code) {
			throw new Error('transform produced no output')
		}
		return out.code
	}

	// Isolated unsafe chain — mirrors the SelectField render-prop shape.
	const UNSAFE = `
import { createComponent, Field, HasOne, withCollector, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
const Select = withCollector((props) => null, (props) => (
	<HasOne field={props.field}>{entity => props.children(entity)}</HasOne>
))
export const Host = createComponent().entity('article', ArticleDef).render(({ article }) => (
	<Select field={article.author}>{it => <Field field={it.name} />}</Select>
))
`

	test('bailed unsafe chain gets no injected 2nd argument (runtime fallback)', () => {
		const out = transform(UNSAFE)
		expect(out).not.toContain('props:')
		expect(out).not.toContain('holes:')
	})
})

// End-to-end: the COMPILED module must produce the same field tree as the ORACLE. The unsafe
// chain bails → no injection → runtime proxy fallback (trivially equal). The safe chain compiles
// with the hole, resolved through AuthorSummary's staticRender → author.name.
describe('hole closure safety — equivalence vs runtime oracle', () => {
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

	test('UnsafeRenderProp — bailed compiled path equals the oracle (both collect author.name)', () => {
		const reference = runtimePlain(oracle.UnsafeRenderProp, 'article')
		expect(reference).toMatchObject({ author: { name: true } })
		expect(runtimePlain(compiled.UnsafeRenderProp, 'article')).toEqual(reference)
	})

	test('SafeHoleClosures — compiled hole equals the oracle (both collect author.name)', () => {
		const reference = runtimePlain(oracle.SafeHoleClosures, 'article')
		expect(reference).toMatchObject({ author: { name: true } })
		expect(runtimePlain(compiled.SafeHoleClosures, 'article')).toEqual(reference)
	})
})
