// Regression test for <issue-url — filled in after the issue is created>
//
// A has-many connection staged on a parent that has NO embedded relation data
// (a freshly-created / unpersisted parent — e.g. a block just added via
// `list.add()`) is not surfaced by `HasManyListHandle.items`: the getter
// short-circuits to [] in `materializeEmbeddedItems()` before it ever reads the
// staged connection from the store. Downstream this makes a `MultiSelectField`
// on a brand-new entity un-selectable until the entity is persisted and refetched.
import { describe, test, expect, beforeEach } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	EventEmitter,
	HasManyListHandle,
	SchemaRegistry,
	type SchemaDefinition,
	type HasManyAccessor,
} from '@contember/bindx'
import { createTestDispatcher } from '../shared/unitTestHelpers.js'

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

describe('HasManyListHandle — planned connection on a parent without embedded data', () => {
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

	function createHandle(): HasManyAccessor<TestTag> {
		// 'Article' 'a-1' deliberately has NO embedded data set — it stands in for a
		// freshly-created parent whose relation array was never fetched/seeded.
		return HasManyListHandle.create<TestTag>('Article', 'a-1', 'tags', 'Tag', store, dispatcher, schema)
	}

	test('should surface a connected item when the parent has no embedded relation data', () => {
		// The connect target exists in the store…
		store.setEntityData('Tag', 't-2', { id: 't-2', name: 'Tag 2' }, true)

		const handle = createHandle()
		// …and we stage the connection through the public handle API, exactly as a
		// MultiSelectField click does on a brand-new (unpersisted) entity.
		handle.connect('t-2')

		// The staged connection must be visible immediately — without persisting or
		// refetching the parent.
		expect(handle.items.length).toBe(1)
		expect(handle.items[0]?.id as string).toBe('t-2')
	})
})
