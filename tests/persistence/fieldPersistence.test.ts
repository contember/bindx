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
	persist?: (entityType: string, id: string, changes: Record<string, unknown>) => Promise<{ ok: boolean }>
}): BackendAdapter {
	return {
		query: mock(() => Promise.resolve([])),
		persist: options?.persist ?? mock((entityType: string, id: string, changes: Record<string, unknown>) =>
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

describe('BatchPersister - Field-Level Persistence', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
	})

	describe('persistFields() basics', () => {
		test('should persist only the specified field', async () => {
			const persistedData: Record<string, unknown>[] = []

			const adapter = createMockAdapter({
				persistTransaction: async (muts) => {
					for (const m of muts) {
						if (m.data) persistedData.push(m.data)
					}
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
			}, true)

			store.setFieldValue('Article', 'a-1', ['title'], 'Updated Title')
			store.setFieldValue('Article', 'a-1', ['content'], 'Updated Content')

			// Persist only title
			const result = await persister.persistFields('Article', 'a-1', ['title'])

			expect(result.success).toBe(true)
			expect(persistedData.length).toBe(1)
			expect(persistedData[0]).toHaveProperty('title', 'Updated Title')
			// Content should NOT be in the persisted data
			expect(persistedData[0]).not.toHaveProperty('content')
		})

		test('should commit only the specified field on success', async () => {
			const adapter = createMockAdapter({
				persistTransaction: async (muts) => ({
					ok: true,
					results: muts.map(m => ({
						entityType: m.entityType,
						entityId: m.entityId,
						ok: true,
					})),
				}),
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Original Title',
				content: 'Original Content',
			}, true)

			store.setFieldValue('Article', 'a-1', ['title'], 'Updated Title')
			store.setFieldValue('Article', 'a-1', ['content'], 'Updated Content')

			await persister.persistFields('Article', 'a-1', ['title'])

			// Title should be committed (no longer dirty)
			const snapshot = store.getEntitySnapshot('Article', 'a-1')
			expect(snapshot?.serverData).toHaveProperty('title', 'Updated Title')

			// Content should still be dirty (serverData unchanged)
			expect(snapshot?.serverData).toHaveProperty('content', 'Original Content')
			expect(store.getDirtyFields('Article', 'a-1')).toContain('content')
			expect(store.getDirtyFields('Article', 'a-1')).not.toContain('title')
		})

		test('should persist multiple specified fields', async () => {
			const persistedData: Record<string, unknown>[] = []

			const adapter = createMockAdapter({
				persistTransaction: async (muts) => {
					for (const m of muts) {
						if (m.data) persistedData.push(m.data)
					}
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
				summary: 'Original Summary',
			}, true)

			store.setFieldValue('Article', 'a-1', ['title'], 'Updated Title')
			store.setFieldValue('Article', 'a-1', ['content'], 'Updated Content')
			store.setFieldValue('Article', 'a-1', ['summary'], 'Updated Summary')

			// Persist title and content, but not summary
			await persister.persistFields('Article', 'a-1', ['title', 'content'])

			expect(persistedData.length).toBe(1)
			expect(persistedData[0]).toHaveProperty('title', 'Updated Title')
			expect(persistedData[0]).toHaveProperty('content', 'Updated Content')
			expect(persistedData[0]).not.toHaveProperty('summary')

			// Summary should still be dirty
			expect(store.getDirtyFields('Article', 'a-1')).toContain('summary')
			expect(store.getDirtyFields('Article', 'a-1')).not.toContain('title')
			expect(store.getDirtyFields('Article', 'a-1')).not.toContain('content')
		})
	})

	describe('persistFields() error cases', () => {
		test('should return error when none of the specified fields are dirty', async () => {
			const adapter = createMockAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Title',
				content: 'Content',
			}, true)

			// No fields are dirty
			const result = await persister.persistFields('Article', 'a-1', ['title'])

			expect(result.success).toBe(false)
		})

		test('should return error when specified field is not dirty but others are', async () => {
			const adapter = createMockAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Title',
				content: 'Content',
			}, true)

			// Only content is dirty
			store.setFieldValue('Article', 'a-1', ['content'], 'Updated Content')

			// Try to persist title (which is not dirty)
			const result = await persister.persistFields('Article', 'a-1', ['title'])

			expect(result.success).toBe(false)
		})

		test('should not commit any fields when persistence fails', async () => {
			const adapter = createMockAdapter({
				persistTransaction: async (muts) => ({
					ok: false,
					results: muts.map(m => ({
						entityType: m.entityType,
						entityId: m.entityId,
						ok: false,
						errorMessage: 'Server error',
					})),
				}),
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Original Title',
			}, true)

			store.setFieldValue('Article', 'a-1', ['title'], 'Updated Title')

			await persister.persistFields('Article', 'a-1', ['title'])

			// Title should still be dirty (not committed due to failure)
			const snapshot = store.getEntitySnapshot('Article', 'a-1')
			expect(snapshot?.serverData).toHaveProperty('title', 'Original Title')
			expect(store.getDirtyFields('Article', 'a-1')).toContain('title')
		})
	})

	describe('persistFields() with entity not found', () => {
		test('should return error when entity does not exist', async () => {
			const adapter = createMockAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			const result = await persister.persistFields('Article', 'nonexistent', ['title'])

			expect(result.success).toBe(false)
		})
	})

	describe('persistFields() interaction with full persist', () => {
		test('should allow full persist after field persist', async () => {
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
			}, true)

			store.setFieldValue('Article', 'a-1', ['title'], 'Updated Title')
			store.setFieldValue('Article', 'a-1', ['content'], 'Updated Content')

			// First, persist only title
			await persister.persistFields('Article', 'a-1', ['title'])

			// Clear mutations array
			mutations.length = 0

			// Now persist the entire entity (should only send content)
			await persister.persist('Article', 'a-1')

			// Should have persisted the remaining dirty field
			expect(mutations.length).toBe(1)
			expect(mutations[0]?.data).toHaveProperty('content', 'Updated Content')
			expect(mutations[0]?.data).not.toHaveProperty('title')
		})
	})
})
