// Regression: rendering a raw ref as a JSX child (`{article.title}` instead of
// <Field field={article.title}/>) makes React probe `$$typeof` on the collector
// proxy via isValidElement. That probe used to upgrade the scalar to a bogus
// relation `{ id, $$typeof }` (invalid GraphQL). Reproduced here at the collector
// level to keep the misuse fully typed.
import '../../setup'
import { describe, test, expect } from 'bun:test'
import { isValidElement } from 'react'
import { createCollectorProxy } from '@contember/bindx-react'
import { SelectionScope } from '@contember/bindx'

interface Author {
	id: string
	name: string
}
interface Article {
	id: string
	title: string
	author: Author
}

describe('collector proxy React probe keys', () => {
	test('isValidElement probe on a scalar ref does not upgrade it to a relation', () => {
		const scope = new SelectionScope()
		const entity = createCollectorProxy<Article>(scope, 'Article', null)

		// Accessing the scalar registers it; the probe must not change that.
		const titleRef = entity.$fields.title
		expect(isValidElement(titleRef)).toBe(false)

		const meta = scope.toSelectionMeta()
		const title = meta.fields.get('title')
		expect(title).toBeDefined()
		expect(title!.isRelation).toBe(false)
		expect(title!.nested).toBeUndefined()
		// No bogus `$$typeof` field leaked into the selection.
		expect([...meta.fields.keys()]).not.toContain('$$typeof')
	})
})
