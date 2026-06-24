// Regression tests for the orphan-created-entity leak class (issue #47 and the
// bug-hunt that followed it), now backed by reachability-based create detection.
//
// Root cause: a never-persisted created entity (existsOnServer=false, with a
// snapshot) that becomes logically detached from every relation must not be
// reported as a `create`. Otherwise getAllDirtyEntities() keeps reporting a
// phantom `create`, a global persistAll tries to create a row the user removed,
// and the form stays dirty.
//
// These assert the OBSERVABLE behavior (getAllDirtyEntities reports no create)
// across has-one detach, reset paths, cascade into descendants, and
// scheduleForDeletion. The detached snapshot may linger in the store until the
// lazy memory sweep — correctness no longer depends on eager purge.
import { describe, test, expect, beforeEach } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	HasManyListHandle,
	HasOneHandle,
	SchemaRegistry,
	type SchemaDefinition,
} from '@contember/bindx'
import { createTestDispatcher } from '../shared/unitTestHelpers.js'

interface TestSchema {
	Article: { id: string; title: string }
	Comment: { id: string; text: string }
	Author: { id: string; name: string }
	Reaction: { id: string; kind: string }
	[key: string]: object
}

const def: SchemaDefinition<TestSchema> = {
	entities: {
		Article: {
			fields: {
				id: { type: 'scalar' },
				title: { type: 'scalar' },
				comments: { type: 'hasMany', target: 'Comment', relationKind: 'oneHasMany' },
				author: { type: 'hasOne', target: 'Author', nullable: true },
			},
		},
		Comment: {
			fields: {
				id: { type: 'scalar' },
				text: { type: 'scalar' },
				reactions: { type: 'hasMany', target: 'Reaction', relationKind: 'oneHasMany' },
				author: { type: 'hasOne', target: 'Author', nullable: true },
			},
		},
		Author: { fields: { id: { type: 'scalar' }, name: { type: 'scalar' } } },
		Reaction: { fields: { id: { type: 'scalar' }, kind: { type: 'scalar' } } },
	},
}

describe('orphan created-entity purge', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let schema: SchemaRegistry<TestSchema>

	beforeEach(() => {
		const s = createTestDispatcher()
		store = s.store
		dispatcher = s.dispatcher
		schema = new SchemaRegistry(def)
	})

	const creates = () => store.getAllDirtyEntities().filter(e => e.changeType === 'create')

	const hasMany = (parentType: string, parentId: string, field: string, itemType: string) =>
		HasManyListHandle.create(parentType, parentId, field, itemType, store, dispatcher, schema)
	const hasOne = (parentType: string, parentId: string, field: string, targetType: string) =>
		HasOneHandle.create(parentType, parentId, field, targetType, store, dispatcher, schema)

	describe('has-many reset', () => {
		test('reset() after add() purges created children', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T', comments: [] }, true)
			const h = hasMany('Article', 'a-1', 'comments', 'Comment')
			h.add({ text: 'one' })
			h.add({ text: 'two' })
			h.reset()
			expect(creates()).toEqual([])
		})

		test('reset() keeps server children and reverts planned removals', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T', comments: [{ id: 'c-1', text: 'srv' }] }, true)
			const h = hasMany('Article', 'a-1', 'comments', 'Comment')
			h.items // materialize server child
			h.add({ text: 'draft' })
			h.remove('c-1')
			h.reset()
			expect(creates()).toEqual([])
			expect(store.hasEntity('Comment', 'c-1')).toBe(true)
			expect(store.getHasManyOrderedIds('Article', 'a-1', 'comments')).toEqual(['c-1'])
		})
	})

	describe('has-one detach', () => {
		test('create() then disconnect() purges the created target', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T', author: null }, true)
			const h = hasOne('Article', 'a-1', 'author', 'Author')
			h.$create({ name: 'draft' })
			h.$disconnect()
			expect(creates()).toEqual([])
		})

		test('create() then reset() purges the created target', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T', author: null }, true)
			const h = hasOne('Article', 'a-1', 'author', 'Author')
			h.$create({ name: 'draft' })
			h.$reset()
			expect(creates()).toEqual([])
		})

		test('create() then delete() cancels the create (no phantom)', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T', author: null }, true)
			const h = hasOne('Article', 'a-1', 'author', 'Author')
			h.$create({ name: 'draft' })
			h.$delete()
			expect(store.getAllDirtyEntities()).toEqual([])
		})

		test('create() then connect(other) purges the displaced created target', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T', author: null }, true)
			store.setEntityData('Author', 'au-1', { id: 'au-1', name: 'Existing' }, true)
			const h = hasOne('Article', 'a-1', 'author', 'Author')
			h.$create({ name: 'draft' })
			h.$connect('au-1')
			expect(creates()).toEqual([])
		})

		test('disconnect() of a SERVER target does not delete or orphan it', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T', author: { id: 'au-1', name: 'Srv' } }, true)
			const h = hasOne('Article', 'a-1', 'author', 'Author')
			h.$entity // materialize server target
			h.$disconnect()
			expect(creates()).toEqual([])
			expect(store.hasEntity('Author', 'au-1')).toBe(true)
			expect(store.isScheduledForDeletion('Author', 'au-1')).toBe(false)
		})
	})

	describe('cascade into descendants', () => {
		test('remove(child) drops its created grandchildren and has-one targets from creates', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T', comments: [] }, true)
			const comments = hasMany('Article', 'a-1', 'comments', 'Comment')
			const tempC = comments.add({ text: 'draft' })
			hasMany('Comment', tempC, 'reactions', 'Reaction').add({ kind: 'like' })
			hasOne('Comment', tempC, 'author', 'Author').$create({ name: 'sub' })
			comments.remove(tempC)
			// The whole detached subtree is unreachable, so nothing is reported.
			expect(creates()).toEqual([])
		})

		test('has-one disconnect cascades through a created chain', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T', author: null }, true)
			const top = hasOne('Article', 'a-1', 'author', 'Author')
			const tempAuthor = top.$create({ name: 'mid' })
			// nested created has-one under the created author
			hasOne('Author', tempAuthor, 'author', 'Author').$create({ name: 'deep' })
			top.$disconnect()
			expect(creates()).toEqual([])
		})

		test('removing a child with created descendants reports no create', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T', comments: [] }, true)
			const comments = hasMany('Article', 'a-1', 'comments', 'Comment')
			const tempC = comments.add({ text: 'draft' })
			hasMany('Comment', tempC, 'reactions', 'Reaction').add({ kind: 'like' })
			comments.remove(tempC)
			// Child and its created reaction are both unreachable from any root.
			expect(creates()).toEqual([])
		})
	})

	describe('reset of a whole entity (rollback path)', () => {
		test('resetAllRelations purges created children added after load', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'T', comments: [] }, true)
			hasMany('Article', 'a-1', 'comments', 'Comment').add({ text: 'draft' })
			store.resetAllRelations('Article', 'a-1')
			expect(creates()).toEqual([])
		})
	})

	describe('scheduleForDeletion of a never-persisted entity', () => {
		test('reports neither a create nor a delete (cancels the create)', () => {
			const id = store.createEntity('Comment', { text: 'x' })
			store.scheduleForDeletion('Comment', id)
			// Never on the server + scheduled for deletion => nothing to persist.
			expect(store.getAllDirtyEntities()).toEqual([])
		})

		test('still schedules a server entity for deletion', () => {
			store.setEntityData('Comment', 'c-1', { id: 'c-1', text: 'srv' }, true)
			store.scheduleForDeletion('Comment', 'c-1')
			expect(store.getAllDirtyEntities()).toEqual([
				{ entityType: 'Comment', entityId: 'c-1', changeType: 'delete' },
			])
		})
	})
})
