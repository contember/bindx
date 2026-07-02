// Memoization of the reachability walk (PR 1 of the store/persistence debt program).
//
// computeReachableCreated() is an O(E+R) walk run on every dirty check and every
// post-persist sweep. It is memoized behind a cache key that sums monotonic
// mutation counters from the four sub-stores it reads (entity snapshots, meta,
// relations, roots). The cache must:
//   - HIT when nothing graph-relevant changed (incl. across pure field edits), and
//   - MISS (recompute, no stale result) on any graph-affecting mutation.
//
// The white-box tests drive ReachabilityAnalyzer directly and spy on
// RelationStore.getLiveChildIds (called once per visited node) to observe whether
// a walk actually happened. The black-box test proves the SnapshotStore wiring
// propagates counter bumps end-to-end through getAllDirtyEntities.
import { describe, test, expect } from 'bun:test'
import { SnapshotStore } from '@contember/bindx'
import { ReachabilityAnalyzer } from '../../../packages/bindx/src/store/ReachabilityAnalyzer.js'
import { EntitySnapshotStore } from '../../../packages/bindx/src/store/EntitySnapshotStore.js'
import { EntityMetaStore } from '../../../packages/bindx/src/store/EntityMetaStore.js'
import { RelationStore } from '../../../packages/bindx/src/store/RelationStore.js'
import { RootRegistry } from '../../../packages/bindx/src/store/RootRegistry.js'

interface Harness {
	entitySnapshots: EntitySnapshotStore
	meta: EntityMetaStore
	relations: RelationStore
	roots: RootRegistry
	analyzer: ReachabilityAnalyzer
	walkCount: () => number
}

function createHarness(): Harness {
	const entitySnapshots = new EntitySnapshotStore()
	const meta = new EntityMetaStore()
	const relations = new RelationStore()
	const roots = new RootRegistry()

	// Spy: getLiveChildIds is invoked once per node the walk visits, so a stable
	// count across a call proves the cache served it without re-walking.
	let calls = 0
	const original = relations.getLiveChildIds.bind(relations)
	relations.getLiveChildIds = (keyPrefix: string): string[] => {
		calls++
		return original(keyPrefix)
	}

	const analyzer = new ReachabilityAnalyzer(entitySnapshots, meta, relations, roots)
	return { entitySnapshots, meta, relations, roots, analyzer, walkCount: () => calls }
}

// Server Article a1 with one created (never-persisted) Comment child c1 connected
// through its has-many. c1 is reachable from the server root, so it is a create.
function seedServerParentWithCreatedChild(h: Harness): void {
	h.entitySnapshots.setData('Article:a1', 'a1', 'Article', { id: 'a1' }, true)
	h.meta.setExistsOnServer('Article:a1', true)
	h.entitySnapshots.setData('Comment:c1', 'c1', 'Comment', { id: 'c1' }, false)
	h.relations.addToHasMany('Article:a1:comments', 'c1')
}

const sortedKeys = (set: Set<string>): string[] => [...set].sort()

describe('reachability memoization', () => {
	test('recomputes once and returns the cached set while nothing changes', () => {
		const h = createHarness()
		seedServerParentWithCreatedChild(h)

		const first = h.analyzer.computeReachableCreated()
		expect(sortedKeys(first)).toEqual(['Comment:c1'])
		const callsAfterFirst = h.walkCount()
		expect(callsAfterFirst).toBeGreaterThan(0)

		const second = h.analyzer.computeReachableCreated()
		expect(h.walkCount()).toBe(callsAfterFirst) // cache hit — no re-walk
		expect(second).toBe(first) // same cached instance
	})

	test('a pure field edit does NOT invalidate the cache', () => {
		const h = createHarness()
		seedServerParentWithCreatedChild(h)
		h.analyzer.computeReachableCreated()
		const calls = h.walkCount()

		// Value-only edits change snapshot data/version but not the key set or any
		// relation edge, so they must not bump any reachability counter.
		h.entitySnapshots.setFieldValue('Article:a1', ['title'], 'Edited')
		h.entitySnapshots.updateFields('Comment:c1', { text: 'changed' })

		h.analyzer.computeReachableCreated()
		expect(h.walkCount()).toBe(calls) // still cached
	})

	test('adding another created child invalidates the cache and is reflected', () => {
		const h = createHarness()
		seedServerParentWithCreatedChild(h)
		h.analyzer.computeReachableCreated()
		const calls = h.walkCount()

		h.entitySnapshots.setData('Comment:c2', 'c2', 'Comment', { id: 'c2' }, false)
		h.relations.addToHasMany('Article:a1:comments', 'c2')

		const result = h.analyzer.computeReachableCreated()
		expect(h.walkCount()).toBeGreaterThan(calls) // recomputed
		expect(sortedKeys(result)).toEqual(['Comment:c1', 'Comment:c2'])
	})

	test('removing a created child invalidates the cache and drops it', () => {
		const h = createHarness()
		seedServerParentWithCreatedChild(h)
		expect(sortedKeys(h.analyzer.computeReachableCreated())).toEqual(['Comment:c1'])
		const calls = h.walkCount()

		h.relations.removeFromHasMany('Article:a1:comments', 'c1', 'disconnect')

		const result = h.analyzer.computeReachableCreated()
		expect(h.walkCount()).toBeGreaterThan(calls)
		expect(sortedKeys(result)).toEqual([])
	})

	// Has-one edge variants of the add/remove tests above. getMutationVersion()
	// SUMS both sub-store counters, so a has-one setRelation (connect/disconnect)
	// must invalidate the cache just like a has-many edge change. If the has-one
	// term were dropped from the sum, a created child connected through a has-one
	// would be served stale — a dropped or phantom create.
	test('connecting a created child via has-one invalidates the cache and is reflected', () => {
		const h = createHarness()
		h.entitySnapshots.setData('Article:a1', 'a1', 'Article', { id: 'a1' }, true)
		h.meta.setExistsOnServer('Article:a1', true)
		// A created (never-persisted) author exists but is not yet reachable.
		h.entitySnapshots.setData('Author:au1', 'au1', 'Author', { id: 'au1' }, false)
		expect(sortedKeys(h.analyzer.computeReachableCreated())).toEqual([])
		const calls = h.walkCount()

		h.relations.setRelation('Article:a1:author', { currentId: 'au1', state: 'connected' }, undefined, 'author')

		const result = h.analyzer.computeReachableCreated()
		expect(h.walkCount()).toBeGreaterThan(calls) // recomputed, not served stale
		expect(sortedKeys(result)).toEqual(['Author:au1'])
	})

	test('disconnecting a created child via has-one invalidates the cache and drops it', () => {
		const h = createHarness()
		h.entitySnapshots.setData('Article:a1', 'a1', 'Article', { id: 'a1' }, true)
		h.meta.setExistsOnServer('Article:a1', true)
		h.entitySnapshots.setData('Author:au1', 'au1', 'Author', { id: 'au1' }, false)
		h.relations.setRelation('Article:a1:author', { currentId: 'au1', state: 'connected' }, undefined, 'author')
		expect(sortedKeys(h.analyzer.computeReachableCreated())).toEqual(['Author:au1'])
		const calls = h.walkCount()

		h.relations.setRelation('Article:a1:author', { currentId: null, state: 'disconnected' }, undefined, 'author')

		const result = h.analyzer.computeReachableCreated()
		expect(h.walkCount()).toBeGreaterThan(calls)
		expect(sortedKeys(result)).toEqual([])
	})

	test('RelationStore.getMutationVersion sums has-one and has-many writes', () => {
		const relations = new RelationStore()
		const v0 = relations.getMutationVersion()

		relations.setRelation('Article:a1:author', { currentId: 'au1', state: 'connected' }, undefined, 'author')
		const v1 = relations.getMutationVersion()
		expect(v1).toBeGreaterThan(v0) // has-one write counted

		relations.addToHasMany('Article:a1:comments', 'c1')
		const v2 = relations.getMutationVersion()
		expect(v2).toBeGreaterThan(v1) // has-many write also counted (the sum)
	})

	test('flipping existsOnServer invalidates the cache', () => {
		const h = createHarness()
		// A top-level created entity (root) — reported as a create until it exists.
		h.entitySnapshots.setData('Draft:d1', 'd1', 'Draft', { id: 'd1' }, false)
		h.roots.register('Draft:d1')
		expect(sortedKeys(h.analyzer.computeReachableCreated())).toEqual(['Draft:d1'])

		h.meta.setExistsOnServer('Draft:d1', true)

		// Flipping the last created entity to a server entity invalidates the cache; the
		// recompute then takes the no-created-snapshot fast path (no node walk), so — as
		// in the root (un)register case — invalidation is proven by the result alone: a
		// stale cache would still report the old create instead of the empty set.
		expect(sortedKeys(h.analyzer.computeReachableCreated())).toEqual([]) // now a server entity, not a create
	})

	test('toggling persisting invalidates the cache', () => {
		const h = createHarness()
		// A created entity reachable from nothing: not a create on its own, but it
		// becomes live while it is persisting (the in-flight seed).
		h.entitySnapshots.setData('Comment:x1', 'x1', 'Comment', { id: 'x1' }, false)
		expect(sortedKeys(h.analyzer.computeReachableCreated())).toEqual([])
		const calls = h.walkCount()

		h.meta.setPersisting('Comment:x1', true)

		const result = h.analyzer.computeReachableCreated()
		expect(h.walkCount()).toBeGreaterThan(calls)
		expect(sortedKeys(result)).toEqual(['Comment:x1'])
	})

	test('registering and unregistering a root invalidates the cache', () => {
		const h = createHarness()
		h.entitySnapshots.setData('Draft:d2', 'd2', 'Draft', { id: 'd2' }, false)
		expect(sortedKeys(h.analyzer.computeReachableCreated())).toEqual([])

		h.roots.register('Draft:d2')
		expect(sortedKeys(h.analyzer.computeReachableCreated())).toEqual(['Draft:d2'])

		// A no-op unregister (key absent) must NOT change the result and stays correct.
		h.roots.unregister('Draft:absent')
		expect(sortedKeys(h.analyzer.computeReachableCreated())).toEqual(['Draft:d2'])

		h.roots.unregister('Draft:d2')
		expect(sortedKeys(h.analyzer.computeReachableCreated())).toEqual([])
	})

	test('end-to-end: SnapshotStore propagates bumps through getAllDirtyEntities', () => {
		const store = new SnapshotStore()
		store.setEntityData('Article', 'a1', { id: 'a1', title: 'T' }, true)
		const cId = store.createEntity('Comment', { text: 'c' })
		store.addToHasMany('Article', 'a1', 'comments', cId)
		store.registerParentChild('Article', 'a1', 'Comment', cId)

		const createIds = (): string[] =>
			store
				.getAllDirtyEntities()
				.filter(e => e.changeType === 'create')
				.map(e => e.entityId)

		expect(createIds()).toEqual([cId]) // populates the cache
		// A field edit must not stale the create set.
		store.setFieldValue('Article', 'a1', ['title'], 'Edited')
		expect(createIds()).toEqual([cId])
		// A graph change must be reflected, not served from a stale cache.
		store.removeFromHasMany('Article', 'a1', 'comments', cId, 'disconnect')
		expect(createIds()).toEqual([])
	})
})
