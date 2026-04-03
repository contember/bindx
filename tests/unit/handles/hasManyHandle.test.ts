import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	EventEmitter,
	HasManyListHandle,
	SchemaRegistry,
	type SchemaDefinition,
	type HasManyAccessor,
	isTempId,
} from '@contember/bindx'
import { createTestDispatcher } from '../shared/unitTestHelpers.js'

// Test schema
interface TestArticle {
	id: string
	title: string
	tags?: Array<{ id: string; name: string }>
}

interface TestTag {
	id: string
	name: string
	color?: string
}

interface TestSchema {
	Article: TestArticle
	Tag: TestTag
	[key: string]: object
}

const testSchemaDefinition: SchemaDefinition<TestSchema> = {
	entities: {
		Article: {
			fields: {
				id: { type: 'scalar' },
				title: { type: 'scalar' },
				tags: { type: 'hasMany', target: 'Tag' },
			},
		},
		Tag: {
			fields: {
				id: { type: 'scalar' },
				name: { type: 'scalar' },
				color: { type: 'scalar' },
			},
		},
	},
}

describe('HasManyListHandle', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let eventEmitter: EventEmitter
	let schema: SchemaRegistry<TestSchema>

	beforeEach(() => {
		const setup = createTestDispatcher()
		store = setup.store
		dispatcher = setup.dispatcher
		eventEmitter = setup.eventEmitter
		schema = new SchemaRegistry(testSchemaDefinition)
	})

	function createHasManyHandle(): HasManyAccessor<TestTag> {
		return HasManyListHandle.create<TestTag>(
			'Article',
			'a-1',
			'tags',
			'Tag',
			store,
			dispatcher,
			schema,
		)
	}

	// ==================== Items Access ====================

	describe('Items Access', () => {
		test('should return empty array when no data', () => {
			const handle = createHasManyHandle()
			expect(handle.items).toEqual([])
		})

		test('should return items from embedded data', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [
					{ id: 't-1', name: 'Tag 1' },
					{ id: 't-2', name: 'Tag 2' },
				],
			}, true)

			const handle = createHasManyHandle()

			expect(handle.items.length).toBe(2)
			expect(handle.items[0]?.id as string).toBe('t-1')
			expect(handle.items[1]?.id as string).toBe('t-2')
		})

		test('should exclude planned removals', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [
					{ id: 't-1', name: 'Tag 1' },
					{ id: 't-2', name: 'Tag 2' },
				],
			}, true)
			// Initialize hasMany state first with server IDs
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2'])
			store.planHasManyRemoval('Article', 'a-1', 'tags', 't-1', 'disconnect')

			const handle = createHasManyHandle()

			expect(handle.items.length).toBe(1)
			expect(handle.items[0]?.id as string).toBe('t-2')
		})

		test('should include planned connections', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)
			store.setEntityData('Tag', 't-2', { id: 't-2', name: 'Tag 2' }, true)

			// Initialize hasMany state first (simulating what handle.items would do)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])
			store.planHasManyConnection('Article', 'a-1', 'tags', 't-2')

			const handle = createHasManyHandle()

			expect(handle.items.length).toBe(2)
		})
	})

	// ==================== Length ====================

	describe('Length', () => {
		test('should return correct length', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [
					{ id: 't-1', name: 'Tag 1' },
					{ id: 't-2', name: 'Tag 2' },
					{ id: 't-3', name: 'Tag 3' },
				],
			}, true)

			const handle = createHasManyHandle()

			expect(handle.length).toBe(3)
		})
	})

	// ==================== Map ====================

	describe('Map', () => {
		test('should map over items', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [
					{ id: 't-1', name: 'Tag 1' },
					{ id: 't-2', name: 'Tag 2' },
				],
			}, true)

			const handle = createHasManyHandle()
			const ids = handle.map((item) => item.id as string)

			expect(ids).toEqual(['t-1', 't-2'])
		})

		test('should provide index in map callback', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [
					{ id: 't-1', name: 'Tag 1' },
					{ id: 't-2', name: 'Tag 2' },
				],
			}, true)

			const handle = createHasManyHandle()
			const indices: number[] = []
			handle.map((_, index) => {
				indices.push(index)
			})

			expect(indices).toEqual([0, 1])
		})
	})

	// ==================== Dirty State ====================

	describe('Dirty State', () => {
		test('should return false when no changes', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = createHasManyHandle()

			expect(handle.isDirty).toBe(false)
		})

		test('should return true when has planned removals', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)
			store.planHasManyRemoval('Article', 'a-1', 'tags', 't-1', 'disconnect')

			const handle = createHasManyHandle()

			expect(handle.isDirty).toBe(true)
		})

		test('should return true when has planned connections', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [],
			}, true)
			store.planHasManyConnection('Article', 'a-1', 'tags', 't-1')

			const handle = createHasManyHandle()

			expect(handle.isDirty).toBe(true)
		})

		test('should return true when has created entities', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [],
			}, true)
			store.addToHasMany('Article', 'a-1', 'tags', '__temp_123')

			const handle = createHasManyHandle()

			expect(handle.isDirty).toBe(true)
		})
	})

	// ==================== Connect / Disconnect ====================

	describe('Connect / Disconnect', () => {
		test('should connect existing entity', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [],
			}, true)

			const handle = createHasManyHandle()
			handle.connect('t-1')

			const plannedConnections = store.getHasManyPlannedConnections('Article', 'a-1', 'tags')
			expect(plannedConnections?.has('t-1')).toBe(true)
		})

		test('should disconnect entity', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = createHasManyHandle()
			handle.disconnect('t-1')

			const plannedRemovals = store.getHasManyPlannedRemovals('Article', 'a-1', 'tags')
			expect(plannedRemovals?.has('t-1')).toBe(true)
		})
	})

	// ==================== Add / Remove ====================

	describe('Add / Remove', () => {
		test('should add new entity and return temp ID', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [],
			}, true)

			const handle = createHasManyHandle()
			const tempId = handle.add({ name: 'New Tag' })

			expect(isTempId(tempId)).toBe(true)
			expect(store.hasEntity('Tag', tempId)).toBe(true)
		})

		test('should add entity to items list', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = createHasManyHandle()
			// Access items first to initialize hasMany state with server IDs
			expect(handle.items.length).toBe(1)

			const tempId = handle.add({ name: 'New Tag' })

			expect(handle.items.length).toBe(2)
			expect(handle.items[1]?.id as string).toBe(tempId)
		})

		test('should remove created entity (cancel add)', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [],
			}, true)

			const handle = createHasManyHandle()
			const tempId = handle.add({ name: 'New Tag' })

			handle.remove(tempId)

			const state = store.getHasMany('Article', 'a-1', 'tags')
			expect(state?.createdEntities.has(tempId)).toBe(false)
			expect(state?.plannedConnections.has(tempId)).toBe(false)
		})

		test('should remove server entity (plan disconnect)', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = createHasManyHandle()
			// Access items first to initialize hasMany state
			expect(handle.items.length).toBe(1)

			handle.remove('t-1')

			const plannedRemovals = store.getHasManyPlannedRemovals('Article', 'a-1', 'tags')
			expect(plannedRemovals?.has('t-1')).toBe(true)
			expect(plannedRemovals?.get('t-1')).toBe('disconnect')
		})

		test('should remove server entity with delete mode', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = createHasManyHandle()
			expect(handle.items.length).toBe(1)

			handle.remove('t-1', 'delete')

			const plannedRemovals = store.getHasManyPlannedRemovals('Article', 'a-1', 'tags')
			expect(plannedRemovals?.has('t-1')).toBe(true)
			expect(plannedRemovals?.get('t-1')).toBe('delete')
		})

		test('should remove server entity with explicit disconnect mode', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = createHasManyHandle()
			expect(handle.items.length).toBe(1)

			handle.remove('t-1', 'disconnect')

			const plannedRemovals = store.getHasManyPlannedRemovals('Article', 'a-1', 'tags')
			expect(plannedRemovals?.has('t-1')).toBe(true)
			expect(plannedRemovals?.get('t-1')).toBe('disconnect')
		})

		test('should exclude delete-mode removals from items', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [
					{ id: 't-1', name: 'Tag 1' },
					{ id: 't-2', name: 'Tag 2' },
				],
			}, true)

			const handle = createHasManyHandle()
			expect(handle.items.length).toBe(2)

			handle.remove('t-1', 'delete')

			expect(handle.items.length).toBe(1)
			expect(handle.items[0]?.id as string).toBe('t-2')
		})
	})

	// ==================== Move ====================

	describe('Move', () => {
		test('should move item within list', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [
					{ id: 't-1', name: 'Tag 1' },
					{ id: 't-2', name: 'Tag 2' },
					{ id: 't-3', name: 'Tag 3' },
				],
			}, true)

			const handle = createHasManyHandle()
			// Access items first to initialize hasMany state
			expect(handle.items.length).toBe(3)

			handle.move(0, 2)

			const orderedIds = store.getHasManyOrderedIds('Article', 'a-1', 'tags')
			expect(orderedIds).toEqual(['t-2', 't-3', 't-1'])
		})
	})

	// ==================== Reset ====================

	describe('Reset', () => {
		test('should reset to server state', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)
			// Initialize hasMany state first with server IDs
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])
			store.planHasManyRemoval('Article', 'a-1', 'tags', 't-1', 'disconnect')
			store.planHasManyConnection('Article', 'a-1', 'tags', 't-2')

			const handle = createHasManyHandle()
			handle.reset()

			const state = store.getHasMany('Article', 'a-1', 'tags')
			expect(state?.plannedRemovals.size).toBe(0)
			expect(state?.plannedConnections.size).toBe(0)
		})
	})

	// ==================== Item Handle ====================

	describe('Item Handle', () => {
		test('should get item handle by ID', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = createHasManyHandle()
			const itemHandle = handle.getById('t-1')

			expect(itemHandle.id as string).toBe('t-1')
		})

		test('should cache item handles', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = createHasManyHandle()
			const handle1 = handle.getById('t-1')
			const handle2 = handle.getById('t-1')

			expect(handle1).toBe(handle2)
		})
	})

	// ==================== getById ====================

	describe('getById', () => {
		test('should return entity accessor by ID', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [
					{ id: 't-1', name: 'Tag 1' },
					{ id: 't-2', name: 'Tag 2' },
				],
			}, true)

			const handle = createHasManyHandle()
			// Initialize items first
			expect(handle.items.length).toBe(2)

			const item = handle.getById('t-1')
			expect(item.id as string).toBe('t-1')
		})

		test('should work for newly created entities via add()', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [],
			}, true)

			const handle = createHasManyHandle()
			const tempId = handle.add({ name: 'New Tag' })

			const item = handle.getById(tempId)
			expect(item.id as string).toBe(tempId)
		})

		test('should return cached handle (same instance)', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = createHasManyHandle()
			const item1 = handle.getById('t-1')
			const item2 = handle.getById('t-1')

			expect(item1).toBe(item2)
		})
	})

	// ==================== Errors ====================

	describe('Errors', () => {
		test('should return relation errors', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test', tags: [] }, true)
			store.addRelationError('Article', 'a-1', 'tags', { message: 'At least one tag required', source: 'client' })

			const handle = createHasManyHandle()

			expect(handle.errors.length).toBe(1)
			expect(handle.errors[0]?.message).toBe('At least one tag required')
		})

		test('should check if relation has errors', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test', tags: [] }, true)
			const handle = createHasManyHandle()

			expect(handle.hasError).toBe(false)

			store.addRelationError('Article', 'a-1', 'tags', { message: 'Error', source: 'client' })
			expect(handle.hasError).toBe(true)
		})

		test('should add error via addError()', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test', tags: [] }, true)
			const handle = createHasManyHandle()

			handle.addError({ message: 'Tags required' })

			expect(store.getRelationErrors('Article', 'a-1', 'tags').length).toBe(1)
		})

		test('should clear errors via clearErrors()', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test', tags: [] }, true)
			store.addRelationError('Article', 'a-1', 'tags', { message: 'Error', source: 'client' })

			const handle = createHasManyHandle()
			handle.clearErrors()

			expect(store.getRelationErrors('Article', 'a-1', 'tags').length).toBe(0)
		})
	})

	// ==================== Event Subscriptions ====================

	describe('Event Subscriptions', () => {
		test('should register event listener without error', () => {
			// Note: The ADD_TO_LIST action doesn't emit hasMany:connected events in the current implementation.
			// This test verifies that the subscription mechanism works, not that events are emitted.
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test', tags: [] }, true)
			const handle = createHasManyHandle()

			const listener = mock(() => {})
			const unsubscribe = handle.onItemConnected(listener)

			// Verify subscription returns an unsubscribe function
			expect(typeof unsubscribe).toBe('function')

			// Cleanup
			unsubscribe()
		})
	})

	// ==================== Type Brands ====================

	describe('Type Brands', () => {
		test('should return item entity name via __entityName', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test', tags: [] }, true)
			const handle = createHasManyHandle()

			expect(handle.__entityName).toBe('Tag')
		})
	})
})
