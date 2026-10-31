/**
 * Prod hardening: crash containment (#1), diagnostics reporting (#2), and Entity literal
 * hoisting (#4). Analysis contains an unexpected (non-BailError) crash as an INTERNAL_ERROR bail;
 * the plugin degrades that unit to "no injection" (proxy fallback is sound) and always warns.
 */
import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { transformSync } from '@babel/core'
import { analyzeSource, bindxCompilerPlugin, isBailed } from '../src/index.js'
import { BodyAnalyzer } from '../src/body.js'
import type { PluginItem } from '@babel/core'

function transform(code: string, options: Record<string, unknown> = {}): string {
	const plugin: PluginItem = [bindxCompilerPlugin, options]
	const out = transformSync(code, { filename: 'input.tsx', plugins: [plugin], configFile: false, babelrc: false, retainLines: true })
	if (!out?.code) {
		throw new Error('transform produced no output')
	}
	return out.code
}

// Two chains: `ok` compiles, `crash` will be forced to throw a non-BailError during analysis.
const TWO_CHAINS = `
import { createComponent, Field } from '@contember/bindx-react'
import { schema } from './s'
export const Ok = createComponent().entity('ok', schema.Article).render(({ ok }) => <Field field={ok.title} />)
export const Bad = createComponent().entity('crash', schema.Article).render(({ crash }) => <Field field={crash.title} />)
`

// One compiled chain + one spread bail (ENTITY_SPREAD at line 5) — deterministic diagnostics input.
const COMPILE_AND_BAIL = `
import { createComponent, Field } from '@contember/bindx-react'
import { schema } from './s'
export const Ok = createComponent().entity('article', schema.Article).render(({ article }) => <Field field={article.title} />)
export const Bad = createComponent().entity('article', schema.Article).render(({ article }) => <div {...article}><Field field={article.title} /></div>)
`

const ENTITY_ROOT = `
import { Entity, Field, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
export function Route() {
	return <Entity entity={ArticleDef} by={{ id: '1' }}>{article => <div><Field field={article.title} /></div>}</Entity>
}
`

afterEach(() => {
	// bun restores spies via mockRestore in each test; nothing global to reset here.
})

describe('#1 crash containment', () => {
	test('analysis wrapper converts a non-BailError into an INTERNAL_ERROR bail (never throws)', () => {
		const spy = spyOn(BodyAnalyzer.prototype, 'analyzeFunction').mockImplementation(() => {
			throw new Error('boom')
		})
		try {
			const results = analyzeSource(TWO_CHAINS, 'input.tsx')
			expect(results).toHaveLength(2)
			for (const result of results) {
				expect(isBailed(result)).toBe(true)
				if (isBailed(result)) {
					expect(result.bailout.code).toBe('INTERNAL_ERROR')
					expect(result.bailout.message).toBe('boom')
				}
			}
		} finally {
			spy.mockRestore()
		}
	})

	test('plugin contains a per-chain crash: build succeeds, other chains still compile', () => {
		const original = BodyAnalyzer.prototype.analyzeFunction
		// Throw only for the `crash` chain (its propRoots is keyed by the entity prop name).
		const spy = spyOn(BodyAnalyzer.prototype, 'analyzeFunction').mockImplementation(function (this: BodyAnalyzer, fn, propRoots) {
			if (propRoots.has('crash')) {
				throw new Error('boom')
			}
			return original.call(this, fn, propRoots)
		})
		const warn = spyOn(console, 'warn').mockImplementation(() => {})
		try {
			const output = transform(TWO_CHAINS)
			// The `ok` chain compiled (v2 literal injected); the `crash` chain got no injection.
			expect(output).toContain('v: 2')
			expect(output).toContain('ok: {')
			expect(output).not.toContain('crash: {')
			// INTERNAL_ERROR always warns (default diagnostics 'off') with file + loc + message.
			expect(warn).toHaveBeenCalledTimes(1)
			expect(warn.mock.calls[0]?.[0]).toContain('INTERNAL_ERROR')
			expect(warn.mock.calls[0]?.[0]).toContain('input.tsx')
			expect(warn.mock.calls[0]?.[0]).toContain('boom')
		} finally {
			spy.mockRestore()
			warn.mockRestore()
		}
	})
})

describe('#2 diagnostics option', () => {
	test('default off prints nothing', () => {
		const info = spyOn(console, 'info').mockImplementation(() => {})
		try {
			transform(COMPILE_AND_BAIL)
			expect(info).not.toHaveBeenCalled()
		} finally {
			info.mockRestore()
		}
	})

	test('verbose prints one BAIL line per bail plus a compiled count', () => {
		const info = spyOn(console, 'info').mockImplementation(() => {})
		try {
			transform(COMPILE_AND_BAIL, { diagnostics: 'verbose' })
			const lines = info.mock.calls.map(c => String(c[0]))
			expect(lines).toContain('[bindx-compiler] input.tsx:5 BAIL ENTITY_SPREAD')
			expect(lines).toContain('[bindx-compiler] input.tsx: 1 compiled, 1 bailed')
		} finally {
			info.mockRestore()
		}
	})

	test('summary prints one file line only when the file has a bail', () => {
		const info = spyOn(console, 'info').mockImplementation(() => {})
		try {
			transform(COMPILE_AND_BAIL, { diagnostics: 'summary' })
			const lines = info.mock.calls.map(c => String(c[0]))
			expect(lines).toEqual(['[bindx-compiler] input.tsx: 1 compiled, 1 bailed (ENTITY_SPREAD)'])
		} finally {
			info.mockRestore()
		}
	})

	test('summary stays silent for an all-compiled file', () => {
		const info = spyOn(console, 'info').mockImplementation(() => {})
		try {
			transform(ENTITY_ROOT, { diagnostics: 'summary' })
			expect(info).not.toHaveBeenCalled()
		} finally {
			info.mockRestore()
		}
	})
})

describe('#4 entity literal hoisting', () => {
	test('the compiled <Entity> literal is a module-scope const referenced by the attribute', () => {
		const output = transform(ENTITY_ROOT)
		// A hoisted const holds the literal; the attribute references its identifier (stable identity).
		expect(output).toMatch(/const\s+_bindxCompiledSelection\s*=\s*\{/)
		expect(output).toMatch(/compiledSelection=\{_bindxCompiledSelection\}/)
	})

	test('double transform is a no-op (idempotent) even with the identifier-valued attribute', () => {
		const once = transform(ENTITY_ROOT)
		const twice = transform(once)
		expect(twice.match(/compiledSelection/g)?.length).toBe(1)
		expect(twice.match(/_bindxCompiledSelection\s*=/g)?.length).toBe(1)
	})
})
