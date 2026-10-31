import { describe, expect, test } from 'bun:test'
import { analyzeSource, isBailed, type BailoutReason } from '../src/index.js'
import { analyzeFixture } from './harness.js'

const DIR = import.meta.dir

function analyze(code: string) {
	return analyzeSource(code, 'inline.tsx')
}

function selectionOf(code: string): Record<string, unknown> {
	const result = analyze(code)[0]!
	if (isBailed(result)) {
		throw new Error(`unexpected bail: ${result.bailout.code}`)
	}
	return result.selection
}

const PRELUDE = `import { createComponent, Field, HasMany, HasOne } from '@contember/bindx-react'\nimport { schema } from './s'\n`

describe('StaticSelection emission (raw, not normalized)', () => {
	test('has-many literal params + many flag are emitted', () => {
		const results = analyzeFixture(DIR, 'hasManyParams.tsx')
		const result = results[0]!
		expect(isBailed(result)).toBe(false)
		if (isBailed(result)) {
			return
		}
		expect(result.selection).toEqual({
			article: {
				tags: {
					fields: { id: true, name: true, color: true },
					many: true,
					params: { limit: 5, offset: 2, orderBy: { name: 'asc' }, totalCount: true },
				},
			},
		})
	})

	test('scalar leaf is `true`, has-one relation nests with id', () => {
		const selection = selectionOf(
			`${PRELUDE}export const C = createComponent().entity('article', schema.Article)`
			+ `.render(({ article }) => <div><Field field={article.title} />`
			+ `<HasOne field={article.author}>{a => <Field field={a.name} />}</HasOne></div>)`,
		)
		expect(selection).toEqual({
			article: { title: true, author: { fields: { id: true, name: true } } },
		})
	})

	test('.map() marks the relation many without params', () => {
		const selection = selectionOf(
			`${PRELUDE}export const C = createComponent().entity('article', schema.Article)`
			+ `.render(({ article }) => <ul>{article.tags.map(tag => <Field field={tag.name} />)}</ul>)`,
		)
		expect(selection).toEqual({ article: { tags: { fields: { id: true, name: true }, many: true } } })
	})

	test('entity props with no field access emit no selection entry', () => {
		const selection = selectionOf(
			`${PRELUDE}export const C = createComponent().entity('article', schema.Article)`
			+ `.render(() => <div>static</div>)`,
		)
		expect(selection).toEqual({})
	})
})

describe('bail triggers (direct)', () => {
	const bail = (body: string): BailoutReason | null => {
		const result = analyze(
			`${PRELUDE}export const C = createComponent().entity('article', schema.Article).render(${body})`,
		)[0]!
		return isBailed(result) ? result.bailout.code : null
	}

	test('unrecognized call receiving an entity value', () => {
		expect(bail(`({ article }) => <span>{fn(article.author)}</span>`)).toBe('ENTITY_ESCAPES_TO_CALL')
	})

	test('method call on an entity value', () => {
		expect(bail(`({ article }) => <span>{article.tags.filter(Boolean)}</span>`)).toBe('ENTITY_ESCAPES_TO_CALL')
	})

	test('spread of an entity root', () => {
		expect(bail(`({ article }) => <div {...article} />`)).toBe('ENTITY_SPREAD')
	})

	test('computed member off a root', () => {
		expect(bail(`({ article }) => <Field field={article[key]} />`)).toBe('COMPUTED_MEMBER')
	})

	test('non-literal HasMany param', () => {
		expect(bail(`({ article }) => <HasMany field={article.tags} limit={n}>{t => <Field field={t.name} />}</HasMany>`))
			.toBe('NON_LITERAL_HASMANY_PARAM')
	})
})

describe('non-chains are ignored', () => {
	test('a plain createComponent-like call that is not imported is skipped', () => {
		const results = analyze(`const createComponent = () => ({});\nconst x = createComponent().render(() => null)`)
		expect(results).toHaveLength(0)
	})
})
