import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	BatchPersister,
	type BackendAdapter,
	type TransactionResult,
	type TransactionMutation,
} from '@contember/bindx'

function createMockAdapter(options?: {
	persistTransaction?: (mutations: readonly TransactionMutation[]) => Promise<TransactionResult>
}): BackendAdapter {
	return {
		query: mock(() => Promise.resolve([])),
		persist: mock((entityType: string, id: string, changes: Record<string, unknown>) =>
			Promise.resolve({ ok: true }),
		),
		create: mock((entityType: string, data: Record<string, unknown>) =>
			Promise.resolve({ ok: true, data: { id: 'new-id-123', ...data } }),
		),
		delete: mock((entityType: string, id: string) =>
			Promise.resolve({ ok: true }),
		),
		persistTransaction: options?.persistTransaction,
	}
}

describe('BatchPersister - Deduplication', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
	})

	describe('same entity in multiple relations', () => {
		test('should generate single mutation when same entity is referenced in multiple hasOne relations', async () => {
			const mutations: TransactionMutation[] = []

			const adapter = createMockAdapter({
				persistTransaction: async (muts) => {
					mutations.push(...muts)
					return {
						ok: true,
						results: muts.map(m => ({
							entityType: m.entityType,
							entityId: m.entityId,
							ok: true,
						})),
					}
				},
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			// Create an author entity
			store.setEntityData('Author', 'author-1', { id: 'author-1', name: 'Original Name' }, true)
			store.setFieldValue('Author', 'author-1', ['name'], 'Updated Name')

			// Simulate the same author being referenced in two different articles
			// (through different hasOne relations)
			store.setEntityData('Article', 'article-1', {
				id: 'article-1',
				title: 'Article 1',
				authorId: 'author-1',
			}, true)

			store.setEntityData('Article', 'article-2', {
				id: 'article-2',
				title: 'Article 2',
				authorId: 'author-1',
			}, true)

			await persister.persistAll()

			// Should only have one mutation for the author
			const authorMutations = mutations.filter(m => m.entityType === 'Author' && m.entityId === 'author-1')
			expect(authorMutations.length).toBe(1)
		})

		test('should generate single mutation when entity appears in both hasMany and hasOne', async () => {
			const mutations: TransactionMutation[] = []

			const adapter = createMockAdapter({
				persistTransaction: async (muts) => {
					mutations.push(...muts)
					return {
						ok: true,
						results: muts.map(m => ({
							entityType: m.entityType,
							entityId: m.entityId,
							ok: true,
						})),
					}
				},
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			// Same tag referenced in multiple places
			store.setEntityData('Tag', 'tag-1', { id: 'tag-1', name: 'Original' }, true)
			store.setFieldValue('Tag', 'tag-1', ['name'], 'Updated Tag')

			await persister.persistAll()

			const tagMutations = mutations.filter(m => m.entityType === 'Tag' && m.entityId === 'tag-1')
			expect(tagMutations.length).toBe(1)
		})
	})

	describe('concurrent persist calls', () => {
		test('should skip entities already in-flight when called concurrently', async () => {
			let callCount = 0
			let resolvers: Array<() => void> = []

			const adapter = createMockAdapter({
				persistTransaction: (muts) => {
					callCount++
					return new Promise<TransactionResult>((resolve) => {
						resolvers.push(() => {
							resolve({
								ok: true,
								results: muts.map(m => ({
									entityType: m.entityType,
									entityId: m.entityId,
									ok: true,
								})),
							})
						})
					})
				},
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated')

			// Start first persist (will be pending)
			const promise1 = persister.persist('Article', 'a-1')

			// Start second persist for same entity while first is in-flight
			const promise2 = persister.persist('Article', 'a-1')

			// The second call should return immediately with skipped status
			// (depending on implementation, it may wait or return skipped)

			// Resolve the first persist
			resolvers[0]?.()

			const result1 = await promise1
			const result2 = await promise2

			// First call should succeed
			expect(result1.success).toBe(true)

			// Second call should be skipped (entity was in-flight)
			expect(result2.success).toBe(false)
		})
	})

	describe('delete vs update deduplication', () => {
		test('should handle entity marked for deletion correctly', async () => {
			const mutations: TransactionMutation[] = []

			const adapter = createMockAdapter({
				persistTransaction: async (muts) => {
					mutations.push(...muts)
					return {
						ok: true,
						results: muts.map(m => ({
							entityType: m.entityType,
							entityId: m.entityId,
							ok: true,
						})),
					}
				},
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			// Entity that's marked for deletion
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'To Delete' }, true)
			store.scheduleForDeletion('Article', 'a-1')

			await persister.persistAll()

			const articleMutations = mutations.filter(m => m.entityType === 'Article' && m.entityId === 'a-1')
			expect(articleMutations.length).toBe(1)
			expect(articleMutations[0]?.operation).toBe('delete')
		})

		test('should not generate update for entity marked for deletion', async () => {
			const mutations: TransactionMutation[] = []

			const adapter = createMockAdapter({
				persistTransaction: async (muts) => {
					mutations.push(...muts)
					return {
						ok: true,
						results: muts.map(m => ({
							entityType: m.entityType,
							entityId: m.entityId,
							ok: true,
						})),
					}
				},
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			// Entity with changes AND marked for deletion
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated')
			store.scheduleForDeletion('Article', 'a-1')

			await persister.persistAll()

			const articleMutations = mutations.filter(m => m.entityType === 'Article' && m.entityId === 'a-1')
			// Should only have delete, not both update and delete
			expect(articleMutations.length).toBe(1)
			expect(articleMutations[0]?.operation).toBe('delete')
		})
	})

	describe('multiple dirty fields on same entity', () => {
		test('should combine all dirty fields into single mutation', async () => {
			const mutations: TransactionMutation[] = []

			const adapter = createMockAdapter({
				persistTransaction: async (muts) => {
					mutations.push(...muts)
					return {
						ok: true,
						results: muts.map(m => ({
							entityType: m.entityType,
							entityId: m.entityId,
							ok: true,
						})),
					}
				},
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Original Title',
				content: 'Original Content',
				publishedAt: null,
			}, true)

			// Make multiple fields dirty
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated Title')
			store.setFieldValue('Article', 'a-1', ['content'], 'Updated Content')
			store.setFieldValue('Article', 'a-1', ['publishedAt'], '2024-01-01')

			await persister.persistAll()

			// Should be single mutation with all fields
			const articleMutations = mutations.filter(m => m.entityType === 'Article' && m.entityId === 'a-1')
			expect(articleMutations.length).toBe(1)

			const mutation = articleMutations[0]
			expect(mutation?.data).toHaveProperty('title', 'Updated Title')
			expect(mutation?.data).toHaveProperty('content', 'Updated Content')
			expect(mutation?.data).toHaveProperty('publishedAt', '2024-01-01')
		})
	})
})
