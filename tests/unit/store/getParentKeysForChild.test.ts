import { describe, test, expect } from 'bun:test'
import { RelationStore } from '../../../packages/bindx/src/store/RelationStore.js'

/**
 * Behavioral + cross-check tests for {@link RelationStore.getParentKeysForChild},
 * the reverse query that powers parent re-render notification after the
 * append-only `childToParents` registry was removed.
 *
 * The cross-check proves the reverse query agrees with the forward query
 * ({@link RelationStore.getLiveChildIds}): a child appears under a parent iff that
 * parent's live children include the child. Since both read the same maps with
 * the same liveness rules, they must never disagree — the randomized sequence is
 * the safety net guarding that invariant.
 */
describe('RelationStore.getParentKeysForChild', () => {
	test('has-one connect returns the parent; disconnect removes it', () => {
		const relations = new RelationStore()

		relations.setRelation(
			'Author:a1:featured',
			{ currentId: 'art1', state: 'connected' },
			undefined,
			'featured',
		)

		expect(relations.getParentKeysForChild('art1')).toEqual(new Set(['Author:a1']))

		relations.setRelation(
			'Author:a1:featured',
			{ currentId: null, state: 'disconnected' },
			undefined,
			'featured',
		)

		expect(relations.getParentKeysForChild('art1')).toEqual(new Set())
	})

	test('has-one in deleted state does not anchor its target', () => {
		const relations = new RelationStore()

		relations.setRelation(
			'Author:a1:featured',
			{ currentId: 'art1', state: 'deleted' },
			undefined,
			'featured',
		)

		expect(relations.getParentKeysForChild('art1')).toEqual(new Set())
	})

	test('has-many add returns the parent; remove (disconnect) removes it', () => {
		const relations = new RelationStore()

		relations.addToHasMany('Author:a1:articles', 'art1')
		expect(relations.getParentKeysForChild('art1')).toEqual(new Set(['Author:a1']))

		relations.removeFromHasMany('Author:a1:articles', 'art1', 'disconnect')
		expect(relations.getParentKeysForChild('art1')).toEqual(new Set())
	})

	test('has-many server item is a live parent until removed', () => {
		const relations = new RelationStore()

		relations.setHasManyServerIds('Author:a1:articles', ['art1', 'art2'])
		expect(relations.getParentKeysForChild('art1')).toEqual(new Set(['Author:a1']))

		relations.planHasManyRemoval('Author:a1:articles', 'art1', 'delete')
		expect(relations.getParentKeysForChild('art1')).toEqual(new Set())
	})

	test('diamond: a shared child returns both parents', () => {
		const relations = new RelationStore()

		relations.setRelation(
			'Author:a1:featured',
			{ currentId: 'art1', state: 'connected' },
			undefined,
			'featured',
		)
		relations.addToHasMany('Tag:t1:articles', 'art1')

		expect(relations.getParentKeysForChild('art1')).toEqual(new Set(['Author:a1', 'Tag:t1']))
	})

	test('cross-check: reverse query agrees with getLiveChildIds over a randomized sequence', () => {
		const relations = new RelationStore()
		const parents = ['Author:a1', 'Author:a2', 'Tag:t1', 'Tag:t2']
		const children = ['art1', 'art2', 'art3', 'art4']

		// Deterministic pseudo-random sequence (no flakiness, full reproducibility).
		let seed = 0x1234abcd
		const rand = (n: number): number => {
			seed = (seed * 1103515245 + 12345) & 0x7fffffff
			return seed % n
		}

		const pick = <T>(list: readonly T[]): T => list[rand(list.length)]!

		for (let step = 0; step < 400; step++) {
			const parent = pick(parents)
			const child = pick(children)
			const hasOneKey = `${parent}:featured`
			const hasManyKey = `${parent}:articles`

			switch (rand(7)) {
				case 0:
					relations.setRelation(hasOneKey, { currentId: child, state: 'connected' }, undefined, 'featured')
					break
				case 1:
					relations.setRelation(hasOneKey, { currentId: null, state: 'disconnected' }, undefined, 'featured')
					break
				case 2:
					relations.setRelation(hasOneKey, { currentId: child, state: 'deleted' }, undefined, 'featured')
					break
				case 3:
					relations.addToHasMany(hasManyKey, child)
					break
				case 4:
					relations.planHasManyConnection(hasManyKey, child)
					break
				case 5:
					relations.removeFromHasMany(hasManyKey, child, 'disconnect')
					break
				case 6:
					relations.setHasManyServerIds(hasManyKey, [child])
					break
			}

			// Forward-derived expectation: a parent should appear for `child` iff
			// `child` is among that parent's live children.
			for (const c of children) {
				const expected = new Set<string>()
				for (const p of parents) {
					if (relations.getLiveChildIds(`${p}:`).includes(c)) {
						expected.add(p)
					}
				}
				expect(relations.getParentKeysForChild(c)).toEqual(expected)
			}
		}
	})
})
