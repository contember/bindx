import { describe, expect, test } from 'bun:test'
import { SelectionScope, generateHasManyAlias, type SelectionMeta } from '@contember/bindx-client'

/** Selected fields as `alias` or `alias:fieldName`, relations with their nested fields. */
function describeSelection(meta: SelectionMeta): string[] {
	return [...meta.fields.values()].map(field => {
		const head = field.alias === field.fieldName ? field.alias : `${field.alias}:${field.fieldName}`
		return field.nested ? `${head} { ${describeSelection(field.nested).join(' ')} }` : head
	}).sort()
}

const LIMIT_TWO = { limit: 2 }
const LIMIT_TWO_ALIAS = generateHasManyAlias('posts', LIMIT_TWO)

describe('SelectionScope', () => {
	test('a has-many selected with params is its own relation under the params alias', () => {
		const scope = new SelectionScope()
		scope.child('posts').addScalar('title')
		scope.hasManyChild('posts', LIMIT_TWO).addScalar('rank')

		const selection = scope.toSelectionMeta()
		expect(describeSelection(selection)).toEqual([
			'posts { id title }',
			`${LIMIT_TWO_ALIAS}:posts { id rank }`,
		])
		expect(selection.fields.get(LIMIT_TWO_ALIAS)?.hasManyParams).toEqual(LIMIT_TWO)
		expect(selection.fields.get(LIMIT_TWO_ALIAS)?.isArray).toBe(true)
	})

	test('a has-many selected without params is the plain relation', () => {
		const scope = new SelectionScope()
		scope.hasManyChild('posts', { filter: undefined }).addScalar('title')

		const selection = scope.toSelectionMeta()
		expect(describeSelection(selection)).toEqual(['posts { id title }'])
		expect(selection.fields.get('posts')?.isArray).toBe(true)
		expect(selection.fields.get('posts')?.hasManyParams).toBeUndefined()
	})

	test('merge keeps the params aliases apart', () => {
		const other = new SelectionScope()
		other.hasManyChild('posts', LIMIT_TWO).addScalar('rank')
		other.child('author')

		const scope = new SelectionScope()
		scope.child('posts').addScalar('title')
		scope.merge(other)

		expect(describeSelection(scope.toSelectionMeta())).toEqual([
			'author { id }',
			'posts { id title }',
			`${LIMIT_TWO_ALIAS}:posts { id rank }`,
		])
	})

	test('mergeFromSelectionMeta round-trips the params aliases', () => {
		const scope = new SelectionScope()
		scope.child('posts').addScalar('title')
		scope.hasManyChild('posts', LIMIT_TWO).addScalar('rank')

		const roundTripped = SelectionScope.fromSelectionMeta(scope.toSelectionMeta()).toSelectionMeta()
		expect(describeSelection(roundTripped)).toEqual(describeSelection(scope.toSelectionMeta()))
		expect(roundTripped.fields.get(LIMIT_TWO_ALIAS)?.hasManyParams).toEqual(LIMIT_TWO)
	})

	test('a field selected as a relation under a params alias is no scalar', () => {
		// Without a schema the collector first records a read field as a scalar.
		const scope = new SelectionScope()
		scope.addScalar('posts')
		scope.hasManyChild('posts', LIMIT_TWO).addScalar('rank')
		scope.addScalar('posts')

		expect(describeSelection(scope.toSelectionMeta())).toEqual([`${LIMIT_TWO_ALIAS}:posts { id rank }`])
	})

	test('totalCount of one params alias survives merge in either order', () => {
		const counted = new SelectionScope()
		counted.hasManyChild('posts', { ...LIMIT_TWO, totalCount: true })
		const uncounted = new SelectionScope()
		uncounted.hasManyChild('posts', LIMIT_TWO)

		const countedFirst = SelectionScope.fromSelectionMeta(counted.toSelectionMeta())
		countedFirst.merge(uncounted)
		uncounted.merge(counted)

		for (const scope of [countedFirst, uncounted]) {
			expect(scope.toSelectionMeta().fields.get(LIMIT_TWO_ALIAS)?.hasManyParams).toEqual({ ...LIMIT_TWO, totalCount: true })
		}
	})

	test('a scalar selected under an alias is its own field next to the plain one', () => {
		const scope = new SelectionScope()
		scope.addScalar('title', 'headline')
		scope.addScalar('title')

		const selection = scope.toSelectionMeta()
		expect(describeSelection(selection)).toEqual(['headline:title', 'title'])
		expect(selection.fields.get('headline')?.path).toEqual(['title'])
	})

	test('mergeFromSelectionMeta keeps scalar and relation aliases', () => {
		const source = new SelectionScope()
		source.addScalar('title', 'headline')
		source.child('author', 'writer').addScalar('name', 'fullName')
		source.hasManyChild('posts', LIMIT_TWO, 'topPosts').addScalar('rank')

		const roundTripped = SelectionScope.fromSelectionMeta(source.toSelectionMeta()).toSelectionMeta()
		expect(describeSelection(roundTripped)).toEqual([
			'headline:title',
			'topPosts:posts { id rank }',
			'writer:author { fullName:name id }',
		])
		expect(roundTripped.fields.get('topPosts')?.hasManyParams).toEqual(LIMIT_TWO)
		expect(roundTripped.fields.get('topPosts')?.isArray).toBe(true)
	})

	test('merge keeps scalar aliases', () => {
		const other = new SelectionScope()
		other.addScalar('title', 'headline')
		const scope = new SelectionScope()
		scope.addScalar('title')
		scope.merge(other)

		expect(describeSelection(scope.toSelectionMeta())).toEqual(['headline:title', 'title'])
	})

	test('a field upgraded to a relation drops its scalar entries under every alias', () => {
		// Without a schema the collector first records a read field as a scalar.
		const scope = new SelectionScope()
		scope.addScalar('author')
		scope.addScalar('author', 'writer')
		scope.child('author')

		expect(describeSelection(scope.toSelectionMeta())).toEqual(['author { id }'])
	})
})
