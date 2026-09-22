import { describe, test, expect, beforeEach } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	EventEmitter,
	HasManyListHandle,
	SchemaRegistry,
	type SchemaDefinition,
	type HasManyAccessor,
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

	function createHasManyHandle(alias?: string): HasManyAccessor<TestTag> {
		return HasManyListHandle.create<TestTag>(
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

	// ==================== Views of one relation ====================

	/**
	 * A has-many selected with params is fetched under an alias, and several such
	 * VIEWS of one relation can be mounted at once. What the server returned is per
	 * view; the pending writes are not — the backend has one `tags` relation and one
	 * mutation input for it.
	 */
	describe('Views of one relation', () => {
		const activeAlias = generateHasManyAlias('tags', { filter: { active: true } })
		const inactiveAlias = generateHasManyAlias('tags', { filter: { active: false } })

		beforeEach(() => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [
					{ id: 't-1', name: 'Tag 1', active: true },
					{ id: 't-2', name: 'Tag 2', active: false },
				],
			}, true)
		})

		test('each view keeps the server rows its own args returned', () => {
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'], activeAlias)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-2'], inactiveAlias)

			expect(store.getHasManyOrderedIds('Article', 'a-1', 'tags', activeAlias)).toEqual(['t-1'])
			expect(store.getHasManyOrderedIds('Article', 'a-1', 'tags', inactiveAlias)).toEqual(['t-2'])
		})

		test('the relation baseline is the union across views', () => {
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'], activeAlias)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-2'], inactiveAlias)

			expect(store.getHasMany('Article', 'a-1', 'tags')?.serverIds).toEqual(new Set(['t-1', 't-2']))
		})

		test('a connection is one pending write on the relation, not one per view', () => {
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'], activeAlias)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-2'], inactiveAlias)

			store.planHasManyConnection('Article', 'a-1', 'tags', 't-3', activeAlias)

			// What the next persist will send — addressed by the schema field name.
			expect(store.getHasManyPlannedConnections('Article', 'a-1', 'tags')).toEqual(new Set(['t-3']))
		})

		test('an addition renders only in the view it was made in', () => {
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'], activeAlias)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-2'], inactiveAlias)

			store.planHasManyConnection('Article', 'a-1', 'tags', 't-3', activeAlias)

			// The client cannot evaluate the other view's filter, so it must not guess.
			expect(store.getHasManyOrderedIds('Article', 'a-1', 'tags', activeAlias)).toEqual(['t-1', 't-3'])
			expect(store.getHasManyOrderedIds('Article', 'a-1', 'tags', inactiveAlias)).toEqual(['t-2'])
		})

		test('an addition also renders in a view whose args cannot exclude it', () => {
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'], activeAlias)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2'])

			store.planHasManyConnection('Article', 'a-1', 'tags', 't-3', activeAlias)

			// The unparameterized view has no filter to violate.
			expect(store.getHasManyOrderedIds('Article', 'a-1', 'tags')).toEqual(['t-1', 't-2', 't-3'])
		})

		test('a removal hides the item in every view', () => {
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2'], activeAlias)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'], inactiveAlias)

			store.planHasManyRemoval('Article', 'a-1', 'tags', 't-1', 'disconnect')

			// The row leaves the relation, so no view may keep showing it — the persist
			// disconnects it regardless of which view the user was looking at.
			expect(store.getHasManyOrderedIds('Article', 'a-1', 'tags', activeAlias)).toEqual(['t-2'])
			expect(store.getHasManyOrderedIds('Article', 'a-1', 'tags', inactiveAlias)).toEqual([])
		})

		test('manual ordering stays per view', () => {
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2', 't-3'], activeAlias)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-3', 't-2', 't-1'], inactiveAlias)

			store.moveInHasMany('Article', 'a-1', 'tags', 0, 2, activeAlias)

			expect(store.getHasManyOrderedIds('Article', 'a-1', 'tags', activeAlias)).toEqual(['t-2', 't-3', 't-1'])
			expect(store.getHasManyOrderedIds('Article', 'a-1', 'tags', inactiveAlias)).toEqual(['t-3', 't-2', 't-1'])
		})

		test('reset clears the relation, not one view of it', () => {
			store.getOrCreateHasMany('Article', 'a-1', 'tags', [], activeAlias)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', [], inactiveAlias)
			store.planHasManyConnection('Article', 'a-1', 'tags', 't-1', activeAlias)
			store.planHasManyConnection('Article', 'a-1', 'tags', 't-2', inactiveAlias)

			store.resetHasMany('Article', 'a-1', 'tags')

			expect(store.getHasMany('Article', 'a-1', 'tags')?.plannedAdditions.size).toBe(0)
		})
	})

	// ==================== Handle with Alias ====================

	describe('HasManyListHandle with Alias', () => {
		test('a connection made through a view is a pending write of the relation', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const alias = generateHasManyAlias('tags', { filter: { active: true } })
			const handle = createHasManyHandle(alias)

			handle.items
			handle.connect('t-2')

			// Addressed by the schema field name — this is what the persister reads.
			expect(store.getHasManyPlannedConnections('Article', 'a-1', 'tags')?.has('t-2')).toBe(true)
			// And it renders in the view it was made in.
			expect(handle.items.map(item => `${item.id}`)).toContain('t-2')
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

			expect(store.isHasManyItemCreated('Article', 'a-1', 'tags', tempId)).toBe(true)
			expect(store.getHasManyOrderedIds('Article', 'a-1', 'tags', alias)).toEqual([tempId])
		})

		test('should remove items through the relation', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [{ id: 't-1', name: 'Tag 1' }],
			}, true)

			const alias = generateHasManyAlias('tags', { filter: { active: true } })
			const handle = createHasManyHandle(alias)

			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'], alias)

			handle.remove('t-1')

			expect(store.getHasManyPlannedRemovals('Article', 'a-1', 'tags')?.has('t-1')).toBe(true)
		})

		test('a view reports the relation as dirty, including a sibling view\'s change', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [],
			}, true)

			const activeAlias = generateHasManyAlias('tags', { filter: { active: true } })
			const inactiveAlias = generateHasManyAlias('tags', { filter: { active: false } })
			const active = createHasManyHandle(activeAlias)
			const inactive = createHasManyHandle(inactiveAlias)

			store.getOrCreateHasMany('Article', 'a-1', 'tags', [], activeAlias)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', [], inactiveAlias)

			expect(active.isDirty).toBe(false)
			expect(inactive.isDirty).toBe(false)

			active.connect('t-1')

			// Persisting either view sends the whole relation, so a view claiming to be
			// clean while pushing its sibling's write would be incoherent.
			expect(active.isDirty).toBe(true)
			expect(inactive.isDirty).toBe(true)
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

			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2'], alias)

			handle.move(0, 1)

			expect(store.getHasManyOrderedIds('Article', 'a-1', 'tags', alias)).toEqual(['t-2', 't-1'])
		})

		test('reset clears the pending writes the view can see', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Test',
				tags: [],
			}, true)

			const alias = generateHasManyAlias('tags', { filter: { active: true } })
			const handle = createHasManyHandle(alias)

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
