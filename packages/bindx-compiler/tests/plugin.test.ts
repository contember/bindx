import { describe, expect, test } from 'bun:test'
import { transformSync } from '@babel/core'
import { analyzeSource, bindxCompilerPlugin, isBailed } from '../src/index.js'

function transform(code: string): string {
	const out = transformSync(code, {
		filename: 'input.tsx',
		plugins: [bindxCompilerPlugin],
		configFile: false,
		babelrc: false,
		retainLines: true,
	})
	if (!out?.code) {
		throw new Error('transform produced no output')
	}
	return out.code
}

const SOURCE = `
import { createComponent, Field, HasOne, HasMany } from '@contember/bindx-react'
import { schema } from './s'
export const Card = createComponent()
  .entity('article', schema.Article)
  .render(({ article }) => (
    <div>
      <Field field={article.title} />
      <HasOne field={article.author}>{a => <Field field={a.name} />}</HasOne>
      <HasMany field={article.tags} limit={5}>{tag => <Field field={tag.name} />}</HasMany>
    </div>
  ))
`

describe('babel plugin injection', () => {
	test('injects the CompiledSelection (v2 { props }) as the 2nd argument of .render()', () => {
		const output = transform(SOURCE)
		// The emitted literal is the render call's 2nd argument, now wrapped in `props`.
		// Version marker first — the runtime rejects any literal without `v: 2`.
		expect(output).toContain('v: 2')
		expect(output).toContain('props:')
		expect(output).toContain('title: true')
		expect(output).toContain('author: {')
		expect(output).toContain('fields: {')
		expect(output).toContain('many: true')
		expect(output).toContain('params: {')
		expect(output).toContain('limit: 5')
		// This chain has no holes → the holes key is omitted.
		expect(output).not.toContain('holes:')
	})

	test('bailed chains are left untouched (no 2nd argument)', () => {
		const bailSource = `
import { createComponent, Field } from '@contember/bindx-react'
import { schema } from './s'
export const C = createComponent()
  .entity('article', schema.Article)
  .render(({ article }) => <div {...article}><Field field={article.title} /></div>)
`
		const output = transform(bailSource)
		// No static object was injected — the spread bails the whole chain.
		expect(output).not.toContain('props:')
		expect(output).not.toContain('title: true')
	})

	test('re-running the plugin does not double-inject', () => {
		const once = transform(SOURCE)
		const twice = transform(once)
		const count = (s: string): number => s.split('title: true').length - 1
		expect(count(twice)).toBe(count(once))
	})

	test('a hand-written 2nd argument to .render() is preserved and not injected over', () => {
		const handWritten = `
import { createComponent, Field } from '@contember/bindx-react'
import { schema } from './s'
export const C = createComponent()
  .entity('article', schema.Article)
  .render(({ article }) => <Field field={article.title} />, { handWritten: true })
`
		const output = transform(handWritten)
		// A present 2nd arg (arguments.length >= 2) suppresses injection — the hand value stands, no v:2 literal.
		expect(output).toContain('handWritten: true')
		expect(output).not.toContain('v: 2')
	})

	test('.render() with a non-inline-function argument bails EXPLICIT_RENDER_FN (no injection)', () => {
		const src = `
import { createComponent, Field } from '@contember/bindx-react'
import { schema } from './s'
const renderFn = ({ article }) => <Field field={article.title} />
export const C = createComponent().entity('article', schema.Article).render(renderFn)
`
		const [result] = analyzeSource(src, 'input.tsx')
		expect(result && isBailed(result)).toBe(true)
		if (result && isBailed(result)) {
			expect(result.bailout.code).toBe('EXPLICIT_RENDER_FN')
		}
		expect(transform(src)).not.toContain('v: 2')
	})
})
