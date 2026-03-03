import { describe, test, expect, beforeEach } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	EventEmitter,
	HasManyListHandle,
	SchemaRegistry,
	type SchemaDefinition,
	generateHasManyAlias,
} from '@contember/bindx'
import { createTestDispatcher } from '../shared/unitTestHelpers.js'

// Test schema
interface TestArticle {
	id: string
	title: string
	tags?: Array<{ id: string; name: string; active?: boolean }>
}

interface TestTag {
	id: string
	name: string
	active?: boolean
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
				active: { type: 'scalar' },
				color: { type: 'scalar' },
			},
		},
	},
}

describe('HasMany with Alias Support', () => {
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

	function createHasManyHandle(alias?: string): HasManyListHandle<TestTag> {
		return new HasManyListHandle<TestTag>(
			'Article',
			'a-1',
			'tags',
			'Tag',
			store,
			dispatcher,
			schema,
			undefined,
			alias,
		)
	}

	// ==================== Alias Generator ====================

	describe('generateHasManyAlias', () => {
		test('should return fieldName when no params', () => {
			expect(generateHasManyAlias('tags')).toBe('tags')
			expect(generateHasManyAlias('tags', undefined)).toBe('tags')
			expect(generateHasManyAlias('tags', {})).toBe('tags')
		})

		test('should return fieldName when all params are undefined', () => {
			expect(generateHasManyAlias('tags', {
				filter: undefined,
				orderBy: undefined,
				limit: undefined,
				offset: undefined,
			})).toBe('tags')
		})

		test('should generate alias when filter is provided', () => {
			const alias = generateHasManyAlias('tags', { filter: { active: true } })
			expect(alias).not.toBe('tags')
			expect(alias.startsWith('tags_')).toBe(true)
		})

		test('should generate alias when orderBy is provided', () => {
			const alias = generateHasManyAlias('tags', { orderBy: [{ name: 'asc' }] })
			expect(alias).not.toBe('tags')
			expect(alias.startsWith('tags_')).toBe(true)
		})

		test('should generate alias when limit is provided', () => {
			const alias = generateHasManyAlias('tags', { limit: 10 })
			expect(alias).not.toBe('tags')
			expect(alias.startsWith('tags_')).toBe(true)
		})

		test('should generate alias when offset is provided', () => {
			const alias = generateHasManyAlias('tags', { offset: 5 })
			expect(alias).not.toBe('tags')
			expect(alias.startsWith('tags_')).toBe(true)
		})

		test('should generate different aliases for different params', () => {
			const alias1 = generateHasManyAlias('tags', { filter: { active: true } })
			const alias2 = generateHasManyAlias('tags', { filter: { active: false } })
			const alias3 = generateHasManyAlias('tags', { limit: 5 })

			expect(alias1).not.toBe(alias2)
			expect(alias1).not.toBe(alias3)
			expect(alias2).not.toBe(alias3)
		})

		test('should generate consistent aliases for same params', () => {
			const alias1 = generateHasManyAlias('tags', { filter: { active: true }, limit: 10 })
			const alias2 = generateHasManyAlias('tags', { filter: { active: true }, limit: 10 })

			expect(alias1).toBe(alias2)
		})
	})

	// ==================== Multiple HasMany with Different Aliases ====================

	describe('Multiple HasMany with Different Aliases', () => {
		test('should store data separately for different aliases', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [
					{ id: 't-1', name: 'Tag 1', active: true },
					{ id: 't-2', name: 'Tag 2', active: false },
				],
			}, true)

			// Create two handles with different aliases (simulating different filters)
			const alias1 = generateHasManyAlias('tags', { filter: { active: true } })
			const alias2 = generateHasManyAlias('tags', { filter: { active: false } })

			const handle1 = createHasManyHandle(alias1)
			const handle2 = createHasManyHandle(alias2)

			// Initialize both with different server IDs (simulating different filtered results)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'], alias1)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-2'], alias2)

			// Now connect different items to each
			store.planHasManyConnection('Article', 'a-1', 'tags', 't-3', alias1)
			store.planHasManyConnection('Article', 'a-1', 'tags', 't-4', alias2)

			// Verify they have different planned connections
			const connections1 = store.getHasManyPlannedConnections('Article', 'a-1', 'tags', alias1)
			const connections2 = store.getHasManyPlannedConnections('Article', 'a-1', 'tags', alias2)

			expect(connections1?.has('t-3')).toBe(true)
			expect(connections1?.has('t-4')).toBe(false)
			expect(connections2?.has('t-4')).toBe(true)
			expect(connections2?.has('t-3')).toBe(false)
		})

		test('should track dirty state independently for different aliases', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [
					{ id: 't-1', name: 'Tag 1', active: true },
					{ id: 't-2', name: 'Tag 2', active: false },
				],
			}, true)

			const alias1 = generateHasManyAlias('tags', { filter: { active: true } })
			const alias2 = generateHasManyAlias('tags', { filter: { active: false } })

			const handle1 = createHasManyHandle(alias1)
			const handle2 = createHasManyHandle(alias2)

			// Initialize both
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'], alias1)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-2'], alias2)

			// Both should be clean initially
			expect(handle1.isDirty).toBe(false)
			expect(handle2.isDirty).toBe(false)

			// Make changes only to handle1
			handle1.connect('t-3')

			// Only handle1 should be dirty
			expect(handle1.isDirty).toBe(true)
			expect(handle2.isDirty).toBe(false)
		})

		test('should maintain separate ordered IDs for different aliases', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [
					{ id: 't-1', name: 'Tag 1' },
					{ id: 't-2', name: 'Tag 2' },
					{ id: 't-3', name: 'Tag 3' },
				],
			}, true)

			const alias1 = generateHasManyAlias('tags', { orderBy: [{ name: 'asc' }] })
			const alias2 = generateHasManyAlias('tags', { orderBy: [{ name: 'desc' }] })

			// Initialize with different ordered IDs
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2', 't-3'], alias1)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-3', 't-2', 't-1'], alias2)

			// Move in one alias shouldn't affect the other
			store.moveInHasMany('Article', 'a-1', 'tags', 0, 2, alias1)

			const orderedIds1 = store.getHasManyOrderedIds('Article', 'a-1', 'tags', alias1)
			const orderedIds2 = store.getHasManyOrderedIds('Article', 'a-1', 'tags', alias2)

			expect(orderedIds1).toEqual(['t-2', 't-3', 't-1'])
			expect(orderedIds2).toEqual(['t-3', 't-2', 't-1'])
		})

		test('should reset each alias independently', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [],
			}, true)

			const alias1 = generateHasManyAlias('tags', { filter: { active: true } })
			const alias2 = generateHasManyAlias('tags', { filter: { active: false } })

			// Initialize both
			store.getOrCreateHasMany('Article', 'a-1', 'tags', [], alias1)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', [], alias2)

			// Make changes to both
			store.planHasManyConnection('Article', 'a-1', 'tags', 't-1', alias1)
			store.planHasManyConnection('Article', 'a-1', 'tags', 't-2', alias2)

			// Reset only alias1
			store.resetHasMany('Article', 'a-1', 'tags', alias1)

			// alias1 should be reset, alias2 should still have its connection
			const state1 = store.getHasMany('Article', 'a-1', 'tags', alias1)
			const state2 = store.getHasMany('Article', 'a-1', 'tags', alias2)

			expect(state1?.plannedConnections.size).toBe(0)
			expect(state2?.plannedConnections.size).toBe(1)
		})
	})

	// ==================== Handle with Alias ====================

	describe('HasManyListHandle with Alias', () => {
		test('should use alias for all store operations', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const alias = generateHasManyAlias('tags', { filter: { active: true } })
			const handle = createHasManyHandle(alias)

			// Access items to initialize state
			handle.items

			// Connect via handle
			handle.connect('t-2')

			// Should be stored under the alias
			const connections = store.getHasManyPlannedConnections('Article', 'a-1', 'tags', alias)
			expect(connections?.has('t-2')).toBe(true)

			// Should NOT be stored under the base fieldName
			const baseConnections = store.getHasManyPlannedConnections('Article', 'a-1', 'tags')
			expect(baseConnections).toBeUndefined()
		})

		test('should add new items under the correct alias', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [],
			}, true)

			const alias = generateHasManyAlias('tags', { limit: 5 })
			const handle = createHasManyHandle(alias)

			const tempId = handle.add({ name: 'New Tag' })

			// Should be tracked under the alias
			const state = store.getHasMany('Article', 'a-1', 'tags', alias)
			expect(state?.createdEntities.has(tempId)).toBe(true)
		})

		test('should remove items from the correct alias', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const alias = generateHasManyAlias('tags', { filter: { active: true } })
			const handle = createHasManyHandle(alias)

			// Initialize state
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'], alias)

			handle.remove('t-1')

			const removals = store.getHasManyPlannedRemovals('Article', 'a-1', 'tags', alias)
			expect(removals?.has('t-1')).toBe(true)
		})

		test('should get dirty state from the correct alias', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [],
			}, true)

			const alias = generateHasManyAlias('tags', { filter: { active: true } })
			const handle = createHasManyHandle(alias)

			// Initialize state
			store.getOrCreateHasMany('Article', 'a-1', 'tags', [], alias)

			expect(handle.isDirty).toBe(false)

			handle.connect('t-1')

			expect(handle.isDirty).toBe(true)
		})

		test('should move items within the correct alias', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [
					{ id: 't-1', name: 'Tag 1' },
					{ id: 't-2', name: 'Tag 2' },
				],
			}, true)

			const alias = generateHasManyAlias('tags', { orderBy: [{ name: 'asc' }] })
			const handle = createHasManyHandle(alias)

			// Initialize state
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2'], alias)

			handle.move(0, 1)

			const orderedIds = store.getHasManyOrderedIds('Article', 'a-1', 'tags', alias)
			expect(orderedIds).toEqual(['t-2', 't-1'])
		})

		test('should reset the correct alias', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [],
			}, true)

			const alias = generateHasManyAlias('tags', { filter: { active: true } })
			const handle = createHasManyHandle(alias)

			// Initialize and make changes
			store.getOrCreateHasMany('Article', 'a-1', 'tags', [], alias)
			handle.connect('t-1')

			expect(handle.isDirty).toBe(true)

			handle.reset()

			expect(handle.isDirty).toBe(false)
		})
	})

	// ==================== Backwards Compatibility ====================

	describe('Backwards Compatibility', () => {
		test('should work without alias (uses fieldName)', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = createHasManyHandle() // No alias

			expect(handle.items.length).toBe(1)
			expect(`${handle.items[0]?.id}`).toBe('t-1')
		})

		test('should connect/disconnect without alias', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const handle = createHasManyHandle() // No alias
			handle.items // Initialize

			handle.disconnect('t-1')

			const removals = store.getHasManyPlannedRemovals('Article', 'a-1', 'tags')
			expect(removals?.has('t-1')).toBe(true)
		})
	})
})
