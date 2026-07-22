/**
 * #3 emit AST-reuse regression net. The compiler copies a lifted render-prop closure into a hole's
 * `extraProps`; that closure ALSO stays in the render body. Before the fix both positions shared one
 * AST node — corrupt under a later pass. Here we deliberately force that: run the compiler with
 * `ast: true`, then run `@babel/plugin-transform-react-jsx` over the SAME AST (`cloneInputAst:false`)
 * so the two positions share nodes. With the deep clone the output parses, LOADS, and the component
 * still collects the lifted field; a shared node would corrupt one of the two copies.
 *
 * (One transformSync can't chain the two: the compiler's Program `path.skip()` also halts react-jsx
 * in a merged pass, so we thread the AST across two passes — a stronger shared-node stress than one.)
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator'
if (typeof document === 'undefined') {
	GlobalRegistrator.register()
}

import { afterAll, describe, expect, test } from 'bun:test'
import { transformSync, transformFromAstSync } from '@babel/core'
import reactJsx from '@babel/plugin-transform-react-jsx'
import * as t from '@babel/types'
import type { File } from '@babel/types'
import { writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { COMPONENT_SELECTIONS, convertToQuerySelection, type SelectionMeta } from '@contember/bindx-react'
import { bindxCompilerPlugin, selectionToAst, type AnalyzedHole } from '../src/index.js'

// A hole whose target INVOKES its render-prop child (SelectField.staticRender calls props.children),
// so the child `it => <Field field={it.name} />` is LIFTED verbatim into the hole's extraProps.
const SOURCE = `
import { createComponent, Field, HasOne, withCollector } from '@contember/bindx-react'
import { schema } from './fixtures/_schema.js'

const SelectField = withCollector(
	() => null,
	(props) => <HasOne field={props.field}>{entity => props.children(entity)}</HasOne>,
)

export const Host = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<SelectField field={article.author}>{it => <Field field={it.name} />}</SelectField>
	))
`

/** Compiler pass (AST out) → react-jsx pass over the SAME nodes → emitted code text. */
function compileThenJsx(source: string): string {
	const first = transformSync(source, {
		filename: 'host.tsx', configFile: false, babelrc: false,
		parserOpts: { plugins: ['typescript', 'jsx'] },
		plugins: [bindxCompilerPlugin], ast: true, code: false,
	})
	const ast: File | null | undefined = first?.ast
	if (!ast) {
		throw new Error('compiler pass produced no AST')
	}
	const out = transformFromAstSync(ast, undefined, {
		filename: 'host.tsx', configFile: false, babelrc: false, cloneInputAst: false,
		plugins: [[reactJsx, { runtime: 'automatic' }]],
	})
	if (!out?.code) {
		throw new Error('react-jsx pass produced no output')
	}
	return out.code
}

const tmpFiles: string[] = []
let counter = 0

async function loadCompiled<T>(source: string): Promise<T> {
	const code = compileThenJsx(source)
	const path = join(import.meta.dir, `.interop-${counter++}.tsx`)
	writeFileSync(path, code)
	tmpFiles.push(path)
	return import(path) as Promise<T>
}

afterAll(() => {
	for (const file of tmpFiles) {
		rmSync(file, { force: true })
	}
})

interface HostModule {
	readonly Host: unknown
}

describe('#3 compiler → react-jsx interop (shared-AST stress)', () => {
	test('output loads and the lifted closure still collects article.author.name', async () => {
		const mod = await loadCompiled<HostModule>(SOURCE)
		// Fragment access triggers static collection off the injected literal (extraProps thunk replayed).
		void (mod.Host as Record<string, unknown>).$article
		const selections = (mod.Host as Record<symbol, Map<string, { selection: SelectionMeta }>>)[COMPONENT_SELECTIONS]
		const selection = selections?.get('article')?.selection
		expect(selection).toBeDefined()
		const query = selection ? convertToQuerySelection(selection) : {}
		// The hole put author.name into the collected selection — proves neither copy was corrupted.
		expect(query).toMatchObject({ author: { name: true } })
	})
})

/** Find an object property's expression value by key. */
function findProp(obj: t.ObjectExpression, name: string): t.Expression | undefined {
	for (const p of obj.properties) {
		if (t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === name && t.isExpression(p.value)) {
			return p.value
		}
	}
	return undefined
}

describe('#3 emit deep-clones extraProps (node identity)', () => {
	test('the emitted extraProps expression is independent of the source node', () => {
		const source = t.arrowFunctionExpression([], t.identifier('original'))
		const hole: AnalyzedHole = { component: 'C', entityProps: {}, extraProps: { children: source } }
		const ast = selectionToAst({}, [hole])

		// Mutate the ORIGINAL node after emit — a shared node would leak this into the output.
		if (t.isIdentifier(source.body)) {
			source.body.name = 'MUTATED'
		}

		const holesProp = findProp(ast, 'holes')
		const holeObj = holesProp && t.isArrayExpression(holesProp) && t.isObjectExpression(holesProp.elements[0] ?? null)
			? holesProp.elements[0]
			: undefined
		const extra = holeObj && t.isObjectExpression(holeObj) ? findProp(holeObj, 'extraProps') : undefined
		const thunk = extra && t.isObjectExpression(extra) ? findProp(extra, 'children') : undefined
		expect(thunk && t.isArrowFunctionExpression(thunk)).toBe(true)
		if (!thunk || !t.isArrowFunctionExpression(thunk)) {
			throw new Error('extraProps thunk not found')
		}
		// The thunk body is a deep CLONE — a distinct object still holding the pre-mutation name.
		expect(thunk.body).not.toBe(source)
		expect(t.isArrowFunctionExpression(thunk.body) && t.isIdentifier(thunk.body.body) ? thunk.body.body.name : null).toBe('original')
	})
})
