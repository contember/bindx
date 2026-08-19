import { describe, test, expect } from 'bun:test'
import { RelationStore } from '../../../packages/bindx/src/store/RelationStore.js'

/**
 * Pins the has-many planned-addition KIND invariant after the two-set model
 * (plannedConnections + createdEntities) collapsed into a single
 * Map<id, 'created' | 'connected'> in HasManyStore.
 *
 * The load-bearing rule is "no downgrade": once an id is recorded as 'created'
 * (a newly created, never-persisted entity), a later connect MUST NOT rewrite it
 * to 'connected'. MutationCollector reads the kind verbatim — 'created' → emit a
 * create, 'connected' → emit a connect — so a downgrade would emit a connect to a
 * temp id the server never creates: a silently dropped write (data loss). Both the
 * planHasManyConnection and connectExistingToHasMany paths carry the guard, so
 * both are pinned here.
 */
describe('HasMany planned-addition kind', () => {
	const KEY = 'Article:a1:tags'

	describe('no downgrade: created stays created', () => {
		test('planHasManyConnection does not downgrade a created addition', () => {
			const relations = new RelationStore()
			relations.addToHasMany(KEY, 'temp-1')
			expect(relations.getHasMany(KEY)?.plannedAdditions.get('temp-1')).toBe('created')

			// connect() after add() on the SAME id must keep it a create.
			relations.planHasManyConnection(KEY, 'temp-1')
			expect(relations.getHasMany(KEY)?.plannedAdditions.get('temp-1')).toBe('created')
		})

		test('connectExistingToHasMany does not downgrade a created addition', () => {
			const relations = new RelationStore()
			relations.addToHasMany(KEY, 'temp-1')
			expect(relations.getHasMany(KEY)?.plannedAdditions.get('temp-1')).toBe('created')

			// The embedded-connect materialization path must not downgrade either.
			relations.connectExistingToHasMany(KEY, 'temp-1')
			expect(relations.getHasMany(KEY)?.plannedAdditions.get('temp-1')).toBe('created')
		})

		test('a genuine connect of a never-added id is recorded as connected', () => {
			const relations = new RelationStore()
			relations.connectExistingToHasMany(KEY, 'persisted-1')
			expect(relations.getHasMany(KEY)?.plannedAdditions.get('persisted-1')).toBe('connected')
		})
	})

	describe('connectExistingToHasMany ordered-id dedup', () => {
		test('re-connecting the same id does not duplicate it in the ordered list', () => {
			const relations = new RelationStore()
			// The same embedded connect reference can be materialized more than once.
			relations.connectExistingToHasMany(KEY, 'persisted-1')
			relations.connectExistingToHasMany(KEY, 'persisted-1')

			expect(relations.getHasManyOrderedIds(KEY)).toEqual(['persisted-1'])
			expect(relations.getHasMany(KEY)?.plannedAdditions.get('persisted-1')).toBe('connected')
		})

		test('connecting an id already present as a server member does not duplicate it', () => {
			const relations = new RelationStore()
			relations.setHasManyServerIds(KEY, ['persisted-1', 'persisted-2'])

			relations.connectExistingToHasMany(KEY, 'persisted-1')

			expect(relations.getHasManyOrderedIds(KEY)).toEqual(['persisted-1', 'persisted-2'])
		})
	})
})
