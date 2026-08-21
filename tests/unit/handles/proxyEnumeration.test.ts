import { describe, test, expect } from 'bun:test'
import {
	ActionDispatcher,
	EntityHandle,
	SchemaRegistry,
	SnapshotStore,
	type SchemaDefinition,
	type SelectionMeta,
} from '@contember/bindx'

interface TestArticle {
	id: string
	title: string
}

interface TestSchema {
	Article: TestArticle
	[key: string]: object
}

const schemaDefinition: SchemaDefinition<TestSchema> = {
	entities: {
		Article: {
			fields: {
				id: { type: 'scalar' },
				title: { type: 'scalar' },
			},
		},
	},
}

const selection: SelectionMeta = {
	fields: new Map([
		['id', { fieldName: 'id', alias: 'id', path: ['id'], isArray: false, isRelation: false }],
		['title', { fieldName: 'title', alias: 'title', path: ['title'], isArray: false, isRelation: false }],
	]),
}

function createHandle(selected?: SelectionMeta): EntityHandle<TestArticle> {
	const store = new SnapshotStore()
	store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Hello' }, true)
	return EntityHandle.createRaw<TestArticle>(
		'a-1',
		'Article',
		store,
		new ActionDispatcher(store),
		new SchemaRegistry(schemaDefinition),
		undefined,
		selected,
	)
}

/**
 * Enumerating an entity accessor must list `id` and the selected fields only — never
 * the handle's instance fields, which a generic walker would then read as entity
 * fields and trip selection validation.
 */
describe('entity accessor enumeration', () => {
	test('lists id and the selected fields', () => {
		const accessor = EntityHandle.wrapProxy(createHandle(selection))
		expect(Object.keys(accessor)).toEqual(['id', 'title'])
		const seen: string[] = []
		for (const key in accessor) seen.push(key)
		expect(seen).toEqual(['id', 'title'])
	})

	test('reading every enumerated key does not throw', () => {
		const accessor = EntityHandle.wrapProxy(createHandle(selection))
		for (const [key, value] of Object.entries(accessor)) {
			expect(value, key).toBeDefined()
		}
		expect(Object.getOwnPropertyDescriptor(accessor, 'store')).toBeUndefined()
	})

	test('without a selection only id is listed', () => {
		const accessor = EntityHandle.wrapProxy(createHandle())
		expect(Object.keys(accessor)).toEqual(['id'])
	})
})
