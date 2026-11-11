/**
 * Removing a has-many item that was only connected locally cancels the planned
 * connection instead of planning a disconnect: the server never held the edge, and a
 * create input does not accept `disconnect` at all (contember/bindx#144).
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import { SnapshotStore, MutationCollector, ContemberSchemaMutationAdapter, type SchemaNames } from '@contember/bindx'

const schema: SchemaNames = {
	entities: {
		Article: {
			name: 'Article',
			scalars: ['id', 'title'],
			fields: {
				id: { type: 'column' },
				title: { type: 'column' },
				tags: { type: 'many', entity: 'Tag' },
			},
		},
		Tag: {
			name: 'Tag',
			scalars: ['id', 'name'],
			fields: {
				id: { type: 'column' },
				name: { type: 'column' },
			},
		},
	},
	enums: {},
}

describe('removing an unsaved has-many pick', () => {
	let store: SnapshotStore
	let collector: MutationCollector

	beforeEach(() => {
		store = new SnapshotStore()
		collector = new MutationCollector(store, new ContemberSchemaMutationAdapter(schema))
		store.setEntityData('Tag', 'tag-1', { id: 'tag-1', name: 'One' }, true)
		store.setEntityData('Tag', 'tag-2', { id: 'tag-2', name: 'Two' }, true)
	})

	describe('on a new entity', () => {
		let articleId: string

		beforeEach(() => {
			articleId = store.createEntity('Article', { title: 'New' })
			store.getOrCreateHasMany('Article', articleId, 'tags', [])
		})

		test('connect then remove sends no relation operation', () => {
			store.planHasManyConnection('Article', articleId, 'tags', 'tag-1')
			store.removeFromHasMany('Article', articleId, 'tags', 'tag-1', 'disconnect')

			expect(collector.collectCreateData('Article', articleId)).toEqual({ title: 'New' })
			expect(store.getHasManyOrderedIds('Article', articleId, 'tags')).toEqual([])
		})

		test('connect, remove and connect another sends only the other connect', () => {
			store.planHasManyConnection('Article', articleId, 'tags', 'tag-1')
			store.removeFromHasMany('Article', articleId, 'tags', 'tag-1', 'disconnect')
			store.planHasManyConnection('Article', articleId, 'tags', 'tag-2')

			expect(collector.collectCreateData('Article', articleId)).toEqual({
				title: 'New',
				tags: [{ connect: { id: 'tag-2' }, alias: 'tag-2' }],
			})
		})

		test('connect, remove and connect the same item again sends its connect', () => {
			store.planHasManyConnection('Article', articleId, 'tags', 'tag-1')
			store.removeFromHasMany('Article', articleId, 'tags', 'tag-1', 'disconnect')
			store.planHasManyConnection('Article', articleId, 'tags', 'tag-1')

			expect(collector.collectCreateData('Article', articleId)).toEqual({
				title: 'New',
				tags: [{ connect: { id: 'tag-1' }, alias: 'tag-1' }],
			})
		})
	})

	describe('on a persisted entity', () => {
		beforeEach(() => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Saved', tags: [{ id: 'tag-1', name: 'One' }] }, true)
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['tag-1'])
		})

		test('connecting a new item and removing it leaves nothing to persist', () => {
			store.planHasManyConnection('Article', 'a-1', 'tags', 'tag-2')
			store.removeFromHasMany('Article', 'a-1', 'tags', 'tag-2', 'disconnect')

			expect(collector.collectUpdateData('Article', 'a-1')).toBeNull()
			expect(store.getHasManyOrderedIds('Article', 'a-1', 'tags')).toEqual(['tag-1'])
		})

		test('removing a server item still disconnects it', () => {
			store.removeFromHasMany('Article', 'a-1', 'tags', 'tag-1', 'disconnect')

			expect(collector.collectUpdateData('Article', 'a-1')).toEqual({
				tags: [{ disconnect: { id: 'tag-1' }, alias: 'tag-1' }],
			})
		})

		test('removing a server item that was re-connected after a removal still disconnects it', () => {
			store.removeFromHasMany('Article', 'a-1', 'tags', 'tag-1', 'disconnect')
			store.planHasManyConnection('Article', 'a-1', 'tags', 'tag-1')
			store.removeFromHasMany('Article', 'a-1', 'tags', 'tag-1', 'disconnect')

			expect(collector.collectUpdateData('Article', 'a-1')).toEqual({
				tags: [{ disconnect: { id: 'tag-1' }, alias: 'tag-1' }],
			})
		})

		test('deleting a locally connected item still deletes it', () => {
			store.planHasManyConnection('Article', 'a-1', 'tags', 'tag-2')
			store.removeFromHasMany('Article', 'a-1', 'tags', 'tag-2', 'delete')

			expect(collector.collectUpdateData('Article', 'a-1')).toEqual({
				tags: [{ delete: { id: 'tag-2' }, alias: 'tag-2' }],
			})
		})
	})
})
