/**
 * Phase 3.1: hole-target-kind classification + entityLike roots. Static-analysis assertions cover
 * the drop-vs-bail decisions per target kind; adapter-oracle equivalence (render transformed vs
 * untransformed under a recording MockAdapter) proves the compiled root query equals the runtime
 * walk. Fixtures mirror real-world shapes (createComponent + render-local, PublishedRevisionIdProvider
 * function children, withCollector staticRender, RefreshableEntity forwarding wrapper).
 */
import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import { cleanup } from '@testing-library/react'
import { analyzeEntityRoots, isEntityRootBailed } from '../src/index.js'
import { captureRootSpec, cleanupTmpFiles, expectRootEquivalent, transform } from './rootOracle.js'

const DIR = import.meta.dir

afterEach(() => cleanup())
afterAll(() => cleanupTmpFiles())

// ── Fixtures ──────────────────────────────────────────────────────────────────

// createComponent target receiving a render-local (`label`) + a function prop (`onClick`) alongside
// the entity. Both are droppable with NO bail (getSelection ignores non-entity props / functions).
const CC_RENDER_LOCAL = `
import { Entity, Field, createComponent, entityDef, SCOPE_REF } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
const Body = createComponent()
	.entity('entity', ArticleDef)
	.render(({ entity }) => <Field field={entity.title} />)
let collectorCalls = 0
export const getCollectorCalls = () => collectorCalls
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => {
				if (article && typeof article === 'object' && SCOPE_REF in article) collectorCalls++
				const label = 'x'.toUpperCase()
				return <div data-testid="ready"><Body entity={article} extra={label} onClick={() => label} /></div>
			}}
		</Entity>
	)
}
`

// createComponent target with FUNCTION children (PublishedRevisionIdProvider shape): the target's
// render calls children(scalar). getSelection walks the children slot but analyzeJsx ignores a
// function → nothing collected from it; the target's own implicit selection (title) still lands.
const CC_FUNCTION_CHILDREN = `
import { Entity, Field, createComponent, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
const Provider = createComponent()
	.entity('page', ArticleDef)
	.render(({ page, children }) => <><Field field={page.title} />{children('scalar')}</>)
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => (
				<Provider page={article}>
					{scalarVal => <div data-testid="ready">{scalarVal}</div>}
				</Provider>
			)}
		</Entity>
	)
}
`

// Plain function-component target with a render-local. No selection surface → everything non-entity
// droppable; the hole is still emitted (blind, matching runtime). A sibling <Field> gives the root
// something to fetch; both paths collect exactly {title}.
const PLAIN_RENDER_LOCAL = `
import { Entity, Field, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
function PlainBody(props) { return <span>{String(props.label)}</span> }
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => {
				const label = 'x'.toUpperCase()
				return <div data-testid="ready"><Field field={article.title} /><PlainBody entity={article} label={label} /></div>
			}}
		</Entity>
	)
}
`

// withCollector staticRender referencing ONLY the entity prop. A dropped render-local (`extra`,
// not referenced) is safe → compiles, STRICT oracle equality (author.name via the staticRender).
const COLLECTOR_UNREFERENCED = `
import { Entity, Field, withCollector, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
const Badge = withCollector(
	(props) => <span />,
	({ entity }) => <Field field={entity.name} />,
)
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => {
				const local = 'x'.toUpperCase()
				return <div data-testid="ready"><Badge entity={article.author} extra={local} /></div>
			}}
		</Entity>
	)
}
`

// withCollector staticRender that DOES reference the dropped prop name (`extra`) → the render-local
// passed to it may under-fetch → still bails RENDER_LOCAL_ON_HOLE.
const COLLECTOR_REFERENCED = `
import { Entity, Field, withCollector, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
const Badge = withCollector(
	(props) => <span />,
	({ entity, extra }) => <>{extra}<Field field={entity.name} /></>,
)
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => {
				const local = 'x'.toUpperCase()
				return <div data-testid="ready"><Badge entity={article.author} extra={local} /></div>
			}}
		</Entity>
	)
}
`

// withCollector staticRender with a rest-spread param → the referenced set is the conservative
// "all" sentinel → the dropped render-local is treated as referenced → bails.
const COLLECTOR_REST_SPREAD = `
import { Entity, Field, withCollector, entityDef } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
const Badge = withCollector(
	(props) => <span />,
	({ entity, ...rest }) => <Field field={entity.name} />,
)
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => {
				const local = 'x'.toUpperCase()
				return <div data-testid="ready"><Badge entity={article.author} extra={local} /></div>
			}}
		</Entity>
	)
}
`

// entityLike forwarding wrapper (RefreshableEntity shape): a withCollector whose runtime + static
// render spread props into a real <Entity>. Treated as <Entity> for root scanning; the injected
// compiledSelection reaches the inner Entity via {...props}.
const ENTITY_LIKE = `
import { Entity, Field, withCollector, entityDef, SCOPE_REF } from '@contember/bindx-react'
const ArticleDef = entityDef('Article')
let collectorCalls = 0
export const getCollectorCalls = () => collectorCalls
const RefreshableWrapper = withCollector(
	function RefreshableWrapperRuntime(props) { return <Entity queryKey="k" {...props} /> },
	props => <Entity {...props} />,
)
export function Route() {
	return (
		<RefreshableWrapper entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => {
				if (article && typeof article === 'object' && SCOPE_REF in article) collectorCalls++
				return <div data-testid="ready"><Field field={article.title} /><Field field={article.content} /></div>
			}}
		</RefreshableWrapper>
	)
}
`

const ENTITY_LIKE_OPTS = { entityLike: ['RefreshableWrapper'] }

// ── Static analysis ─────────────────────────────────────────────────────────

describe('phase 3.1 — target-kind classification (static)', () => {
	test('createComponent target: render-local + function prop drop, no bail, one hole', () => {
		const [root] = analyzeEntityRoots(CC_RENDER_LOCAL, 'cc.tsx')
		expect(root && !isEntityRootBailed(root)).toBe(true)
		if (root && !isEntityRootBailed(root)) {
			expect(root.holes).toHaveLength(1)
			expect(root.holes[0]!.component).toBe('Body')
			expect(root.holes[0]!.entityProps).toEqual({ entity: { source: 'entity', path: [] } })
			expect(root.holes[0]!.extraProps).toBeUndefined() // extra + onClick dropped
		}
	})

	test('createComponent target with function children compiles (children dropped)', () => {
		const [root] = analyzeEntityRoots(CC_FUNCTION_CHILDREN, 'ccfn.tsx')
		expect(root && !isEntityRootBailed(root)).toBe(true)
		if (root && !isEntityRootBailed(root)) {
			expect(root.holes).toHaveLength(1)
			expect(root.holes[0]!.component).toBe('Provider')
			expect(root.holes[0]!.extraProps).toBeUndefined()
		}
	})

	test('plain target: render-local dropped, hole still emitted', () => {
		const [root] = analyzeEntityRoots(PLAIN_RENDER_LOCAL, 'plain.tsx')
		expect(root && !isEntityRootBailed(root)).toBe(true)
		if (root && !isEntityRootBailed(root)) {
			expect(root.selection).toEqual({ title: true })
			expect(root.holes).toHaveLength(1)
			expect(root.holes[0]!.component).toBe('PlainBody')
			expect(root.holes[0]!.extraProps).toBeUndefined()
		}
	})

	test('collectorStatic referencing only entity: dropped render-local is safe (no bail)', () => {
		const [root] = analyzeEntityRoots(COLLECTOR_UNREFERENCED, 'cu.tsx')
		expect(root && !isEntityRootBailed(root)).toBe(true)
		if (root && !isEntityRootBailed(root)) {
			expect(root.holes[0]!.extraProps).toBeUndefined()
		}
	})

	test('collectorStatic referencing the dropped prop → bails RENDER_LOCAL_ON_HOLE', () => {
		const [root] = analyzeEntityRoots(COLLECTOR_REFERENCED, 'cr.tsx')
		expect(root && isEntityRootBailed(root)).toBe(true)
		if (root && isEntityRootBailed(root)) {
			expect(root.bailout.code).toBe('RENDER_LOCAL_ON_HOLE')
		}
	})

	test('collectorStatic with rest-spread param → conservative → bails', () => {
		const [root] = analyzeEntityRoots(COLLECTOR_REST_SPREAD, 'crs.tsx')
		expect(root && isEntityRootBailed(root)).toBe(true)
		if (root && isEntityRootBailed(root)) {
			expect(root.bailout.code).toBe('RENDER_LOCAL_ON_HOLE')
		}
	})

	test('entityLike wrapper is scanned as a root only under the option', () => {
		// Without the flag only the wrapper's two internal `<Entity {...props}/>` are found (they bail —
		// children arrive via spread, not an inline function); the wrapper itself is invisible.
		const noFlag = analyzeEntityRoots(ENTITY_LIKE, 'el.tsx')
		expect(noFlag).toHaveLength(2)
		expect(noFlag.every(r => isEntityRootBailed(r) && r.bailout.code === 'ENTITY_NO_FUNCTION_CHILDREN')).toBe(true)
		// With the flag the wrapper element is added and compiles from its inline children closure.
		const withFlag = analyzeEntityRoots(ENTITY_LIKE, 'el.tsx', ENTITY_LIKE_OPTS)
		expect(withFlag).toHaveLength(3)
		const compiled = withFlag.filter(r => !isEntityRootBailed(r))
		expect(compiled).toHaveLength(1)
		if (compiled[0] && !isEntityRootBailed(compiled[0])) {
			expect(compiled[0].selection).toEqual({ title: true, content: true })
		}
	})

	test('entityLike emit lands the attribute on the wrapper element', () => {
		const out = transform(ENTITY_LIKE, DIR, ENTITY_LIKE_OPTS).replace(/\s+/g, ' ')
		expect(out).toContain('compiledSelection')
		expect(out).toMatch(/<RefreshableWrapper[^>]*compiledSelection=/)
	})
})

// ── Adapter-oracle equivalence ────────────────────────────────────────────────

describe('phase 3.1 — adapter-oracle equivalence', () => {
	test('createComponent target + render-local: query equal, children not invoked', async () => {
		const compiled = await captureRootSpec(CC_RENDER_LOCAL, DIR, true)
		expect(compiled.collectorCalls).toBe(0)
		const fields = await expectRootEquivalent(CC_RENDER_LOCAL, DIR)
		expect(fields).toMatchObject({ title: true })
	})

	test('createComponent target with function children: query equal', async () => {
		const fields = await expectRootEquivalent(CC_FUNCTION_CHILDREN, DIR)
		expect(fields).toMatchObject({ title: true })
	})

	test('plain target with render-local: both blind, query equal', async () => {
		const fields = await expectRootEquivalent(PLAIN_RENDER_LOCAL, DIR)
		expect(fields).toMatchObject({ title: true })
		expect(fields.author).toBeUndefined() // plain target is blind — no author fetched
	})

	test('collectorStatic (unreferenced render-local dropped): strict equality, author.name collected', async () => {
		const fields = await expectRootEquivalent(COLLECTOR_UNREFERENCED, DIR)
		expect(fields.author).toMatchObject({ name: true })
	})

	test('entityLike wrapper: attribute rides {...props}; query equal, children not invoked', async () => {
		const compiled = await captureRootSpec(ENTITY_LIKE, DIR, true, ENTITY_LIKE_OPTS)
		expect(compiled.collectorCalls).toBe(0)
		const [comp, runtime] = await Promise.all([
			captureRootSpec(ENTITY_LIKE, DIR, true, ENTITY_LIKE_OPTS),
			captureRootSpec(ENTITY_LIKE, DIR, false, ENTITY_LIKE_OPTS),
		])
		expect(comp.fields).toEqual(runtime.fields)
		expect(comp.fields).toMatchObject({ title: true, content: true })
	})
})
