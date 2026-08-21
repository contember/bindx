import { describe, test, expect, beforeEach } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	FIELD_REF_META,
	HasManyListHandle,
	SchemaRegistry,
	type EntityAccessor,
	type SchemaDefinition,
} from '@contember/bindx'
import { createTestDispatcher } from '../shared/unitTestHelpers.js'

/**
 * The per-item accessor cache of HasManyListHandle must stay bounded — a paginated,
 * filtered or repeatedly refetched relation used to keep an accessor for every id it had
 * ever shown — WITHOUT churning the identity of items that stay listed.
 */

interface TestTag {
	id: string
	name: string
}

interface TestArticle {
	id: string
	title: string
	tags?: TestTag[]
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
				tags: { type: 'hasMany', target: 'Tag', relationKind: 'manyHasMany' },
			},
		},
		Tag: {
			fields: {
				id: { type: 'scalar' },
				name: { type: 'scalar' },
			},
		},
	},
}

describe('HasManyListHandle item handle cache', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let schema: SchemaRegistry<TestSchema>

	beforeEach(() => {
		const setup = createTestDispatcher()
		store = setup.store
		dispatcher = setup.dispatcher
		schema = new SchemaRegistry(testSchemaDefinition)
	})

	/** Raw handle (no alias proxy) so the test can read the cache occupancy. */
	function createListHandle(): HasManyListHandle<TestTag> {
		return HasManyListHandle.createRaw<TestTag>('Article', 'a-1', 'tags', 'Tag', store, dispatcher, schema)
	}

	/** Simulates a fetch/refetch of the parent with a given page of tags. */
	function loadTags(tags: TestTag[]): void {
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test', tags }, true)
	}

	function itemIds(handle: HasManyListHandle<TestTag>): string[] {
		return handle.items.map(item => item[FIELD_REF_META].entityId)
	}

	/** Indexed access that fails loudly instead of yielding undefined. */
	function at(items: EntityAccessor<TestTag>[], index: number): EntityAccessor<TestTag> {
		const item = items[index]
		if (item === undefined) throw new Error(`no item at index ${index}`)
		return item
	}

	describe('eviction', () => {
		test('releases the cache entry for ids that left the list', () => {
			loadTags([{ id: 't-1', name: 'One' }, { id: 't-2', name: 'Two' }, { id: 't-3', name: 'Three' }])
			const handle = createListHandle()

			expect(itemIds(handle)).toEqual(['t-1', 't-2', 't-3'])
			expect(handle.itemHandleCacheSize).toBe(3)

			loadTags([{ id: 't-4', name: 'Four' }, { id: 't-5', name: 'Five' }])

			expect(itemIds(handle)).toEqual(['t-4', 't-5'])
			expect(handle.itemHandleCacheSize).toBe(2)
		})

		test('stays bounded across many pages', () => {
			const handle = createListHandle()

			for (let page = 0; page < 20; page++) {
				loadTags([
					{ id: `p${page}-a`, name: 'A' },
					{ id: `p${page}-b`, name: 'B' },
				])
				expect(itemIds(handle)).toEqual([`p${page}-a`, `p${page}-b`])
			}

			expect(handle.itemHandleCacheSize).toBe(2)
		})

		test('releases an id removed from the list', () => {
			loadTags([{ id: 't-1', name: 'One' }, { id: 't-2', name: 'Two' }])
			const handle = createListHandle()
			expect(handle.items.length).toBe(2)

			handle.disconnect('t-2')

			expect(itemIds(handle)).toEqual(['t-1'])
			expect(handle.itemHandleCacheSize).toBe(1)
		})
	})

	describe('identity stability', () => {
		test('an item that stays listed keeps the identical proxy across store changes', () => {
			loadTags([{ id: 't-1', name: 'One' }, { id: 't-2', name: 'Two' }])
			const handle = createListHandle()

			const before = handle.items

			// Unrelated store changes: a sibling item is edited, an unrelated entity appears.
			store.setEntityData('Tag', 't-2', { id: 't-2', name: 'Renamed' }, false)
			store.setEntityData('Tag', 't-99', { id: 't-99', name: 'Unrelated' }, true)

			const after = handle.items

			expect(at(after, 0)).toBe(at(before, 0))
			expect(at(after, 1)).toBe(at(before, 1))
			expect(handle.getById('t-1')).toBe(at(before, 0))
			expect(handle.itemHandleCacheSize).toBe(2)
		})

		test('items that stay listed keep identity while another item is evicted', () => {
			loadTags([{ id: 't-1', name: 'One' }, { id: 't-2', name: 'Two' }, { id: 't-3', name: 'Three' }])
			const handle = createListHandle()

			const before = handle.items

			loadTags([{ id: 't-1', name: 'One' }, { id: 't-3', name: 'Three' }])
			const after = handle.items

			expect(itemIds(handle)).toEqual(['t-1', 't-3'])
			expect(at(after, 0)).toBe(at(before, 0))
			expect(at(after, 1)).toBe(at(before, 2))
			expect(handle.itemHandleCacheSize).toBe(2)
		})
	})

	describe('leave and re-enter', () => {
		test('an id that comes back gets a fresh, working accessor', () => {
			loadTags([{ id: 't-1', name: 'One' }, { id: 't-2', name: 'Two' }])
			const handle = createListHandle()

			const before = handle.items
			const staleTwo = at(before, 1)

			loadTags([{ id: 't-1', name: 'One' }])
			expect(itemIds(handle)).toEqual(['t-1'])
			expect(handle.itemHandleCacheSize).toBe(1)

			loadTags([{ id: 't-1', name: 'One' }, { id: 't-2', name: 'Two again' }])
			const after = handle.items

			expect(itemIds(handle)).toEqual(['t-1', 't-2'])
			// t-1 never left, so its identity survives; t-2 was really released, not kept.
			expect(at(after, 0)).toBe(at(before, 0))
			expect(at(after, 1)).not.toBe(staleTwo)
			expect(at(after, 1).$fields.name.value).toBe('Two again')
			expect(handle.itemHandleCacheSize).toBe(2)
		})

		test('re-entering does not leave a duplicate behind', () => {
			loadTags([{ id: 't-1', name: 'One' }, { id: 't-2', name: 'Two' }])
			const handle = createListHandle()
			expect(handle.items.length).toBe(2)

			for (let round = 0; round < 5; round++) {
				loadTags([{ id: 't-1', name: 'One' }])
				expect(handle.items.length).toBe(1)
				loadTags([{ id: 't-1', name: 'One' }, { id: 't-2', name: 'Two' }])
				expect(handle.items.length).toBe(2)
			}

			expect(handle.itemHandleCacheSize).toBe(2)
		})
	})

	describe('temp id rekey', () => {
		test('a persisted item leaves no temp entry behind and is addressable by both ids', () => {
			loadTags([{ id: 't-1', name: 'One' }])
			const handle = createListHandle()
			expect(handle.items.length).toBe(1)

			const tempId = handle.add({ name: 'Fresh' })
			expect(itemIds(handle)).toEqual(['t-1', tempId])
			expect(handle.itemHandleCacheSize).toBe(2)
			const draftAccessor = handle.getById(tempId)

			store.mapTempIdToPersistedId('Tag', tempId, 't-9')
			const after = handle.items

			expect(itemIds(handle)).toEqual(['t-1', 't-9'])
			// The temp key is gone — one entry per live item, not one per id ever seen.
			expect(handle.itemHandleCacheSize).toBe(2)
			// A lookup by the dead temp id resolves to the persisted item's handle.
			expect(handle.getById(tempId)).toBe(at(after, 1))
			expect(at(after, 1)).toBe(draftAccessor)
			expect(handle.itemHandleCacheSize).toBe(2)
			expect(at(after, 1)[FIELD_REF_META].entityId).toBe('t-9')
		})

		test('an existing persisted-key accessor wins a cache collision', () => {
			loadTags([{ id: 't-1', name: 'One' }])
			const handle = createListHandle()
			expect(handle.items.length).toBe(1)
			const tempId = handle.add({ name: 'Fresh' })
			const tempAccessor = handle.getById(tempId)
			const persistedAccessor = handle.getById('t-9')

			store.mapTempIdToPersistedId('Tag', tempId, 't-9')

			expect(handle.getById(tempId)).toBe(persistedAccessor)
			expect(handle.getById('t-9')).toBe(persistedAccessor)
			expect(handle.getById('t-9')).not.toBe(tempAccessor)
			expect(handle.itemHandleCacheSize).toBe(2)
		})

		test('a never-persisted temp item keeps its accessor', () => {
			loadTags([{ id: 't-1', name: 'One' }])
			const handle = createListHandle()
			expect(handle.items.length).toBe(1)

			const tempId = handle.add({ name: 'Fresh' })
			const before = handle.items
			const after = handle.items

			expect(at(after, 1)).toBe(at(before, 1))
			expect(handle.getById(tempId)).toBe(at(before, 1))
			expect(handle.itemHandleCacheSize).toBe(2)
		})
	})

	describe('persist in flight', () => {
		test('does not evict handles the presented list is temporarily hiding', () => {
			loadTags([{ id: 't-1', name: 'One' }])
			const handle = createListHandle()
			expect(handle.items.length).toBe(1)

			const tempId = handle.add({ name: 'Fresh' })
			const before = handle.items
			expect(itemIds(handle)).toEqual(['t-1', tempId])

			store.setPersisting('Article', 'a-1', true, true)

			// The pessimistic presentation drops the planned addition, but its handle stays.
			expect(itemIds(handle)).toEqual(['t-1'])
			expect(handle.itemHandleCacheSize).toBe(2)

			store.setPersisting('Article', 'a-1', false)
			const after = handle.items

			expect(itemIds(handle)).toEqual(['t-1', tempId])
			expect(at(after, 1)).toBe(at(before, 1))
		})
	})
})
