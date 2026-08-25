/**
 * Re-export chain following (Phase 3.1 extension). Binding resolution now follows `from`-source
 * re-exports — `export { X } from`, `export { X as Y } from`, `export * from` (barrel index files) —
 * so a createComponent/contract target hidden behind a barrel is classified instead of bailing.
 * Depth-limit and cycle guards keep the chase bounded; an unfollowable chain preserves the
 * conservative bail. Adapter-oracle equivalence proves the compiled root query matches the runtime
 * walk for the barrel'd createComponent target.
 */
import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import { cleanup } from '@testing-library/react'
import { join } from 'node:path'
import { analyzeEntityRoots, analyzeSource, isBailed, isEntityRootBailed } from '../src/index.js'
import { compilerPlain } from './harness.js'
import { captureRootSpec, cleanupTmpFiles, expectRootEquivalent } from './rootOracle.js'

const DIR = import.meta.dir
const ROUTE = join(DIR, 'route.tsx') // filename base for relative `./fixtures/...` resolution

afterEach(() => cleanup())
afterAll(() => cleanupTmpFiles())

// createComponent target behind a NAMED barrel (`export { CcBody } from './_ccTarget.js'`). The
// render-local (`extra`) + function prop (`onClick`) are droppable once the chain is followed.
const CC_NAMED_BARREL = `
import { Entity, entityDef, SCOPE_REF } from '@contember/bindx-react'
import { CcBody } from './fixtures/_ccBarrel.js'
const ArticleDef = entityDef('Article')
let collectorCalls = 0
export const getCollectorCalls = () => collectorCalls
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => {
				if (article && typeof article === 'object' && SCOPE_REF in article) collectorCalls++
				const label = 'x'.toUpperCase()
				return <div data-testid="ready"><CcBody entity={article} extra={label} onClick={() => label} /></div>
			}}
		</Entity>
	)
}
`

// Same target through a STAR barrel (`export * from './_ccTarget.js'`).
const CC_STAR_BARREL = `
import { Entity, entityDef, SCOPE_REF } from '@contember/bindx-react'
import { CcBody } from './fixtures/_ccStarBarrel.js'
const ArticleDef = entityDef('Article')
let collectorCalls = 0
export const getCollectorCalls = () => collectorCalls
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => {
				if (article && typeof article === 'object' && SCOPE_REF in article) collectorCalls++
				const label = 'x'.toUpperCase()
				return <div data-testid="ready"><CcBody entity={article} extra={label} /></div>
			}}
		</Entity>
	)
}
`

// Same target reached via an ALIASED entry import (`import { AliasedCcBody } from '@barrel'`, alias →
// the barrel) whose re-export uses `export { CcBody as AliasedCcBody } from`. Static-only (a runtime
// import of `@barrel` would not resolve without a bundler alias).
const CC_ALIASED_BARREL = `
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
const ALIAS_OPTS = { alias: { '@barrel': join(DIR, 'fixtures', '_ccBarrel') } }

// Cyclic barrel (A ⇄ B, neither actually exports CcBody) → visited-guard → unfollowable → the
// render-local on the (unknown-kind) hole keeps the conservative RENDER_LOCAL_ON_HOLE bail.
const CC_CYCLE_BARREL = `
import { Entity, entityDef } from '@contember/bindx-react'
import { CcBody } from './fixtures/_cycleBarrelA.js'
const ArticleDef = entityDef('Article')
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => {
				const label = 'x'.toUpperCase()
				return <div data-testid="ready"><CcBody entity={article} extra={label} /></div>
			}}
		</Entity>
	)
}
`

// Star chain longer than MAX_HOPS (_deep1 → … → _deep6 → _ccTarget). The target sits one hop past
// the budget → unfollowable → conservative bail preserved.
const CC_DEEP_BARREL = `
import { Entity, entityDef } from '@contember/bindx-react'
import { CcBody } from './fixtures/_deep1.js'
const ArticleDef = entityDef('Article')
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => {
				const label = 'x'.toUpperCase()
				return <div data-testid="ready"><CcBody entity={article} extra={label} /></div>
			}}
		</Entity>
	)
}
`

// Collector-contract component (ItemRepeater) behind a named barrel — contract discovery must
// follow the `from` chain to reach its `withCollector(_, { children: itemOf('field') })`.
const CONTRACT_BARREL = `
import { createComponent, Field } from '@contember/bindx-react'
import { schema } from './fixtures/_schema.js'
import { ItemRepeater } from './fixtures/_contractBarrel.js'
export const Host = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<ItemRepeater field={article.tags}>
			{tag => <Field field={tag.name} />}
		</ItemRepeater>
	))
`

describe('re-export following — target-kind classification (static)', () => {
	test('createComponent target behind a named barrel: render-local + fn prop drop, no bail', () => {
		const [root] = analyzeEntityRoots(CC_NAMED_BARREL, ROUTE)
		expect(root && !isEntityRootBailed(root)).toBe(true)
		if (root && !isEntityRootBailed(root)) {
			expect(root.holes).toHaveLength(1)
			expect(root.holes[0]!.component).toBe('CcBody')
			expect(root.holes[0]!.entityProps).toEqual({ entity: { source: 'entity', path: [] } })
			expect(root.holes[0]!.extraProps).toBeUndefined()
		}
	})

	test('createComponent target behind a star barrel: render-local dropped, no bail', () => {
		const [root] = analyzeEntityRoots(CC_STAR_BARREL, ROUTE)
		expect(root && !isEntityRootBailed(root)).toBe(true)
		if (root && !isEntityRootBailed(root)) {
			expect(root.holes[0]!.component).toBe('CcBody')
			expect(root.holes[0]!.extraProps).toBeUndefined()
		}
	})

	test('createComponent target behind an aliased `X as Y` barrel: render-local dropped, no bail', () => {
		const [root] = analyzeEntityRoots(CC_ALIASED_BARREL, ROUTE, ALIAS_OPTS)
		expect(root && !isEntityRootBailed(root)).toBe(true)
		if (root && !isEntityRootBailed(root)) {
			expect(root.holes[0]!.component).toBe('AliasedCcBody')
			expect(root.holes[0]!.extraProps).toBeUndefined()
		}
	})

	test('cyclic barrel → unfollowable → conservative RENDER_LOCAL_ON_HOLE bail preserved', () => {
		const [root] = analyzeEntityRoots(CC_CYCLE_BARREL, ROUTE)
		expect(root && isEntityRootBailed(root)).toBe(true)
		if (root && isEntityRootBailed(root)) {
			expect(root.bailout.code).toBe('RENDER_LOCAL_ON_HOLE')
		}
	})

	test('barrel chain past MAX_HOPS → unfollowable → conservative bail preserved', () => {
		const [root] = analyzeEntityRoots(CC_DEEP_BARREL, ROUTE)
		expect(root && isEntityRootBailed(root)).toBe(true)
		if (root && isEntityRootBailed(root)) {
			expect(root.bailout.code).toBe('RENDER_LOCAL_ON_HOLE')
		}
	})
})

describe('re-export following — collector contract behind a barrel', () => {
	test('contract discovery follows the barrel: no hole, relation collected', () => {
		const [result] = analyzeSource(CONTRACT_BARREL, ROUTE)
		expect(result).toBeDefined()
		if (result && !isBailed(result)) {
			expect(result.holes).toEqual([])
			expect(compilerPlain(result, 'article')).toMatchObject({ tags: { name: true } })
		} else {
			throw new Error('contract-behind-barrel unexpectedly bailed')
		}
	})
})

describe('re-export following — adapter-oracle equivalence', () => {
	test('named barrel createComponent target: query equal, children not invoked', async () => {
		const compiled = await captureRootSpec(CC_NAMED_BARREL, DIR, true)
		expect(compiled.collectorCalls).toBe(0)
		const fields = await expectRootEquivalent(CC_NAMED_BARREL, DIR)
		expect(fields).toMatchObject({ title: true })
	})

	test('star barrel createComponent target: query equal', async () => {
		const fields = await expectRootEquivalent(CC_STAR_BARREL, DIR)
		expect(fields).toMatchObject({ title: true })
	})
})
