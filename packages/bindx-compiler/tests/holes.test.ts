/**
 * Phase-2 hole analysis + emit. Asserts the analyzer's `holes` metadata (component name,
 * entityProps source/path, literalProps) and the Babel plugin's thunk emission. Full
 * end-to-end equivalence (compiled fields + resolved holes vs runtime oracle) is
 * integration-gated — see the skipped block at the bottom.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { transformSync } from '@babel/core'
import { analyzeSource, bindxCompilerPlugin, isBailed, type AnalyzedChain, type BailoutReason } from '../src/index.js'
import { runtimePlain } from './harness.js'
import * as oracleModule from './fixtures/holes.js'

const DIR = import.meta.dir
const PRELUDE = `import { createComponent, Field, HasOne } from '@contember/bindx-react'\n`
	+ `import { schema } from './s'\n`
	+ `const Card = (p: any) => null\n`

function analyzed(code: string): AnalyzedChain {
	const result = analyzeSource(code, 'inline.tsx')[0]!
	if (isBailed(result)) {
		throw new Error(`unexpected bail: ${result.bailout.code}`)
	}
	return result
}

function bailCode(code: string): BailoutReason | null {
	const result = analyzeSource(code, 'inline.tsx')[0]!
	return isBailed(result) ? result.bailout.code : null
}

function chain(body: string): string {
	return `${PRELUDE}export const C = createComponent().entity('article', schema.Article).render(${body})`
}

describe('hole analyzer (fixtures/holes.tsx)', () => {
	const code = readFileSync(join(DIR, 'fixtures', 'holes.tsx'), 'utf8')
	const results = analyzeSource(code, 'holes.tsx')

	function chainAt(index: number): AnalyzedChain {
		const result = results[index]!
		if (isBailed(result)) {
			throw new Error(`chain #${index} unexpectedly bailed: ${result.bailout.code}`)
		}
		return result
	}

	function holesAt(index: number): AnalyzedChain['holes'] {
		return chainAt(index).holes
	}

	test('all 8 host chains are recognized and compiled', () => {
		expect(results.length).toBe(8)
		expect(results.every(r => !isBailed(r))).toBe(true)
	})

	test('#0 createComponent target — one hole, author = article.author', () => {
		expect(holesAt(0)).toEqual([
			{ component: 'AuthorCard', entityProps: { author: { source: 'article', path: ['author'] } }, literalProps: undefined },
		])
	})

	test('#1 withCollector target', () => {
		expect(holesAt(1)[0]?.component).toBe('AuthorBadge')
	})

	test('#2 plain target with sibling — hole present AND sibling <Field> still collected', () => {
		const result = chainAt(2)
		expect(result.selection).toEqual({ article: { title: true } })
		expect(result.holes[0]).toEqual({
			component: 'PlainAuthor',
			entityProps: { author: { source: 'article', path: ['author'] } },
			literalProps: undefined,
		})
	})

	test('#3 plain target without sibling — no field selection, hole present', () => {
		const result = chainAt(3)
		expect(result.selection).toEqual({})
		expect(result.holes[0]?.component).toBe('PlainAuthor')
	})

	test('#4 multiple entity props on one element → one merged hole', () => {
		expect(holesAt(4)).toEqual([
			{
				component: 'Panel',
				entityProps: {
					primary: { source: 'article', path: ['author'] },
					secondary: { source: 'article', path: [] },
				},
				literalProps: undefined,
			},
		])
	})

	test('#5 entity value through a HasOne callback — absPath preserved as [author]', () => {
		expect(holesAt(5)[0]?.entityProps).toEqual({ author: { source: 'article', path: ['author'] } })
	})

	test('#6 literal props kept; module-scope identifier props lifted into extraProps', () => {
		const hole = holesAt(6)[0]!
		expect(hole.entityProps).toEqual({ author: { source: 'article', path: ['author'] } })
		expect(hole.literalProps).toEqual({ label: 'hi', count: 5, obj: { a: 1 } })
		// `cb={handler}` and `dyn={someVar}` are module-scope bindings → lifted (real value reaches target).
		expect(Object.keys(hole.extraProps ?? {}).sort()).toEqual(['cb', 'dyn'])
	})

	test('#7 target defined later in the module still forms a hole', () => {
		expect(holesAt(7)[0]?.component).toBe('LaterPanel')
	})
})

describe('hole analyzer (inline edge cases)', () => {
	test('root itself passed as prop → empty path', () => {
		expect(analyzed(chain(`({ article }) => <Card data={article} />`)).holes).toEqual([
			{ component: 'Card', entityProps: { data: { source: 'article', path: [] } }, literalProps: undefined },
		])
	})

	test('same-element bindx component (<HasOne>) is NOT a hole', () => {
		const result = analyzed(chain(`({ article }) => <HasOne field={article.author}>{a => <Field field={a.name} />}</HasOne>`))
		expect(result.holes).toEqual([])
		expect(result.selection).toEqual({ article: { author: { fields: { id: true, name: true } } } })
	})

	test('unresolved component tag with an entity prop bails ENTITY_ESCAPES_TO_COMPONENT', () => {
		// `Undeclared` is referenced but never imported/declared at module scope.
		const code = `${PRELUDE}export const C = createComponent().entity('article', schema.Article)`
			+ `.render(({ article }) => <Undeclared data={article.author} />)`
		expect(bailCode(code)).toBe('ENTITY_ESCAPES_TO_COMPONENT')
	})

	test('non-path expression prop bails ENTITY_IN_EXPRESSION_PROP', () => {
		expect(bailCode(chain(`({ article }) => <Card data={String(article.author)} />`))).toBe('ENTITY_IN_EXPRESSION_PROP')
	})

	test('member-expression tag with an entity prop bails MEMBER_COMPONENT_TAG', () => {
		const code = `${PRELUDE}const Ns = { Card }\nexport const C = createComponent().entity('article', schema.Article)`
			+ `.render(({ article }) => <Ns.Card data={article.author} />)`
		expect(bailCode(code)).toBe('MEMBER_COMPONENT_TAG')
	})

	test('component without entity props is not a hole (children still analyzed)', () => {
		const result = analyzed(chain(`({ article }) => <Card><Field field={article.title} /></Card>`))
		expect(result.holes).toEqual([])
		expect(result.selection).toEqual({ article: { title: true } })
	})
})

describe('hole emit (Babel plugin thunk)', () => {
	function transform(code: string): string {
		const out = transformSync(code, { filename: 'inline.tsx', plugins: [bindxCompilerPlugin], configFile: false, babelrc: false })
		if (!out?.code) {
			throw new Error('transform produced no output')
		}
		return out.code
	}

	test('emits { props, holes } with a component thunk and entityProps', () => {
		const out = transform(chain(`({ article }) => <Card author={article.author} label="hi" />`))
		expect(out).toContain('props:')
		expect(out).toContain('holes:')
		expect(out.replace(/\s+/g, ' ')).toContain('component: () => Card')
		expect(out).toContain('entityProps:')
		expect(out).toContain('source: "article"')
		expect(out).toContain('literalProps:')
		expect(out).toContain('label: "hi"')
	})

	test('thunk references a later-defined identifier verbatim (TDZ dodge)', () => {
		const code = `${PRELUDE.replace('const Card = (p: any) => null\n', '')}`
			+ `export const C = createComponent().entity('article', schema.Article).render(({ article }) => <Later author={article.author} />)\n`
			+ `const Later = (p: any) => null\n`
		const out = transform(code)
		expect(out.replace(/\s+/g, ' ')).toContain('component: () => Later')
	})

	test('no holes → holes key omitted, props always present', () => {
		const out = transform(chain(`({ article }) => <Field field={article.title} />`))
		expect(out).toContain('props:')
		expect(out).not.toContain('holes:')
	})
})

// Full end-to-end equivalence: the COMPILED path (Babel plugin → v2 runtime, holes
// resolved by applyCompiledSelection) must produce the same field tree as the ORACLE
// (untransformed module, runtime proxy pass resolves nested targets). Both sides replay
// `article.author` gets on collector proxies, so equality holds by construction —
// createComponent/withCollector targets resolve, plain targets are blind on both sides.
describe('hole equivalence vs runtime oracle', () => {
	// Fixture exports in source order (all use the `article` implicit prop).
	const EXPORTS = [
		'ToCreateComponent',
		'ToWithCollector',
		'ToPlainWithSibling',
		'ToPlainNoSibling',
		'MultipleEntityProps',
		'DerivedPathViaCallback',
		'LiteralAndNonLiteralProps',
		'ToLaterDefined',
	] as const

	// Compiled temp module lives beside the fixture so its `./_targets`/`./_schema`
	// relative imports resolve to the same singletons the oracle uses.
	const tmpPath = join(DIR, 'fixtures', '.holes-compiled.tsx')
	let compiledModule: Record<string, unknown> = {}
	const oracle = oracleModule as unknown as Record<string, unknown>

	beforeAll(async () => {
		const source = readFileSync(join(DIR, 'fixtures', 'holes.tsx'), 'utf8')
		const out = transformSync(source, { filename: 'holes.tsx', plugins: [bindxCompilerPlugin], configFile: false, babelrc: false })
		if (!out?.code) {
			throw new Error('transform produced no output')
		}
		writeFileSync(tmpPath, out.code)
		compiledModule = (await import(tmpPath)) as Record<string, unknown>
	})

	afterAll(() => {
		rmSync(tmpPath, { force: true })
	})

	// Sanity: the meaningful targets must actually collect through the hole, otherwise
	// the equality checks below could pass trivially with both sides empty.
	test('createComponent target collects author.name through the hole', () => {
		expect(runtimePlain(oracle.ToCreateComponent, 'article')).toMatchObject({ author: { name: true } })
		expect(runtimePlain(compiledModule.ToCreateComponent, 'article')).toMatchObject({ author: { name: true } })
	})

	test('withCollector target collects author.name through the hole', () => {
		expect(runtimePlain(compiledModule.ToWithCollector, 'article')).toMatchObject({ author: { name: true } })
	})

	test('plain target with a sibling <Field> keeps the sibling selection; blind target still touches author', () => {
		// PlainAuthor never reads a field, but the bare `article.author` get registers a
		// touched leaf on BOTH sides — the sibling <Field> adds title. Symmetric over-fetch.
		expect(runtimePlain(compiledModule.ToPlainWithSibling, 'article')).toEqual({ author: true, title: true })
		expect(runtimePlain(oracle.ToPlainWithSibling, 'article')).toEqual({ author: true, title: true })
	})

	for (const name of EXPORTS) {
		test(`${name} — compiled field tree equals the runtime oracle`, () => {
			const compiled = runtimePlain(compiledModule[name], 'article')
			const reference = runtimePlain(oracle[name], 'article')
			expect(compiled).toEqual(reference)
		})
	}
})
