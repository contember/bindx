import { describe, test, expect, beforeEach } from 'bun:test'
import { SnapshotStore, MutationCollector, type SchemaNames, type HasManyRemovalType } from '@contember/bindx'

// Test schema
const testSchema: SchemaNames = {
	entities: {
		Article: {
			name: 'Article',
			scalars: ['id', 'title', 'content'],
			fields: {
				id: { type: 'column' },
				title: { type: 'column' },
				content: { type: 'column' },
				author: { type: 'one', entity: 'Author' },
				tags: { type: 'many', entity: 'Tag' },
			},
		},
		Author: {
			name: 'Author',
			scalars: ['id', 'name', 'email'],
			fields: {
				id: { type: 'column' },
				name: { type: 'column' },
				email: { type: 'column' },
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

describe('MutationCollector', () => {
	let store: SnapshotStore
	let collector: MutationCollector

	beforeEach(() => {
		store = new SnapshotStore()
		collector = new MutationCollector(store, testSchema)
	})

	describe('scalar field changes', () => {
		test('should detect scalar field change', () => {
			// Set initial data
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Original Title',
				content: 'Original Content',
			}, true)

			// Change a field
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated Title')

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				title: 'Updated Title',
			})
		})

		test('should return null when no changes', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Title',
			}, true)

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toBeNull()
		})

		test('should detect multiple field changes', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Original',
				content: 'Original Content',
			}, true)

			store.setFieldValue('Article', 'a-1', ['title'], 'New Title')
			store.setFieldValue('Article', 'a-1', ['content'], 'New Content')

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				title: 'New Title',
				content: 'New Content',
			})
		})
	})

	describe('has-one relation changes', () => {
		test('should generate connect operation when relation changes', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				author: { id: 'auth-1', name: 'John' },
			}, true)

			// Initialize relation state
			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				serverId: 'auth-1',
				state: 'connected',
				serverState: 'connected',
				placeholderData: {},
			})

			// Change relation to different author
			store.setRelation('Article', 'a-1', 'author', {
				currentId: 'auth-2',
				state: 'connected',
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				author: { connect: { id: 'auth-2' } },
			})
		})

		test('should generate disconnect operation', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				author: { id: 'auth-1', name: 'John' },
			}, true)

			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				serverId: 'auth-1',
				state: 'connected',
				serverState: 'connected',
				placeholderData: {},
			})

			// Disconnect relation
			store.setRelation('Article', 'a-1', 'author', {
				currentId: null,
				state: 'disconnected',
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				author: { disconnect: true },
			})
		})

		test('should generate delete operation', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				author: { id: 'auth-1', name: 'John' },
			}, true)

			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				serverId: 'auth-1',
				state: 'connected',
				serverState: 'connected',
				placeholderData: {},
			})

			// Mark for deletion
			store.setRelation('Article', 'a-1', 'author', {
				state: 'deleted',
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				author: { delete: true },
			})
		})

		test('should generate create operation with placeholder data', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				author: null,
			}, true)

			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: null,
				serverId: null,
				state: 'creating',
				serverState: 'disconnected',
				placeholderData: {
					name: 'New Author',
					email: 'new@example.com',
				},
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				author: {
					create: {
						name: 'New Author',
						email: 'new@example.com',
					},
				},
			})
		})

		test('should not generate operation for unchanged relation', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				author: { id: 'auth-1', name: 'John' },
			}, true)

			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				serverId: 'auth-1',
				state: 'connected',
				serverState: 'connected',
				placeholderData: {},
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toBeNull()
		})
	})

	describe('has-many relation changes', () => {
		test('should generate connect operation for new items', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				tags: [{ id: 'tag-1', name: 'Tag1' }],
			}, true)

			// Add a new tag (already exists in DB)
			store.updateEntityFields('Article', 'a-1', {
				tags: [
					{ id: 'tag-1', name: 'Tag1' },
					{ id: 'tag-2', name: 'Tag2' },
				],
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				tags: [{ connect: { id: 'tag-2' } }],
			})
		})

		test('should generate disconnect operation for removed items', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				tags: [
					{ id: 'tag-1', name: 'Tag1' },
					{ id: 'tag-2', name: 'Tag2' },
				],
			}, true)

			// Remove tag-2
			store.updateEntityFields('Article', 'a-1', {
				tags: [{ id: 'tag-1', name: 'Tag1' }],
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				tags: [{ disconnect: { id: 'tag-2' } }],
			})
		})

		test('should generate create operation for new items without ID', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				tags: [],
			}, true)

			// Add new tag without ID
			store.updateEntityFields('Article', 'a-1', {
				tags: [{ name: 'NewTag' }],
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				tags: [{ create: { name: 'NewTag' } }],
			})
		})

		test('should generate create operation for items with temp ID', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				tags: [],
			}, true)

			// Add new tag with temp ID
			store.updateEntityFields('Article', 'a-1', {
				tags: [{ id: '__temp_123', name: 'TempTag' }],
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				tags: [{ create: { name: 'TempTag' } }],
			})
		})

		test('should generate update operation for changed items', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				tags: [{ id: 'tag-1', name: 'OriginalName' }],
			}, true)

			// Change tag name
			store.updateEntityFields('Article', 'a-1', {
				tags: [{ id: 'tag-1', name: 'UpdatedName' }],
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				tags: [{
					update: {
						by: { id: 'tag-1' },
						data: { name: 'UpdatedName' },
					},
				}],
			})
		})

		test('should handle multiple operations', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				tags: [
					{ id: 'tag-1', name: 'Tag1' },
					{ id: 'tag-2', name: 'Tag2' },
				],
			}, true)

			// Connect tag-3, disconnect tag-2, update tag-1, create new
			store.updateEntityFields('Article', 'a-1', {
				tags: [
					{ id: 'tag-1', name: 'UpdatedTag1' },
					{ id: 'tag-3', name: 'Tag3' },
					{ name: 'BrandNew' },
				],
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).not.toBeNull()
			expect(mutation!['tags']).toBeDefined()

			const tagOps = mutation!['tags'] as any[]

			// Should have connect for tag-3, disconnect for tag-2, update for tag-1, create for new
			expect(tagOps).toContainEqual({ connect: { id: 'tag-3' } })
			expect(tagOps).toContainEqual({ disconnect: { id: 'tag-2' } })
			expect(tagOps).toContainEqual({ create: { name: 'BrandNew' } })
			expect(tagOps).toContainEqual({
				update: { by: { id: 'tag-1' }, data: { name: 'UpdatedTag1' } },
			})
		})
	})

	describe('combined changes', () => {
		test('should collect scalar and relation changes together', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Original',
				author: { id: 'auth-1', name: 'John' },
				tags: [{ id: 'tag-1', name: 'Tag1' }],
			}, true)

			// Initialize relation
			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				serverId: 'auth-1',
				state: 'connected',
				serverState: 'connected',
				placeholderData: {},
			})

			// Change title
			store.setFieldValue('Article', 'a-1', ['title'], 'New Title')

			// Change author
			store.setRelation('Article', 'a-1', 'author', {
				currentId: 'auth-2',
				state: 'connected',
			})

			// Add tag
			store.updateEntityFields('Article', 'a-1', {
				tags: [
					{ id: 'tag-1', name: 'Tag1' },
					{ id: 'tag-2', name: 'Tag2' },
				],
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				title: 'New Title',
				author: { connect: { id: 'auth-2' } },
				tags: [{ connect: { id: 'tag-2' } }],
			})
		})
	})

	describe('edge cases', () => {
		test('should return null for non-existent entity', () => {
			const mutation = collector.collectUpdateData('Article', 'non-existent')
			expect(mutation).toBeNull()
		})

		test('should throw for unknown entity type', () => {
			store.setEntityData('Unknown', 'u-1', { id: 'u-1' }, true)

			expect(() => {
				collector.collectUpdateData('Unknown', 'u-1')
			}).toThrow("Entity type 'Unknown' not found in schema")
		})

		test('should handle empty has-many arrays', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				tags: [],
			}, true)

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toBeNull()
		})

		test('should not include unchanged has-many relations', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				tags: [{ id: 'tag-1', name: 'Tag1' }],
			}, true)

			// Only change title, not tags
			store.setFieldValue('Article', 'a-1', ['title'], 'New Title')

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				title: 'New Title',
			})
		})
	})

	describe('collectMutation - determining mutation type', () => {
		test('should return update for existing entity with changes', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Original',
			}, true)
			store.setExistsOnServer('Article', 'a-1', true)

			store.setFieldValue('Article', 'a-1', ['title'], 'Updated')

			const result = collector.collectMutation('Article', 'a-1')

			expect(result).toEqual({
				type: 'update',
				entityType: 'Article',
				entityId: 'a-1',
				data: { title: 'Updated' },
			})
		})

		test('should return null for existing entity without changes', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Title',
			}, true)
			store.setExistsOnServer('Article', 'a-1', true)

			const result = collector.collectMutation('Article', 'a-1')

			expect(result).toBeNull()
		})

		test('should return create for new entity', () => {
			store.setEntityData('Article', '__temp_123', {
				id: '__temp_123',
				title: 'New Article',
				content: 'Content',
			}, false) // Not from server
			store.setExistsOnServer('Article', '__temp_123', false)

			const result = collector.collectMutation('Article', '__temp_123')

			expect(result).toEqual({
				type: 'create',
				entityType: 'Article',
				entityId: '__temp_123',
				data: { title: 'New Article', content: 'Content' },
			})
		})

		test('should return delete for entity scheduled for deletion', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Title',
			}, true)
			store.setExistsOnServer('Article', 'a-1', true)
			store.scheduleForDeletion('Article', 'a-1')

			const result = collector.collectMutation('Article', 'a-1')

			expect(result).toEqual({
				type: 'delete',
				entityType: 'Article',
				entityId: 'a-1',
			})
		})

		test('should return null for entity scheduled for deletion that does not exist on server', () => {
			store.setEntityData('Article', '__temp_123', {
				id: '__temp_123',
				title: 'Title',
			}, false)
			store.setExistsOnServer('Article', '__temp_123', false)
			store.scheduleForDeletion('Article', '__temp_123')

			const result = collector.collectMutation('Article', '__temp_123')

			expect(result).toBeNull()
		})

		test('should return null for non-existent entity', () => {
			const result = collector.collectMutation('Article', 'non-existent')
			expect(result).toBeNull()
		})
	})

	describe('collectCreateData', () => {
		test('should collect all scalar fields for new entity', () => {
			store.setEntityData('Article', '__temp_1', {
				id: '__temp_1',
				title: 'New Article',
				content: 'Article content',
			}, false)

			const createData = collector.collectCreateData('Article', '__temp_1')

			expect(createData).toEqual({
				title: 'New Article',
				content: 'Article content',
			})
		})

		test('should not include id in create data', () => {
			store.setEntityData('Article', '__temp_1', {
				id: '__temp_1',
				title: 'New',
			}, false)

			const createData = collector.collectCreateData('Article', '__temp_1')

			expect(createData).not.toHaveProperty('id')
		})

		test('should generate connect for has-one with existing entity', () => {
			store.setEntityData('Article', '__temp_1', {
				id: '__temp_1',
				title: 'New Article',
				author: { id: 'auth-1', name: 'John' },
			}, false)

			const createData = collector.collectCreateData('Article', '__temp_1')

			expect(createData).toEqual({
				title: 'New Article',
				author: { connect: { id: 'auth-1' } },
			})
		})

		test('should generate create for has-one with temp entity', () => {
			store.setEntityData('Article', '__temp_1', {
				id: '__temp_1',
				title: 'New Article',
				author: { id: '__temp_author', name: 'New Author' },
			}, false)

			const createData = collector.collectCreateData('Article', '__temp_1')

			expect(createData).toEqual({
				title: 'New Article',
				author: { create: { name: 'New Author' } },
			})
		})

		test('should generate connect operations for has-many with existing entities', () => {
			store.setEntityData('Article', '__temp_1', {
				id: '__temp_1',
				title: 'New Article',
				tags: [
					{ id: 'tag-1', name: 'Tag1' },
					{ id: 'tag-2', name: 'Tag2' },
				],
			}, false)

			const createData = collector.collectCreateData('Article', '__temp_1')

			expect(createData).toEqual({
				title: 'New Article',
				tags: [
					{ connect: { id: 'tag-1' } },
					{ connect: { id: 'tag-2' } },
				],
			})
		})

		test('should generate create operations for has-many with new entities', () => {
			store.setEntityData('Article', '__temp_1', {
				id: '__temp_1',
				title: 'New Article',
				tags: [
					{ name: 'NewTag1' },
					{ id: '__temp_tag', name: 'NewTag2' },
				],
			}, false)

			const createData = collector.collectCreateData('Article', '__temp_1')

			expect(createData).toEqual({
				title: 'New Article',
				tags: [
					{ create: { name: 'NewTag1' } },
					{ create: { name: 'NewTag2' } },
				],
			})
		})

		test('should return null for non-existent entity', () => {
			const createData = collector.collectCreateData('Article', 'non-existent')
			expect(createData).toBeNull()
		})

		test('should skip null/undefined scalar values', () => {
			store.setEntityData('Article', '__temp_1', {
				id: '__temp_1',
				title: 'New Article',
				content: null,
			}, false)

			const createData = collector.collectCreateData('Article', '__temp_1')

			expect(createData).toEqual({
				title: 'New Article',
			})
		})
	})

	describe('nested data processing', () => {
		test('should process nested has-one in create data', () => {
			store.setEntityData('Article', '__temp_1', {
				id: '__temp_1',
				title: 'New Article',
				author: {
					id: '__temp_author',
					name: 'New Author',
				},
			}, false)

			const createData = collector.collectCreateData('Article', '__temp_1')

			expect(createData).toEqual({
				title: 'New Article',
				author: { create: { name: 'New Author' } },
			})
		})

		test('should process nested has-many in placeholder data', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				author: null,
			}, true)

			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: null,
				serverId: null,
				state: 'creating',
				serverState: 'disconnected',
				placeholderData: {
					name: 'New Author',
					articles: [
						{ id: 'existing-article', title: 'Existing' },
						{ id: '__temp_art', title: 'New Article' },
					],
				},
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				author: {
					create: {
						name: 'New Author',
						articles: [
							{ connect: { id: 'existing-article' } },
							{ create: { title: 'New Article' } },
						],
					},
				},
			})
		})

		test('should handle nested update for existing has-one relation', () => {
			// Setup parent article with author
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				author: { id: 'auth-1', name: 'John' },
			}, true)

			// Setup author entity - first set from server
			store.setEntityData('Author', 'auth-1', {
				id: 'auth-1',
				name: 'John',
				email: 'john@example.com',
			}, true) // From server
			store.setExistsOnServer('Author', 'auth-1', true)

			// Now update the author's name
			store.setFieldValue('Author', 'auth-1', ['name'], 'John Updated')

			// Setup relation state - same author, connected
			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: 'auth-1',
				serverId: 'auth-1',
				state: 'connected',
				serverState: 'connected',
				placeholderData: {},
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				author: { update: { name: 'John Updated' } },
			})
		})
	})

	describe('has-many planned removals', () => {
		test('should use planned disconnect for removed items', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				tags: [
					{ id: 'tag-1', name: 'Tag1' },
					{ id: 'tag-2', name: 'Tag2' },
				],
			}, true)

			// Plan to disconnect tag-2
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['tag-1', 'tag-2'])
			store.planHasManyRemoval('Article', 'a-1', 'tags', 'tag-2', 'disconnect')

			// Remove tag-2 from current data
			store.updateEntityFields('Article', 'a-1', {
				tags: [{ id: 'tag-1', name: 'Tag1' }],
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				tags: [{ disconnect: { id: 'tag-2' } }],
			})
		})

		test('should use planned delete for removed items', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				tags: [
					{ id: 'tag-1', name: 'Tag1' },
					{ id: 'tag-2', name: 'Tag2' },
				],
			}, true)

			// Plan to delete tag-2
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['tag-1', 'tag-2'])
			store.planHasManyRemoval('Article', 'a-1', 'tags', 'tag-2', 'delete')

			// Remove tag-2 from current data
			store.updateEntityFields('Article', 'a-1', {
				tags: [{ id: 'tag-1', name: 'Tag1' }],
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				tags: [{ delete: { id: 'tag-2' } }],
			})
		})

		test('should handle mixed planned removals', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				tags: [
					{ id: 'tag-1', name: 'Tag1' },
					{ id: 'tag-2', name: 'Tag2' },
					{ id: 'tag-3', name: 'Tag3' },
				],
			}, true)

			// Plan different operations
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['tag-1', 'tag-2', 'tag-3'])
			store.planHasManyRemoval('Article', 'a-1', 'tags', 'tag-2', 'disconnect')
			store.planHasManyRemoval('Article', 'a-1', 'tags', 'tag-3', 'delete')

			// Remove both from current data
			store.updateEntityFields('Article', 'a-1', {
				tags: [{ id: 'tag-1', name: 'Tag1' }],
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).not.toBeNull()
			const tagOps = mutation!['tags'] as any[]
			expect(tagOps).toContainEqual({ disconnect: { id: 'tag-2' } })
			expect(tagOps).toContainEqual({ delete: { id: 'tag-3' } })
		})

		test('should not duplicate disconnect for planned removal', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Article',
				tags: [{ id: 'tag-1', name: 'Tag1' }],
			}, true)

			// Plan to disconnect tag-1
			store.getOrCreateHasMany('Article', 'a-1', 'tags', ['tag-1'])
			store.planHasManyRemoval('Article', 'a-1', 'tags', 'tag-1', 'disconnect')

			// Remove from current data
			store.updateEntityFields('Article', 'a-1', {
				tags: [],
			})

			const mutation = collector.collectUpdateData('Article', 'a-1')

			expect(mutation).toEqual({
				tags: [{ disconnect: { id: 'tag-1' } }],
			})

			// Should only have one disconnect operation
			const tagOps = mutation!['tags'] as any[]
			expect(tagOps.filter(op => op.disconnect)).toHaveLength(1)
		})
	})
})
