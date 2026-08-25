/**
 * Options plumbing through babel's plugins-with-options tuple (`plugins: [[bindxCompilerPlugin, opts]]`).
 * The analyzer-level equivalents live in reexport.test.tsx (alias) and targetKinds.test.tsx
 * (entityLike); this asserts the babel plugin itself forwards those options into analysis — i.e. an
 * emit only happens when the option is present, so a dropped option would be caught here.
 */
import { describe, expect, test } from 'bun:test'
import { transformSync } from '@babel/core'
import { join } from 'node:path'
import { bindxCompilerPlugin, type BindxCompilerOptions } from '../src/index.js'

const DIR = import.meta.dir
const ROUTE = join(DIR, 'route.tsx') // filename base for relative `./fixtures/...` + alias resolution

function transform(code: string, options?: BindxCompilerOptions): string {
	const plugin = options ? [bindxCompilerPlugin, options] : bindxCompilerPlugin
	const out = transformSync(code, { filename: ROUTE, plugins: [plugin], configFile: false, babelrc: false })
	if (!out?.code) {
		throw new Error('transform produced no output')
	}
	return out.code
}

// createComponent target reached ONLY via a non-relative `@barrel` alias. Following it classifies the
// target so the render-local (`label`) is dropped and the root compiles; without the alias the target
// is unknown → the render-local bails the root → no injection. (Fixtures shared with reexport.test.tsx.)
const ALIASED_BARREL = `
import { Entity, entityDef } from '@contember/bindx-react'
import { AliasedCcBody } from '@barrel'
const ArticleDef = entityDef('Article')
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => {
				const label = 'x'.toUpperCase()
				return <div data-testid="ready"><AliasedCcBody entity={article} extra={label} /></div>
			}}
		</Entity>
	)
}
`
const ALIAS_OPTS: BindxCompilerOptions = { alias: { '@barrel': join(DIR, 'fixtures', '_ccBarrel') } }

// entityLike wrapper: scanned as an <Entity> root only when its name is configured. Without the option
// only the wrapper's internal `<Entity {...props}/>` are seen (they bail), so nothing is injected.
const ENTITY_LIKE = `
import { Entity, Field, withCollector, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
const RefreshableWrapper = withCollector(
	function RefreshableWrapperRuntime(props) { return <Entity queryKey="k" {...props} /> },
	props => <Entity {...props} />,
)
export function Route() {
	return (
		<RefreshableWrapper entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => <div data-testid="ready"><Field field={article.title} /></div>}
		</RefreshableWrapper>
	)
}
`
const ENTITY_LIKE_OPTS: BindxCompilerOptions = { entityLike: ['RefreshableWrapper'] }

describe('babel plugin — options plumbing through the tuple', () => {
	test('alias option reaches analysis: aliased barrel target resolves → compiledSelection injected', () => {
		expect(transform(ALIASED_BARREL, ALIAS_OPTS)).toContain('compiledSelection')
	})

	test('without the alias the same source bails (no injection) — proves the option is load-bearing', () => {
		expect(transform(ALIASED_BARREL)).not.toContain('compiledSelection')
	})

	test('entityLike option reaches analysis: wrapper scanned as a root → compiledSelection injected', () => {
		expect(transform(ENTITY_LIKE, ENTITY_LIKE_OPTS)).toContain('compiledSelection')
	})

	test('without entityLike the wrapper is invisible (no injection)', () => {
		expect(transform(ENTITY_LIKE)).not.toContain('compiledSelection')
	})
})
