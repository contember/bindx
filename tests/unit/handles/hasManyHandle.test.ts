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

interface TestComment {
	id: string
	text: string
}

interface TestNote {
	id: string
	body: string
}

interface TestSchema {
	Article: TestArticle
	Tag: TestTag
	Comment: TestComment
	Note: TestNote
	[key: string]: object
}

const testSchemaDefinition: SchemaDefinition<TestSchema> = {
	entities: {
		Article: {
			fields: {
				id: { type: 'scalar' },
				title: { type: 'scalar' },
				tags: { type: 'hasMany', target: 'Tag', relationKind: 'manyHasMany' },
				comments: { type: 'hasMany', target: 'Comment', relationKind: 'oneHasMany' },
				notes: { type: 'hasMany', target: 'Note', relationKind: 'oneHasMany', nullable: true },
			},
		},
		Tag: {
			fields: {
				id: { type: 'scalar' },
				name: { type: 'scalar' },
				color: { type: 'scalar' },
			},
		},
		Comment: {
			fields: {
				id: { type: 'scalar' },
				text: { type: 'scalar' },
			},
		},
		Note: {
			fields: {
				id: { type: 'scalar' },
				body: { type: 'scalar' },
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
			// Access items first to initialize hasMany state (as in real usage)
			expect(handle.items.length).toBe(1)

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

		test('should remove server entity — manyHasMany uses disconnect', () => {
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

		test('should remove server entity — oneHasMany (non-nullable FK) uses delete', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				comments: [{ id: 'c-1', text: 'Hello' }],
			}, true)

			const handle = HasManyListHandle.create<TestComment>(
				'Article',
				'a-1',
				'comments',
				'Comment',
				store,
				dispatcher,
				schema,
			)
			expect(handle.items.length).toBe(1)

			handle.remove('c-1')

			const plannedRemovals = store.getHasManyPlannedRemovals('Article', 'a-1', 'comments')
			expect(plannedRemovals?.has('c-1')).toBe(true)
			expect(plannedRemovals?.get('c-1')).toBe('delete')
		})

		test('should remove server entity — oneHasMany (nullable FK) uses disconnect', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				notes: [{ id: 'n-1', body: 'A note' }],
			}, true)

			const handle = HasManyListHandle.create<TestNote>(
				'Article',
				'a-1',
				'notes',
				'Note',
				store,
				dispatcher,
				schema,
			)
			expect(handle.items.length).toBe(1)

			handle.remove('n-1')

			const plannedRemovals = store.getHasManyPlannedRemovals('Article', 'a-1', 'notes')
			expect(plannedRemovals?.has('n-1')).toBe(true)
			expect(plannedRemovals?.get('n-1')).toBe('disconnect')
		})
	})

	// ==================== Delete ====================

	describe('Delete', () => {
		test('should delete entity from has-many relation', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])

			const handle = createHasManyHandle()
			handle.delete('t-1')

			const plannedRemovals = store.getHasManyPlannedRemovals('Article', 'a-1', 'tags')
			expect(plannedRemovals?.has('t-1')).toBe(true)
			expect(plannedRemovals?.get('t-1')).toBe('delete')
		})

		test('should exclude deleted items from items list', () => {
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

			handle.delete('t-1')

			expect(handle.items.length).toBe(1)
			expect(handle.items[0]?.id as string).toBe('t-2')
		})
	})

	// ==================== remove() with missing relationKind (fallback) ====================

	describe('remove() fallback when relationKind is unknown', () => {
		test('should fall back to disconnect when relationKind is not set', () => {
			// Schema without relationKind
			const minimalSchema = new SchemaRegistry<TestSchema>({
				entities: {
					Article: {
						fields: {
							id: { type: 'scalar' },
							title: { type: 'scalar' },
							tags: { type: 'hasMany', target: 'Tag' }, // no relationKind
						},
					},
					Tag: {
						fields: {
							id: { type: 'scalar' },
							name: { type: 'scalar' },
						},
					},
					Comment: {
						fields: {
							id: { type: 'scalar' },
							text: { type: 'scalar' },
						},
					},
				},
			})

			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = HasManyListHandle.create<TestTag>(
				'Article',
				'a-1',
				'tags',
				'Tag',
				store,
				dispatcher,
				minimalSchema,
			)
			expect(handle.items.length).toBe(1)

			handle.remove('t-1')

			const plannedRemovals = store.getHasManyPlannedRemovals('Article', 'a-1', 'tags')
			expect(plannedRemovals?.has('t-1')).toBe(true)
			expect(plannedRemovals?.get('t-1')).toBe('disconnect')
		})
	})

	// ==================== remove() on oneHasMany created entity ====================

	describe('remove() on created entities across relation kinds', () => {
		test('should cancel add for oneHasMany created entity (not plan delete)', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				comments: [],
			}, true)

			const handle = HasManyListHandle.create<TestComment>(
				'Article',
				'a-1',
				'comments',
				'Comment',
				store,
				dispatcher,
				schema,
			)

			const tempId = handle.add({ text: 'New comment' })
			expect(handle.items.length).toBe(1)

			handle.remove(tempId)

			const state = store.getHasMany('Article', 'a-1', 'comments')
			expect(state?.createdEntities.has(tempId)).toBe(false)
			expect(state?.plannedConnections.has(tempId)).toBe(false)
			// No planned removal — the add was cancelled, not a delete
			expect(state?.plannedRemovals.has(tempId)).toBe(false)
		})

		test('should cancel add for manyHasMany created entity (not plan disconnect)', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [],
			}, true)

			const handle = createHasManyHandle()
			const tempId = handle.add({ name: 'New Tag' })

			handle.remove(tempId)

			const state = store.getHasMany('Article', 'a-1', 'tags')
			expect(state?.plannedRemovals.has(tempId)).toBe(false)
		})
	})

	// ==================== disconnect/delete on created entities ====================

	describe('disconnect/delete on created entities', () => {
		test('disconnect() on created entity should cancel the add, not plan disconnect', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [],
			}, true)

			const handle = createHasManyHandle()
			const tempId = handle.add({ name: 'New Tag' })
			expect(handle.items.length).toBe(1)

			handle.disconnect(tempId)

			const state = store.getHasMany('Article', 'a-1', 'tags')
			expect(state?.plannedRemovals.has(tempId)).toBe(false)
			expect(state?.plannedConnections.has(tempId)).toBe(false)
			expect(state?.createdEntities.has(tempId)).toBe(false)
			expect(handle.items.length).toBe(0)
		})

		test('delete() on created entity should cancel the add, not plan delete', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [],
			}, true)

			const handle = createHasManyHandle()
			const tempId = handle.add({ name: 'New Tag' })
			expect(handle.items.length).toBe(1)

			handle.delete(tempId)

			const state = store.getHasMany('Article', 'a-1', 'tags')
			expect(state?.plannedRemovals.has(tempId)).toBe(false)
			expect(state?.plannedConnections.has(tempId)).toBe(false)
			expect(state?.createdEntities.has(tempId)).toBe(false)
			expect(handle.items.length).toBe(0)
		})
	})

	// ==================== disconnect() type verification ====================

	describe('disconnect() type verification', () => {
		test('should always store disconnect type in planned removals', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = createHasManyHandle()
			expect(handle.items.length).toBe(1)

			handle.disconnect('t-1')

			const plannedRemovals = store.getHasManyPlannedRemovals('Article', 'a-1', 'tags')
			expect(plannedRemovals?.get('t-1')).toBe('disconnect')
		})

		test('should exclude disconnected items from items list', () => {
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

			handle.disconnect('t-1')

			expect(handle.items.length).toBe(1)
			expect(handle.items[0]?.id as string).toBe('t-2')
		})
	})

	// ==================== Reconnect sequences ====================

	describe('Reconnect after removal', () => {
		test('connect() after disconnect() should cancel the disconnect', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = createHasManyHandle()
			expect(handle.items.length).toBe(1)

			handle.disconnect('t-1')
			expect(handle.items.length).toBe(0)

			handle.connect('t-1')

			const plannedRemovals = store.getHasManyPlannedRemovals('Article', 'a-1', 'tags')
			expect(plannedRemovals?.has('t-1')).toBe(false)
			expect(handle.items.length).toBe(1)
		})

		test('connect() after delete() should cancel the delete', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])

			const handle = createHasManyHandle()
			handle.delete('t-1')

			const removalsAfterDelete = store.getHasManyPlannedRemovals('Article', 'a-1', 'tags')
			expect(removalsAfterDelete?.has('t-1')).toBe(true)

			handle.connect('t-1')

			const removalsAfterConnect = store.getHasManyPlannedRemovals('Article', 'a-1', 'tags')
			expect(removalsAfterConnect?.has('t-1')).toBe(false)
		})

		test('remove() then connect() should re-add the item', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = createHasManyHandle()
			expect(handle.items.length).toBe(1)

			handle.remove('t-1')
			expect(handle.items.length).toBe(0)

			handle.connect('t-1')

			expect(handle.items.length).toBe(1)
			const plannedRemovals = store.getHasManyPlannedRemovals('Article', 'a-1', 'tags')
			expect(plannedRemovals?.has('t-1')).toBe(false)
		})
	})

	// ==================== isDirty with delete ====================

	describe('isDirty with delete-type removals', () => {
		test('should return true when has delete-type planned removals', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])

			const handle = createHasManyHandle()
			handle.delete('t-1')

			expect(handle.isDirty).toBe(true)
		})
	})

	// ==================== Mixed disconnect and delete ====================

	describe('Mixed removal types', () => {
		test('should track different removal types for different items', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [
					{ id: 't-1', name: 'Tag 1' },
					{ id: 't-2', name: 'Tag 2' },
					{ id: 't-3', name: 'Tag 3' },
				],
			}, true)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2', 't-3'])

			const handle = createHasManyHandle()
			handle.disconnect('t-1')
			handle.delete('t-2')

			const plannedRemovals = store.getHasManyPlannedRemovals('Article', 'a-1', 'tags')
			expect(plannedRemovals?.get('t-1')).toBe('disconnect')
			expect(plannedRemovals?.get('t-2')).toBe('delete')
			expect(plannedRemovals?.has('t-3')).toBe(false)

			expect(handle.items.length).toBe(1)
			expect(handle.items[0]?.id as string).toBe('t-3')
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
		test('connect() should fire hasMany:connected listener', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test', tags: [] }, true)
			store.setEntityData('Tag', 't-1', { id: 't-1', name: 'Tag 1' }, true)
			store.getOrCreateHasMany('Article', 'a-1', 'tags')

			const handle = createHasManyHandle()
			const listener = mock(() => {})
			handle.onItemConnected(listener)

			handle.connect('t-1')

			expect(listener).toHaveBeenCalledTimes(1)
		})

		test('disconnect() should fire hasMany:disconnected listener', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = createHasManyHandle()
			expect(handle.items.length).toBe(1)

			const listener = mock(() => {})
			handle.onItemDisconnected(listener)

			handle.disconnect('t-1')

			expect(listener).toHaveBeenCalledTimes(1)
		})

		test('add() should fire hasMany:connected listener', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test', tags: [] }, true)
			store.getOrCreateHasMany('Article', 'a-1', 'tags')

			const handle = createHasManyHandle()
			const listener = mock(() => {})
			handle.onItemConnected(listener)

			handle.add({ name: 'New Tag' })

			expect(listener).toHaveBeenCalledTimes(1)
		})

		test('remove() should fire hasMany:disconnected listener', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = createHasManyHandle()
			expect(handle.items.length).toBe(1)

			const listener = mock(() => {})
			handle.onItemDisconnected(listener)

			handle.remove('t-1')

			expect(listener).toHaveBeenCalledTimes(1)
		})

		test('interceptor can cancel connect()', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test', tags: [] }, true)
			store.getOrCreateHasMany('Article', 'a-1', 'tags')

			const handle = createHasManyHandle()
			handle.interceptItemConnecting(() => ({ action: 'cancel' as const }))

			handle.connect('t-1')

			const state = store.getHasMany('Article', 'a-1', 'tags')
			expect(state?.plannedConnections.has('t-1')).toBe(false)
		})

		test('interceptor can cancel disconnect()', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = createHasManyHandle()
			expect(handle.items.length).toBe(1)

			handle.interceptItemDisconnecting(() => ({ action: 'cancel' as const }))

			handle.disconnect('t-1')

			// Disconnect should have been cancelled
			const removals = store.getHasManyPlannedRemovals('Article', 'a-1', 'tags')
			expect(removals?.has('t-1')).toBeFalsy()
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
