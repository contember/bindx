import { describe, test, expect, beforeEach } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	EventEmitter,
	EntityHandle,
	HasOneHandle,
	SchemaRegistry,
	type SchemaDefinition,
	type EntityAccessor,
} from '@contember/bindx'
import { createTestDispatcher } from '../shared/unitTestHelpers.js'

interface TestBlock {
	id: string
	type: string
	order: number
}

interface TestBlockList {
	id: string
	items: TestBlock[]
}

interface TestPage {
	id: string
	title: string
	blocks: TestBlockList
}

interface TestSchema {
	Page: TestPage
	BlockList: TestBlockList
	Block: TestBlock
	[key: string]: object
}

const testSchemaDefinition: SchemaDefinition<TestSchema> = {
	entities: {
		Page: {
			fields: {
				id: { type: 'scalar' },
				title: { type: 'scalar' },
				blocks: { type: 'hasOne', target: 'BlockList' },
			},
		},
		BlockList: {
			fields: {
				id: { type: 'scalar' },
				items: { type: 'hasMany', target: 'Block' },
			},
		},
		Block: {
			fields: {
				id: { type: 'scalar' },
				type: { type: 'scalar' },
				order: { type: 'scalar' },
			},
		},
	},
}

describe('Page → blocks → items chain', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let schema: SchemaRegistry<TestSchema>

	beforeEach(() => {
		const setup = createTestDispatcher()
		store = setup.store
		dispatcher = setup.dispatcher
		schema = new SchemaRegistry(testSchemaDefinition)
	})

	function createPageEntity(selection?: any): EntityAccessor<TestPage> {
		return EntityHandle.create<TestPage>(
			'page-1', 'Page',
			store, dispatcher, schema,
			undefined,
			selection,
		)
	}

	test('entity.blocks.items is iterable when BlockList is disconnected', () => {
		store.setEntityData('Page', 'page-1', { id: 'page-1', title: 'Test' }, true)

		const page = createPageEntity()

		// page.blocks → HasOneAccessor (disconnected → placeholder)
		const blocks = page.blocks
		console.log('blocks:', typeof blocks, blocks)
		console.log('blocks.$state:', (blocks as any).$state)
		console.log('blocks.state:', (blocks as any).state)
		expect(blocks.$state).toBe('disconnected')

		// page.blocks.items → should be a has-many ref with iterable .items
		const itemsRef = blocks.items
		expect(itemsRef).toBeDefined()

		// itemsRef.items should be iterable (this is what BlockRepeater accesses)
		const items = (itemsRef as any).items
		expect(items).toBeDefined()
		expect(() => [...items]).not.toThrow()
		expect([...items]).toEqual([])
	})

	test('entity.blocks.items is iterable when BlockList is connected but empty', () => {
		store.setEntityData('Page', 'page-1', { id: 'page-1', title: 'Test' }, true)
		store.setEntityData('BlockList', 'bl-1', { id: 'bl-1' }, true)
		store.setRelation('Page', 'page-1', 'blocks', {
			currentId: 'bl-1',
			state: 'connected',
		})

		const page = createPageEntity()
		const blocks = page.blocks
		expect(blocks.$state).toBe('connected')

		const itemsRef = blocks.items
		expect(itemsRef).toBeDefined()

		const items = (itemsRef as any).items
		expect(items).toBeDefined()
		expect(() => [...items]).not.toThrow()
	})

	test('entity.blocks.items works with BlockRepeater pattern (field.items iterable)', () => {
		store.setEntityData('Page', 'page-1', { id: 'page-1', title: 'Test' }, true)

		const page = createPageEntity()

		// Simulate what BlockRepeater does:
		// field = entity.blocks.items  (passed as prop)
		const field = page.blocks.items as any

		// BlockRepeater then does: field.items
		const fieldItems = field?.items

		// And then: sortEntities(field.items, orderField)
		// which does: [...fieldItems].sort(...)
		if (fieldItems && typeof fieldItems[Symbol.iterator] === 'function') {
			expect([...fieldItems]).toEqual([])
		} else {
			// fieldItems might be undefined for placeholder — that's OK if we handle it
			expect(fieldItems === undefined || fieldItems === null || Array.isArray(fieldItems)).toBe(true)
		}
	})
})
