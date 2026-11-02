import { describe, test, expect } from 'bun:test'
import { isValidCompiledSelection } from '../../../packages/bindx-react/src/jsx/compiledSelectionShape.js'

const component = (): null => null

describe('isValidCompiledSelection', () => {
	test('accepts a well-formed literal with nested relations and holes', () => {
		const literal: unknown = {
			v: 2,
			props: {
				article: {
					title: true,
					tags: { fields: { name: true }, many: true },
					content: { hasOneFields: { value: true } },
					slug: { assumesNotHasOne: true },
				},
			},
			holes: [{
				component,
				entityProps: { author: { source: 'article', path: ['author'] } },
				literalProps: { label: 'x' },
				extraProps: { render: () => null },
			}],
		}
		expect(isValidCompiledSelection(literal, ['article'])).toBe(true)
	})

	const rejected: Array<[string, unknown]> = [
		['wrong version', { v: 1, props: { article: { title: true } } }],
		['props key that is not an entity prop', { v: 2, props: { other: { title: true } } }],
		['object node with neither fields nor hasOneFields', { v: 2, props: { article: { author: {} } } }],
		['scalar leaf other than true', { v: 2, props: { article: { title: false } } }],
		['assumesNotHasOne other than true', { v: 2, props: { article: { title: { assumesNotHasOne: false } } } }],
		['many flag other than true', { v: 2, props: { article: { tags: { fields: {}, many: 1 } } } }],
		['unknown key on a field node', { v: 2, props: { article: { tags: { fields: {}, many: true, params: { limit: 5 } } } } }],
		['unknown top-level key', { v: 2, props: {}, extra: true }],
		['unknown key on a hole', { v: 2, props: {}, holes: [{ component, entityProps: {}, children: 'x' }] }],
		['unknown key on a hole origin', { v: 2, props: {}, holes: [{ component, entityProps: { author: { source: 'article', path: [], alias: 'x' } } }] }],
		['holes that are not an array', { v: 2, props: {}, holes: {} }],
		['hole without a component thunk', { v: 2, props: {}, holes: [{ entityProps: {} }] }],
		['hole without entityProps', { v: 2, props: {}, holes: [{ component }] }],
		['hole sourced from an unknown prop', {
			v: 2,
			props: {},
			holes: [{ component, entityProps: { author: { source: 'other', path: [] } } }],
		}],
		['hole origin with a non-string path', {
			v: 2,
			props: {},
			holes: [{ component, entityProps: { author: { source: 'article', path: [1] } } }],
		}],
		['extraProps entry that is not a thunk', {
			v: 2,
			props: {},
			holes: [{ component, entityProps: {}, extraProps: { render: 'x' } }],
		}],
	]

	for (const [name, literal] of rejected) {
		test(`rejects ${name}`, () => {
			expect(isValidCompiledSelection(literal, ['article'])).toBe(false)
		})
	}
})
