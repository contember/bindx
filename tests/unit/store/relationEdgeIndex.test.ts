import { describe, test, expect } from 'bun:test'
import { RelationStore } from '../../../packages/bindx/src/store/RelationStore.js'
import { RelationEdgeIndex } from '../../../packages/bindx/src/store/RelationEdgeIndex.js'

/**
 * Edge cases introduced by the bidirectional {@link RelationEdgeIndex} that backs
 * getLiveChildIds / getParentKeysForChild. The randomized cross-check in
 * getParentKeysForChild.test.ts proves forward/reverse agreement over long
 * sequences; these tests pin the specific reference-counting and migration cases
 * (the same parent reaching a child through several fields, id replacement, owner
 * rekey, bulk removal) where a naive reverse map would drift.
 */
describe('RelationEdgeIndex (unit)', () => {
	test('reference-counts an edge contributed by multiple fields', () => {
		const index = new RelationEdgeIndex()
		index.addEdge('Author:a1', 'art1')
		index.addEdge('Author:a1', 'art1') // second field on the same parent

		const parents1 = new Set<string>()
		index.collectParents('art1', parents1)
		expect(parents1).toEqual(new Set(['Author:a1']))

		index.removeEdge('Author:a1', 'art1') // one field drops it — still live
		const parents2 = new Set<string>()
		index.collectParents('art1', parents2)
		expect(parents2).toEqual(new Set(['Author:a1']))

		index.removeEdge('Author:a1', 'art1') // last field drops it — gone
		const parents3 = new Set<string>()
		index.collectParents('art1', parents3)
		expect(parents3).toEqual(new Set())

		// Forward direction is symmetric.
		const children = new Set<string>()
		index.collectChildren('Author:a1', children)
		expect(children).toEqual(new Set())
	})

	test('over-decrement is a safe no-op', () => {
		const index = new RelationEdgeIndex()
		index.addEdge('P', 'c')
		index.removeEdge('P', 'c')
		index.removeEdge('P', 'c') // already gone — must not throw or go negative
		const parents = new Set<string>()
		index.collectParents('c', parents)
		expect(parents).toEqual(new Set())
	})
})

describe('RelationStore edge index integration', () => {
	test('two has-one fields to the same child keep the parent until both drop', () => {
		const relations = new RelationStore()
		relations.setRelation('Author:a1:featured', { currentId: 'art1', state: 'connected' }, undefined, 'featured')
		relations.setRelation('Author:a1:secondary', { currentId: 'art1', state: 'connected' }, undefined, 'secondary')

		expect(relations.getParentKeysForChild('art1')).toEqual(new Set(['Author:a1']))

		relations.setRelation('Author:a1:featured', { currentId: null, state: 'disconnected' }, undefined, 'featured')
		expect(relations.getParentKeysForChild('art1')).toEqual(new Set(['Author:a1'])) // secondary still holds it

		relations.setRelation('Author:a1:secondary', { currentId: null, state: 'disconnected' }, undefined, 'secondary')
		expect(relations.getParentKeysForChild('art1')).toEqual(new Set())
	})

	test('a child reached via has-one AND has-many of one parent survives dropping either', () => {
		const relations = new RelationStore()
		relations.setRelation('Author:a1:featured', { currentId: 'art1', state: 'connected' }, undefined, 'featured')
		relations.addToHasMany('Author:a1:articles', 'art1')

		expect(relations.getParentKeysForChild('art1')).toEqual(new Set(['Author:a1']))

		relations.removeFromHasMany('Author:a1:articles', 'art1', 'disconnect')
		expect(relations.getParentKeysForChild('art1')).toEqual(new Set(['Author:a1'])) // has-one still holds

		relations.setRelation('Author:a1:featured', { currentId: null, state: 'disconnected' }, undefined, 'featured')
		expect(relations.getParentKeysForChild('art1')).toEqual(new Set())
	})

	test('replaceEntityId migrates the child id in both directions', () => {
		const relations = new RelationStore()
		relations.addToHasMany('Author:a1:articles', 'old1')
		relations.setRelation('Author:a1:featured', { currentId: 'old1', state: 'connected' }, undefined, 'featured')

		expect(relations.getParentKeysForChild('old1')).toEqual(new Set(['Author:a1']))
		expect(relations.getLiveChildIds('Author:a1:')).toContain('old1')

		relations.replaceEntityId('old1', 'new1')

		expect(relations.getParentKeysForChild('old1')).toEqual(new Set())
		expect(relations.getParentKeysForChild('new1')).toEqual(new Set(['Author:a1']))
		const live = relations.getLiveChildIds('Author:a1:')
		expect(live).toContain('new1')
		expect(live).not.toContain('old1')
	})

	test('rekeyOwner migrates the parent key in both directions', () => {
		const relations = new RelationStore()
		relations.addToHasMany('Author:a1:articles', 'art1')
		relations.setRelation('Author:a1:featured', { currentId: 'art2', state: 'connected' }, undefined, 'featured')

		relations.rekeyOwner('Author:a1:', 'Author:p1:')

		expect(relations.getParentKeysForChild('art1')).toEqual(new Set(['Author:p1']))
		expect(relations.getParentKeysForChild('art2')).toEqual(new Set(['Author:p1']))
		expect(relations.getLiveChildIds('Author:a1:')).toEqual([])
		expect(new Set(relations.getLiveChildIds('Author:p1:'))).toEqual(new Set(['art1', 'art2']))
	})

	test('removeOwnedRelations drops all of an owner edges', () => {
		const relations = new RelationStore()
		relations.addToHasMany('Author:a1:articles', 'art1')
		relations.setRelation('Author:a1:featured', { currentId: 'art2', state: 'connected' }, undefined, 'featured')

		relations.removeOwnedRelations('Author:a1:')

		expect(relations.getParentKeysForChild('art1')).toEqual(new Set())
		expect(relations.getParentKeysForChild('art2')).toEqual(new Set())
		expect(relations.getLiveChildIds('Author:a1:')).toEqual([])
	})

	test('commit and reset keep the index consistent with membership', () => {
		const relations = new RelationStore()
		relations.setHasManyServerIds('Author:a1:articles', ['s1', 's2'])
		relations.addToHasMany('Author:a1:articles', 'c1')
		expect(new Set(relations.getLiveChildIds('Author:a1:'))).toEqual(new Set(['s1', 's2', 'c1']))

		// commit folds plannedAdditions into serverIds — live membership unchanged.
		relations.commitHasMany('Author:a1:articles', ['s1', 's2', 'c1'])
		expect(new Set(relations.getLiveChildIds('Author:a1:'))).toEqual(new Set(['s1', 's2', 'c1']))
		expect(relations.getParentKeysForChild('c1')).toEqual(new Set(['Author:a1']))

		// plan a removal then reset — reset restores the full server membership.
		relations.planHasManyRemoval('Author:a1:articles', 's1', 'disconnect')
		expect(relations.getParentKeysForChild('s1')).toEqual(new Set()) // removed → not live
		relations.resetHasMany('Author:a1:articles')
		expect(relations.getParentKeysForChild('s1')).toEqual(new Set(['Author:a1']))
	})
})
