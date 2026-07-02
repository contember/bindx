import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { SnapshotStore } from '@contember/bindx'

describe('Subscription migration after mapTempIdToPersistedId', () => {
	let store: SnapshotStore

	beforeEach(() => {
		store = new SnapshotStore()
	})

	test('entity subscriber migrated to persisted key is notified on field change', () => {
		const tempId = store.createEntity('Article', { title: 'Draft' })
		const callback = mock(() => {})

		// Subscribe using temp ID (simulates useAccessor / useSyncExternalStore)
		store.subscribeToEntity('Article', tempId, callback)

		// Clear call count from subscription setup
		callback.mockClear()

		// Map temp ID to persisted ID
		store.mapTempIdToPersistedId('Article', tempId, 'real-uuid-1')

		// Clear calls from the mapTempIdToPersistedId notification
		callback.mockClear()

		// Modify entity via temp ID (EntityHandle still holds old ID)
		store.setFieldValue('Article', tempId, ['title'], 'Updated')

		// Subscriber should have been called because subscription was migrated
		expect(callback).toHaveBeenCalledTimes(1)
	})

	test('entity subscriber migrated to persisted key is notified on commitEntity', () => {
		const tempId = store.createEntity('Article', { title: 'Draft' })
		const callback = mock(() => {})

		store.subscribeToEntity('Article', tempId, callback)
		store.mapTempIdToPersistedId('Article', tempId, 'real-uuid-2')
		callback.mockClear()

		// commitEntity should notify migrated subscribers
		store.commitEntity('Article', tempId)

		expect(callback).toHaveBeenCalledTimes(1)
	})

	test('getEntitySnapshot resolves temp ID to persisted snapshot', () => {
		const tempId = store.createEntity('Article', { title: 'Draft' })
		store.mapTempIdToPersistedId('Article', tempId, 'real-uuid-3')

		// Lookup by temp ID should redirect
		const snapshotByTemp = store.getEntitySnapshot('Article', tempId)
		expect(snapshotByTemp).not.toBeUndefined()
		expect(snapshotByTemp!.id).toBe('real-uuid-3')

		// Lookup by persisted ID should also work
		const snapshotByPersisted = store.getEntitySnapshot('Article', 'real-uuid-3')
		expect(snapshotByPersisted).not.toBeUndefined()
		expect(snapshotByPersisted!.id).toBe('real-uuid-3')

		// Both should return the same snapshot
		expect(snapshotByTemp).toBe(snapshotByPersisted)
	})

	test('field modifications via old temp ID dispatch to the right entity', () => {
		const tempId = store.createEntity('Article', { title: 'Draft' })
		store.mapTempIdToPersistedId('Article', tempId, 'real-uuid-4')

		// Modify via temp ID
		store.setFieldValue('Article', tempId, ['title'], 'Updated via temp')

		// Read via persisted ID — should see the update
		const snapshot = store.getEntitySnapshot('Article', 'real-uuid-4')
		expect(snapshot).not.toBeUndefined()
		expect((snapshot!.data as Record<string, unknown>)['title']).toBe('Updated via temp')
	})

	test('relation subscriber migrated to persisted key is notified on relation change', () => {
		const tempId = store.createEntity('Article', { title: 'Draft' })
		const callback = mock(() => {})

		// Create initial relation state
		store.getOrCreateRelation('Article', tempId, 'author', {
			currentId: null,
			serverId: null,
			state: 'disconnected',
			serverState: 'disconnected',
			placeholderData: {},
		})

		// Subscribe to relation using temp ID
		store.subscribeToRelation('Article', tempId, 'author', callback)
		callback.mockClear()

		// Map temp ID to persisted ID
		store.mapTempIdToPersistedId('Article', tempId, 'real-uuid-5')
		callback.mockClear()

		// Modify the relation via temp ID
		store.setRelation('Article', tempId, 'author', {
			currentId: 'author-1',
			state: 'connected',
		})

		// Relation subscriber should have been called
		expect(callback).toHaveBeenCalledTimes(1)
	})

	test('hasMany relation operations work after temp ID mapping', () => {
		const parentId = store.createEntity('Author', { name: 'John' })
		const childId = store.createEntity('Article', { title: 'Draft' })

		store.getOrCreateHasMany('Author', parentId, 'articles', [])
		store.addToHasMany('Author', parentId, 'articles', childId)

		const callback = mock(() => {})
		store.subscribeToRelation('Author', parentId, 'articles', callback)
		callback.mockClear()

		// Map parent to persisted ID
		store.mapTempIdToPersistedId('Author', parentId, 'author-uuid')
		callback.mockClear()

		// Add another entity via old temp ID
		const childId2 = store.createEntity('Article', { title: 'Second' })
		store.addToHasMany('Author', parentId, 'articles', childId2)

		// Subscriber should be notified
		expect(callback).toHaveBeenCalledTimes(1)

		// Data should be accessible via persisted ID
		const orderedIds = store.getHasManyOrderedIds('Author', 'author-uuid', 'articles')
		expect(orderedIds).toContain(childId2)
	})

	test('new subscriptions via temp ID after mapping work correctly', () => {
		const tempId = store.createEntity('Article', { title: 'Draft' })
		store.mapTempIdToPersistedId('Article', tempId, 'real-uuid-6')

		// Subscribe AFTER mapping using old temp ID — should resolve to new key
		const callback = mock(() => {})
		store.subscribeToEntity('Article', tempId, callback)
		callback.mockClear()

		// Modify via persisted ID
		store.setFieldValue('Article', 'real-uuid-6', ['title'], 'Changed')

		expect(callback).toHaveBeenCalledTimes(1)
	})

	test('useSyncExternalStore re-subscribe pattern: unsub old → sub new with temp ID', () => {
		const tempId = store.createEntity('Article', { title: 'Draft' })

		// Step 1: Initial subscribe (before rekey) — simulates first render
		const cb1 = mock(() => {})
		const unsub1 = store.subscribeToEntity('Article', tempId, cb1)

		// Step 2: mapTempIdToPersistedId — subscribers moved
		store.mapTempIdToPersistedId('Article', tempId, 'real-uuid-resub')
		cb1.mockClear()

		// Step 3: Simulate useSyncExternalStore re-subscribe on re-render
		// React calls old unsub, then subscribes with new callback using same temp ID
		unsub1()
		const cb2 = mock(() => {})
		const unsub2 = store.subscribeToEntity('Article', tempId, cb2)

		// Step 4: Modify entity — new subscriber should be notified
		store.setFieldValue('Article', tempId, ['title'], 'Updated after resub')

		expect(cb1).not.toHaveBeenCalled() // old callback was unsubscribed
		expect(cb2).toHaveBeenCalledTimes(1) // new callback should fire

		unsub2()
	})

	test('useSyncExternalStore re-subscribe for relation: unsub old → sub new with temp ID', () => {
		const tempId = store.createEntity('Article', { title: 'Draft' })

		store.getOrCreateRelation('Article', tempId, 'author', {
			currentId: null,
			serverId: null,
			state: 'disconnected',
			serverState: 'disconnected',
			placeholderData: {},
		})

		// Step 1: Subscribe to relation before rekey
		const cb1 = mock(() => {})
		const unsub1 = store.subscribeToRelation('Article', tempId, 'author', cb1)

		// Step 2: Rekey
		store.mapTempIdToPersistedId('Article', tempId, 'real-uuid-relsub')
		cb1.mockClear()

		// Step 3: useSyncExternalStore re-subscribes
		unsub1()
		const cb2 = mock(() => {})
		store.subscribeToRelation('Article', tempId, 'author', cb2)

		// Step 4: Modify relation
		store.setRelation('Article', tempId, 'author', {
			currentId: 'author-1',
			state: 'connected',
		})

		expect(cb1).not.toHaveBeenCalled()
		expect(cb2).toHaveBeenCalledTimes(1)
	})

	test('parent-child propagation works after temp ID mapping', () => {
		const parentId = store.createEntity('Author', { name: 'John' })
		const childId = store.createEntity('Article', { title: 'Draft' })

		// Establish a live relation edge — parent notification is derived from it.
		store.setRelation('Author', parentId, 'featuredArticle', { currentId: childId, state: 'connected' })
		store.registerParentChild('Author', parentId, 'Article', childId)

		const parentCallback = mock(() => {})
		store.subscribeToEntity('Author', parentId, parentCallback)
		parentCallback.mockClear()

		// Map child ID
		store.mapTempIdToPersistedId('Article', childId, 'article-uuid')
		parentCallback.mockClear()

		// Modify child — parent should be notified via propagation
		store.setFieldValue('Article', childId, ['title'], 'Updated')

		expect(parentCallback).toHaveBeenCalled()
	})

	test('3-level deep parent-child propagation after rekeying all nested entities', () => {
		// Simulates: Program (server) → Approval (temp) → Round (temp) → Review (temp)
		// Only the root (Program) has a direct subscriber. Changes on Review must
		// propagate up through childToParents to notify Program's subscriber.

		// Setup root entity (exists on server, has direct subscriber)
		store.setEntityData('Program', 'prog-1', { id: 'prog-1', name: 'Test' }, true)

		// Create nested entities with temp IDs
		const approvalId = store.createEntity('Approval', { status: 'pending' })
		const roundId = store.createEntity('Round', { roundNumber: 1 })
		const reviewId = store.createEntity('Review', { comment: 'initial' })

		// Establish live relation edges down the chain — parent notification is
		// derived from these. registerParentChild also un-roots each anchored child.
		store.setRelation('Program', 'prog-1', 'approval', { currentId: approvalId, state: 'connected' })
		store.setRelation('Approval', approvalId, 'round', { currentId: roundId, state: 'connected' })
		store.setRelation('Round', roundId, 'review', { currentId: reviewId, state: 'connected' })
		store.registerParentChild('Program', 'prog-1', 'Approval', approvalId)
		store.registerParentChild('Approval', approvalId, 'Round', roundId)
		store.registerParentChild('Round', roundId, 'Review', reviewId)

		// Subscribe only to root entity (simulates useAccessor on root)
		const rootCallback = mock(() => {})
		store.subscribeToEntity('Program', 'prog-1', rootCallback)
		rootCallback.mockClear()

		// Simulate persist: rekey all nested entities (parent → child order)
		store.mapTempIdToPersistedId('Approval', approvalId, 'uuid-approval')
		store.mapTempIdToPersistedId('Round', roundId, 'uuid-round')
		store.mapTempIdToPersistedId('Review', reviewId, 'uuid-review')
		rootCallback.mockClear()

		// Modify the deepest entity (Review) via temp ID
		store.setFieldValue('Review', reviewId, ['comment'], 'updated comment')

		// Root subscriber must be notified through parent-child chain
		expect(rootCallback).toHaveBeenCalled()
	})

	test('3-level propagation: second persist after rekey notifies root', () => {
		// Same scenario but with: create → persist → modify → persist again
		// The second persist's commitEntity must propagate to root.

		store.setEntityData('Program', 'prog-1', { id: 'prog-1', name: 'Test' }, true)
		const approvalId = store.createEntity('Approval', { status: 'pending' })
		const roundId = store.createEntity('Round', { roundNumber: 1 })
		const reviewId = store.createEntity('Review', { comment: 'initial' })

		store.setRelation('Program', 'prog-1', 'approval', { currentId: approvalId, state: 'connected' })
		store.setRelation('Approval', approvalId, 'round', { currentId: roundId, state: 'connected' })
		store.setRelation('Round', roundId, 'review', { currentId: reviewId, state: 'connected' })
		store.registerParentChild('Program', 'prog-1', 'Approval', approvalId)
		store.registerParentChild('Approval', approvalId, 'Round', roundId)
		store.registerParentChild('Round', roundId, 'Review', reviewId)

		const rootCallback = mock(() => {})
		store.subscribeToEntity('Program', 'prog-1', rootCallback)

		// First persist: rekey all nested entities
		store.mapTempIdToPersistedId('Approval', approvalId, 'uuid-approval')
		store.mapTempIdToPersistedId('Round', roundId, 'uuid-round')
		store.mapTempIdToPersistedId('Review', reviewId, 'uuid-review')
		rootCallback.mockClear()

		// Modify review (second user action)
		store.setFieldValue('Review', reviewId, ['comment'], 'changed')
		rootCallback.mockClear()

		// Second persist: commitEntity on the review
		store.commitEntity('Review', reviewId)

		// Root must be notified
		expect(rootCallback).toHaveBeenCalled()
	})

	test('parent-child re-registration via temp ID after rekey resolves correctly', () => {
		// Simulates handles re-registering parent-child during re-render
		// after rekey, using the original temp IDs (which resolve via getEntityKey).

		store.setEntityData('Program', 'prog-1', { id: 'prog-1', name: 'Test' }, true)
		const approvalId = store.createEntity('Approval', { status: 'pending' })
		const roundId = store.createEntity('Round', { roundNumber: 1 })

		// Initial relation edges + parent-child registration
		store.setRelation('Program', 'prog-1', 'approval', { currentId: approvalId, state: 'connected' })
		store.setRelation('Approval', approvalId, 'round', { currentId: roundId, state: 'connected' })
		store.registerParentChild('Program', 'prog-1', 'Approval', approvalId)
		store.registerParentChild('Approval', approvalId, 'Round', roundId)

		// Rekey
		store.mapTempIdToPersistedId('Approval', approvalId, 'uuid-approval')
		store.mapTempIdToPersistedId('Round', roundId, 'uuid-round')

		// Re-register via temp IDs (simulates handle re-render)
		store.registerParentChild('Program', 'prog-1', 'Approval', approvalId)
		store.registerParentChild('Approval', approvalId, 'Round', roundId)

		const rootCallback = mock(() => {})
		store.subscribeToEntity('Program', 'prog-1', rootCallback)
		rootCallback.mockClear()

		// Modify round
		store.setFieldValue('Round', roundId, ['roundNumber'], 2)

		expect(rootCallback).toHaveBeenCalled()
	})

	test('parent-child registered AFTER rekey without prior registration still works', () => {
		// Simulates entities materialized during mutation building:
		// they have no parent-child registration before persist.
		// After persist+rekey, handles register parent-child during first render.

		store.setEntityData('Program', 'prog-1', { id: 'prog-1', name: 'Test' }, true)
		const roundId = store.createEntity('Round', { roundNumber: 1 })
		const reviewId = store.createEntity('Review', { comment: 'init' })

		// Rekey WITHOUT any prior relation edge / registerParentChild
		store.mapTempIdToPersistedId('Round', roundId, 'uuid-round')
		store.mapTempIdToPersistedId('Review', reviewId, 'uuid-review')

		// Now handles establish the relation edges + register parent-child (during
		// render AFTER persist) using temp IDs — getRelationKey/getEntityKey resolve
		// them to the persisted keys/ids, so notification follows the live edges.
		store.setRelation('Program', 'prog-1', 'round', { currentId: 'uuid-round', state: 'connected' })
		store.setRelation('Round', roundId, 'review', { currentId: 'uuid-review', state: 'connected' })
		store.registerParentChild('Program', 'prog-1', 'Round', roundId)
		store.registerParentChild('Round', roundId, 'Review', reviewId)

		const rootCallback = mock(() => {})
		store.subscribeToEntity('Program', 'prog-1', rootCallback)
		rootCallback.mockClear()

		// Modify review via temp ID
		store.setFieldValue('Review', reviewId, ['comment'], 'changed')

		// Root subscriber must be notified through parent-child
		expect(rootCallback).toHaveBeenCalled()
	})

	test('child-to-parents reverse order rekey preserves chain', () => {
		// Rekey in child-first order (opposite of hierarchical order)
		// to verify the chain update handles any order.

		store.setEntityData('Root', 'root-1', { id: 'root-1' }, true)
		const parentId = store.createEntity('Parent', { data: 1 })
		const childId = store.createEntity('Child', { data: 2 })

		// Live relation edges drive notification; replaceEntityId migrates the stored
		// currentId references when each end is rekeyed, in either order.
		store.setRelation('Root', 'root-1', 'child', { currentId: parentId, state: 'connected' })
		store.setRelation('Parent', parentId, 'child', { currentId: childId, state: 'connected' })
		store.registerParentChild('Root', 'root-1', 'Parent', parentId)
		store.registerParentChild('Parent', parentId, 'Child', childId)

		// Rekey child FIRST, then parent (reverse hierarchical order)
		store.mapTempIdToPersistedId('Child', childId, 'uuid-child')
		store.mapTempIdToPersistedId('Parent', parentId, 'uuid-parent')

		const rootCallback = mock(() => {})
		store.subscribeToEntity('Root', 'root-1', rootCallback)
		rootCallback.mockClear()

		// Modify child
		store.setFieldValue('Child', childId, ['data'], 99)

		expect(rootCallback).toHaveBeenCalled()
	})
})
