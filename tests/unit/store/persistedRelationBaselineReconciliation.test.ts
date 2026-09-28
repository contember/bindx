import { describe, expect, test } from 'bun:test'
import { SnapshotStore, generateHasManyAlias } from '@contember/bindx'

const parentType = 'Article'
const parentId = 'article-1'

function seedHasOne(store: SnapshotStore, targetId: string): void {
	store.getOrCreateRelation(parentType, parentId, 'author', {
		currentId: targetId,
		serverId: targetId,
		state: 'connected',
		serverState: 'connected',
		placeholderData: {},
	})
}

describe('persisted relation baseline reconciliation', () => {
	test('has-one sent connect advances server B while current C stays dirty', () => {
		const store = new SnapshotStore()
		store.getOrCreateRelation(parentType, parentId, 'author', {
			currentId: null,
			serverId: null,
			state: 'disconnected',
			serverState: 'disconnected',
			placeholderData: {},
		})
		store.setRelation(parentType, parentId, 'author', { currentId: 'B', state: 'connected' })
		store.setRelation(parentType, parentId, 'author', { currentId: 'C', state: 'connected' })

		const result = store.reconcileSentRelation(parentType, parentId, 'author', {
			operation: 'connect',
			targetId: 'B',
		})
		const state = store.getRelation(parentType, parentId, 'author')

		expect(result).toBe('applied')
		expect(state?.serverId).toBe('B')
		expect(state?.currentId).toBe('C')
		expect(state?.state).toBe('connected')
		expect(store.getDirtyRelations(parentType, parentId)).toContain('author')
	})

	test('has-one disconnect reversal becomes a pending connect', () => {
		const store = new SnapshotStore()
		seedHasOne(store, 'B')
		store.setRelation(parentType, parentId, 'author', { currentId: null, state: 'disconnected' })
		store.setRelation(parentType, parentId, 'author', { currentId: 'B', state: 'connected' })

		const result = store.reconcileSentRelation(parentType, parentId, 'author', {
			operation: 'disconnect',
			targetId: 'B',
		})
		const state = store.getRelation(parentType, parentId, 'author')

		expect(result).toBe('applied')
		expect(state?.serverId).toBeNull()
		expect(state?.currentId).toBe('B')
		expect(state?.state).toBe('connected')
	})

	test('has-one delete reversal to the deleted target is a conflict', () => {
		const store = new SnapshotStore()
		seedHasOne(store, 'B')
		store.setRelation(parentType, parentId, 'author', { state: 'deleted' })
		store.setRelation(parentType, parentId, 'author', { currentId: 'B', state: 'connected' })

		const result = store.reconcileSentRelation(parentType, parentId, 'author', {
			operation: 'delete',
			targetId: 'B',
		})
		const state = store.getRelation(parentType, parentId, 'author')

		expect(result).toBe('conflict')
		expect(state?.serverId).toBeNull()
		expect(state?.currentId).toBe('B')
		expect(state?.state).toBe('connected')
	})

	test('has-many sent connect keeps a later disconnect B and connect C pending', () => {
		const store = new SnapshotStore()
		store.getOrCreateHasMany(parentType, parentId, 'tags', [])
		store.planHasManyConnection(parentType, parentId, 'tags', 'B')
		store.removeFromHasMany(parentType, parentId, 'tags', 'B', 'disconnect')
		store.planHasManyConnection(parentType, parentId, 'tags', 'C')

		const result = store.reconcileSentHasMany(parentType, parentId, 'tags', {
			additions: [{ itemId: 'B', kind: 'connected' }],
			removals: [],
		})
		const state = store.getHasMany(parentType, parentId, 'tags')

		expect(result).toBe('applied')
		expect(state?.serverIds).toEqual(new Set(['B']))
		expect(state?.plannedRemovals).toEqual(new Map([['B', 'disconnect']]))
		expect(state?.plannedAdditions).toEqual(new Map([['C', 'connected']]))
	})

	test('sent created item removed while awaiting becomes a pending delete', () => {
		const store = new SnapshotStore()
		store.getOrCreateHasMany(parentType, parentId, 'tags', [])
		store.addToHasMany(parentType, parentId, 'tags', 'B')
		store.removeFromHasMany(parentType, parentId, 'tags', 'B', 'disconnect')

		const result = store.reconcileSentHasMany(parentType, parentId, 'tags', {
			additions: [{ itemId: 'B', kind: 'created' }],
			removals: [],
		})
		const state = store.getHasMany(parentType, parentId, 'tags')

		expect(result).toBe('applied')
		expect(state?.serverIds).toEqual(new Set(['B']))
		expect(state?.plannedRemovals).toEqual(new Map([['B', 'delete']]))
		expect(store.getHasManyOrderedIds(parentType, parentId, 'tags')).toEqual([])
	})

	test('reversing a sent disconnect keeps a pending connection', () => {
		const store = new SnapshotStore()
		store.getOrCreateHasMany(parentType, parentId, 'tags', ['B'])
		store.removeFromHasMany(parentType, parentId, 'tags', 'B', 'disconnect')
		store.planHasManyConnection(parentType, parentId, 'tags', 'B')

		const result = store.reconcileSentHasMany(parentType, parentId, 'tags', {
			additions: [],
			removals: [{ itemId: 'B', type: 'disconnect' }],
		})
		const state = store.getHasMany(parentType, parentId, 'tags')

		expect(result).toBe('applied')
		expect(state?.serverIds).toEqual(new Set())
		expect(state?.plannedAdditions).toEqual(new Map([['B', 'connected']]))
	})

	test('reversing a sent delete to the deleted item is a conflict', () => {
		const store = new SnapshotStore()
		store.getOrCreateHasMany(parentType, parentId, 'tags', ['B'])
		store.removeFromHasMany(parentType, parentId, 'tags', 'B', 'delete')
		store.planHasManyConnection(parentType, parentId, 'tags', 'B')

		const result = store.reconcileSentHasMany(parentType, parentId, 'tags', {
			additions: [],
			removals: [{ itemId: 'B', type: 'delete' }],
		})
		const state = store.getHasMany(parentType, parentId, 'tags')

		expect(result).toBe('conflict')
		expect(state?.serverIds).toEqual(new Set())
		expect(state?.plannedAdditions).toEqual(new Map([['B', 'connected']]))
	})

	test('disconnect after reversing a sent delete is complete when the delete succeeds', () => {
		const store = new SnapshotStore()
		store.getOrCreateHasMany(parentType, parentId, 'tags', ['B'])
		store.removeFromHasMany(parentType, parentId, 'tags', 'B', 'delete')
		store.planHasManyConnection(parentType, parentId, 'tags', 'B')
		store.removeFromHasMany(parentType, parentId, 'tags', 'B', 'disconnect')

		const result = store.reconcileSentHasMany(parentType, parentId, 'tags', {
			additions: [],
			removals: [{ itemId: 'B', type: 'delete' }],
		})
		const state = store.getHasMany(parentType, parentId, 'tags')

		expect(result).toBe('applied')
		expect(state?.serverIds).toEqual(new Set())
		expect(state?.plannedAdditions).toEqual(new Map())
		expect(state?.plannedRemovals).toEqual(new Map())
	})

	test('unrelated pending operations and explicit order survive', () => {
		const store = new SnapshotStore()
		store.getOrCreateHasMany(parentType, parentId, 'tags', ['A', 'D'])
		store.planHasManyConnection(parentType, parentId, 'tags', 'B')
		store.planHasManyConnection(parentType, parentId, 'tags', 'C')
		store.removeFromHasMany(parentType, parentId, 'tags', 'D', 'delete')
		store.moveInHasMany(parentType, parentId, 'tags', 0, 2)
		const orderBefore = store.getHasManyOrderedIds(parentType, parentId, 'tags')

		store.reconcileSentHasMany(parentType, parentId, 'tags', {
			additions: [{ itemId: 'B', kind: 'connected' }],
			removals: [],
		})
		const state = store.getHasMany(parentType, parentId, 'tags')

		expect(state?.serverIds).toEqual(new Set(['A', 'D', 'B']))
		expect(state?.plannedAdditions).toEqual(new Map([['C', 'connected']]))
		expect(state?.plannedRemovals).toEqual(new Map([['D', 'delete']]))
		expect(store.getHasManyOrderedIds(parentType, parentId, 'tags')).toEqual(orderBefore)
	})

	test('reconciliation changes mutation version but not editable counters', () => {
		const store = new SnapshotStore()
		store.getOrCreateRelation(parentType, parentId, 'author', {
			currentId: null,
			serverId: null,
			state: 'disconnected',
			serverState: 'disconnected',
			placeholderData: {},
		})
		store.setRelation(parentType, parentId, 'author', { currentId: 'B', state: 'connected' })
		store.getOrCreateHasMany(parentType, parentId, 'tags', [])
		store.planHasManyConnection(parentType, parentId, 'tags', 'B')
		const editableBefore = store.getEditableWriteCounters()
		const beforeHasOne = store.getDirtyVersion()

		store.reconcileSentRelation(parentType, parentId, 'author', {
			operation: 'connect',
			targetId: 'B',
		})
		const afterHasOne = store.getDirtyVersion()

		store.reconcileSentHasMany(parentType, parentId, 'tags', {
			additions: [{ itemId: 'B', kind: 'connected' }],
			removals: [],
		})

		expect(store.getEditableWriteCounters()).toEqual(editableBefore)
		expect(afterHasOne).toBeGreaterThan(beforeHasOne)
		expect(store.getDirtyVersion()).toBeGreaterThan(afterHasOne)
	})

	test('each SnapshotStore reconciliation call emits one relation notification', () => {
		const store = new SnapshotStore()
		store.getOrCreateRelation(parentType, parentId, 'author', {
			currentId: null,
			serverId: null,
			state: 'disconnected',
			serverState: 'disconnected',
			placeholderData: {},
		})
		store.setRelation(parentType, parentId, 'author', { currentId: 'B', state: 'connected' })
		store.getOrCreateHasMany(parentType, parentId, 'tags', [])
		store.planHasManyConnection(parentType, parentId, 'tags', 'B')
		let hasOneNotifications = 0
		let hasManyNotifications = 0
		store.subscribeToRelation(parentType, parentId, 'author', () => {
			hasOneNotifications++
		})
		store.subscribeToRelation(parentType, parentId, 'tags', () => {
			hasManyNotifications++
		})

		store.reconcileSentRelation(parentType, parentId, 'author', {
			operation: 'connect',
			targetId: 'B',
		})

		store.reconcileSentHasMany(parentType, parentId, 'tags', {
			additions: [{ itemId: 'B', kind: 'connected' }],
			removals: [],
		})

		expect(hasOneNotifications).toBe(1)
		expect(hasManyNotifications).toBe(1)
	})
})

describe('reconciling a relation read only through args-views', () => {
	const active = generateHasManyAlias('tags', { filter: { active: true } })
	const inactive = generateHasManyAlias('tags', { filter: { active: false } })

	test('a confirmed addition no view can claim still joins the baseline', () => {
		const store = new SnapshotStore()
		store.getOrCreateHasMany(parentType, parentId, 'tags', ['A'], active)
		store.planHasManyConnection(parentType, parentId, 'tags', 'B', active)
		// The user cancels while the request is in flight, so nothing is left to say
		// which view B belongs to — and every mounted view is filtered.
		store.removeFromHasMany(parentType, parentId, 'tags', 'B', 'disconnect')

		const result = store.reconcileSentHasMany(parentType, parentId, 'tags', {
			additions: [{ itemId: 'B', kind: 'connected' }],
			removals: [],
		})
		// Dropping the compensating removal must not lose the row: the server has it.
		store.resetHasMany(parentType, parentId, 'tags')

		expect(result).toBe('applied')
		expect(store.getHasMany(parentType, parentId, 'tags')?.serverIds).toEqual(new Set(['A', 'B']))
		// Parked in the unparameterized view, so no filtered view starts showing it.
		expect(store.getHasManyOrderedIds(parentType, parentId, 'tags', active)).toEqual(['A'])
		expect(store.getHasManyOrderedIds(parentType, parentId, 'tags')).toEqual(['B'])
	})

	test('a rebased disconnect reconnects only where the row was listed', () => {
		const store = new SnapshotStore()
		store.getOrCreateHasMany(parentType, parentId, 'tags', ['B'], active)
		store.getOrCreateHasMany(parentType, parentId, 'tags', [], inactive)
		store.removeFromHasMany(parentType, parentId, 'tags', 'B', 'disconnect')
		// Reverting the removal while the disconnect is in flight leaves B live through
		// the server baseline of the view that listed it, with no planned addition.
		store.resetHasMany(parentType, parentId, 'tags')

		const result = store.reconcileSentHasMany(parentType, parentId, 'tags', {
			additions: [],
			removals: [{ itemId: 'B', type: 'disconnect' }],
		})

		expect(result).toBe('applied')
		expect(store.getHasMany(parentType, parentId, 'tags')?.plannedAdditions).toEqual(new Map([['B', 'connected']]))
		expect(store.getHasManyOrderedIds(parentType, parentId, 'tags', active)).toEqual(['B'])
		// The other view never showed B and cannot evaluate its filter, so it must not
		// start claiming membership now.
		expect(store.getHasManyOrderedIds(parentType, parentId, 'tags', inactive)).toEqual([])
	})
})
