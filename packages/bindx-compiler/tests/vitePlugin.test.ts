/**
 * Vite plugin unit test. Drives the plugin's `transform` with a mock context capturing
 * `addWatchFile` and asserts (a) the static selection literal is injected for a source importing a
 * cross-module contract target AND the target's path is registered as a watch dependency, and
 * (b) a file with neither `createComponent` nor `<Entity` is returned untouched (null).
 */
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { bindxCompiler, type BindxTransformContext, type BindxTransformResult } from '../src/index.js'

const DIR = import.meta.dir
const ROUTE = join(DIR, 'route.tsx') // filename base for relative `./fixtures/...` resolution

// createComponent host using a cross-module collector contract (ItemRepeater); analyzing it reads
// `_contractTargets.tsx`, which must both drive the emit and register as a watch dependency.
const CROSS_MODULE = `
import { createComponent, Field } from '@contember/bindx-react'
import { schema } from './fixtures/_schema.js'
import { ItemRepeater } from './fixtures/_contractTargets.js'
export const Host = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<ItemRepeater field={article.tags}>
			{tag => <Field field={tag.name} />}
		</ItemRepeater>
	))
`

const PLAIN = `
export const answer = 42
export function useThing(): number { return answer }
`

function makeContext(): { context: BindxTransformContext; watched: string[] } {
	const watched: string[] = []
	return { context: { addWatchFile: (id: string) => { watched.push(id) } }, watched }
}

async function runTransform(code: string, id: string, context: BindxTransformContext): Promise<BindxTransformResult | null> {
	return bindxCompiler().transform.call(context, code, id)
}

describe('bindxCompiler vite plugin', () => {
	test('is enforced pre with a stable name', () => {
		const plugin = bindxCompiler()
		expect(plugin.enforce).toBe('pre')
		expect(plugin.name).toBe('bindx-compiler')
	})

	test('injects the selection literal and watches the cross-module contract target', async () => {
		const { context, watched } = makeContext()
		const result = await runTransform(CROSS_MODULE, ROUTE, context)
		expect(result).not.toBeNull()
		// The proven chain gets a 2nd `.render(...)` argument (`{ props: ... }`); tags collected from the contract.
		expect(result?.code).toContain('props:')
		expect(result?.code).toContain('name: true')
		// The contract module read during discovery is registered as a watch dependency.
		expect(watched).toContain(join(DIR, 'fixtures', '_contractTargets.tsx'))
	})

	test('returns null (untouched) for a file without createComponent or <Entity', async () => {
		const { context, watched } = makeContext()
		const result = await runTransform(PLAIN, join(DIR, 'plain.tsx'), context)
		expect(result).toBeNull()
		expect(watched).toHaveLength(0)
	})

	test('skips non-jsx and node_modules ids without watching', async () => {
		const { context, watched } = makeContext()
		expect(await runTransform(CROSS_MODULE, join(DIR, 'plain.ts'), context)).toBeNull()
		expect(await runTransform(CROSS_MODULE, '/x/node_modules/pkg/route.tsx', context)).toBeNull()
		expect(watched).toHaveLength(0)
	})
})
