/**
 * Cross-file dependency reporting. The analyzer reads OTHER modules to classify contract targets
 * and hole target-kinds; each such read must surface via `onDependency` so a bundler can register a
 * watch dependency. Without it, editing a contract/target module leaves a stale injected literal
 * (potentially an under-fetch). These tests assert BOTH discovery paths report the sibling's path.
 */
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { analyzeEntityRoots, analyzeSource } from '../src/index.js'

const DIR = import.meta.dir
const ROUTE = join(DIR, 'route.tsx') // filename base for relative `./fixtures/...` resolution

// Contract component (ItemRepeater) imported from a sibling module; contract discovery must read it.
const CONTRACT_SRC = `
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

// createComponent target reached through a named barrel; target-kind classification chases the
// re-export, so both the barrel and the leaf module must be reported.
const TARGET_KIND_SRC = `
import { Entity, entityDef } from '@contember/bindx-react'
import { CcBody } from './fixtures/_ccBarrel.js'
const ArticleDef = entityDef('Article')
export function Route() {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }}>
			{article => {
				const label = 'x'.toUpperCase()
				return <div><CcBody entity={article} extra={label} /></div>
			}}
		</Entity>
	)
}
`

describe('cross-file dependency reporting', () => {
	test('contract discovery reports the imported contract module', () => {
		const deps = new Set<string>()
		analyzeSource(CONTRACT_SRC, ROUTE, { onDependency: path => deps.add(path) })
		expect(deps.has(join(DIR, 'fixtures', '_contractTargets.tsx'))).toBe(true)
	})

	test('target-kind classification reports the barrel and the re-exported leaf module', () => {
		const deps = new Set<string>()
		analyzeEntityRoots(TARGET_KIND_SRC, ROUTE, { onDependency: path => deps.add(path) })
		expect(deps.has(join(DIR, 'fixtures', '_ccBarrel.ts'))).toBe(true)
		expect(deps.has(join(DIR, 'fixtures', '_ccTarget.tsx'))).toBe(true)
	})

	test('no dependency callback fires for a purely-local analysis', () => {
		const deps = new Set<string>()
		const LOCAL = `
import { createComponent, Field } from '@contember/bindx-react'
import { schema } from './fixtures/_schema.js'
export const Card = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => <Field field={article.title} />)
`
		analyzeSource(LOCAL, ROUTE, { onDependency: path => deps.add(path) })
		// The schema import is never resolved (no contract/target lookup targets it), so no reads occur.
		expect(deps.size).toBe(0)
	})
})
