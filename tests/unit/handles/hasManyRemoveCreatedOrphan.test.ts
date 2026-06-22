// Regression test for <issue-url — filled in after the issue is created>
//
// Removing a never-persisted child from a has-many (the documented "cancels the
// add operation" path) drops the relation link but leaves the created entity's
// snapshot in the store, so `getAllDirtyEntities()` keeps reporting it as a
// `create`. A subsequent global `persistAll` then tries to create a child that
// the user already removed — and the server rejects it for missing required
// fields.
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

interface TestArticle {
	id: string
	title: string
	comments?: Array<{ id: string; text: string }>
}
interface TestComment {
	id: string
	text: string
}
interface TestSchema {
	Article: TestArticle
	Comment: TestComment
	[key: string]: object
}

// `comments` is a oneHasMany with a non-nullable owning FK — so `remove()`
// resolves to `delete` for server rows, and to "cancel the add" for rows that
// only exist client-side. This mirrors a real footer/socials editor.
const testSchemaDefinition: SchemaDefinition<TestSchema> = {
	entities: {
		Article: {
			fields: {
				id: { type: 'scalar' },
				title: { type: 'scalar' },
				comments: { type: 'hasMany', target: 'Comment', relationKind: 'oneHasMany' },
			},
		},
		Comment: {
			fields: {
				id: { type: 'scalar' },
				text: { type: 'scalar' },
			},
		},
	},
}

describe('HasManyListHandle remove() of a created entity', () => {
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

	function createHandle(): HasManyAccessor<TestComment> {
		return HasManyListHandle.create<TestComment>('Article', 'a-1', 'comments', 'Comment', store, dispatcher, schema)
	}

	test('should not leave an orphan create in the store after add() then remove()', () => {
		// Parent loaded from the server with an empty has-many.
		store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test', comments: [] }, true)

		const handle = createHandle()
		const tempId = handle.add({ text: 'draft' })

		// The freshly-added child is in the list...
		expect(handle.items.map(i => i.id)).toContain(tempId)

		// ...and now the user removes it before persisting.
		handle.remove(tempId)

		// The relation no longer references it (this part already works).
		expect(handle.items.map(i => i.id)).not.toContain(tempId)

		// But the store must also forget the created entity entirely — otherwise a
		// global persistAll picks it up and tries to create the removed row.
		const dirty = store.getAllDirtyEntities()
		const orphan = dirty.find(e => e.entityType === 'Comment' && e.entityId === tempId)
		expect(orphan).toBeUndefined()
	})
})
