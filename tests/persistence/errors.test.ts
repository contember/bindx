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

describe('BatchPersister - Error Handling', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
	})

	describe('server validation errors', () => {
		test('should map server error to the correct entity', async () => {
			const adapter = createMockAdapter({
				persistTransaction: async (mutations) => ({
					ok: false,
					results: mutations.map((m, i) => ({
						entityType: m.entityType,
						entityId: m.entityId,
						ok: i !== 1, // Second entity fails
						errorMessage: i === 1 ? 'Title is required' : undefined,
					})),
				}),
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Title 1' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated 1')

			store.setEntityData('Article', 'a-2', { id: 'a-2', title: 'Title 2' }, true)
			store.setFieldValue('Article', 'a-2', ['title'], '') // This will fail

			const result = await persister.persistAll()

			expect(result.success).toBe(false)
			expect(result.failedCount).toBe(1)

			// Find the failed result
			const failedResult = result.results.find(r => !r.success)
			expect(failedResult?.entityId).toBe('a-2')
			expect(failedResult?.error?.message).toBe('Title is required')
		})

		test('should include error message in result for failed entities', async () => {
			const adapter = createMockAdapter({
				persistTransaction: async (mutations) => ({
					ok: false,
					results: mutations.map(m => ({
						entityType: m.entityType,
						entityId: m.entityId,
						ok: false,
						errorMessage: `Validation failed for ${m.entityType}:${m.entityId}`,
					})),
				}),
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Title' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated')

			const result = await persister.persistAll()

			expect(result.success).toBe(false)
			expect(result.results[0]?.error?.message).toBe('Validation failed for Article:a-1')
		})
	})

	describe('transactional rollback', () => {
		test('should not commit any entity when transaction fails', async () => {
			const adapter = createMockAdapter({
				persistTransaction: async (mutations) => ({
					ok: false, // Transaction failed
					results: mutations.map(m => ({
						entityType: m.entityType,
						entityId: m.entityId,
						ok: false,
						errorMessage: 'Transaction rolled back',
					})),
				}),
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original 1' }, true)
			store.setEntityData('Article', 'a-2', { id: 'a-2', title: 'Original 2' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated 1')
			store.setFieldValue('Article', 'a-2', ['title'], 'Updated 2')

			await persister.persistAll()

			// Both entities should still be dirty (nothing committed)
			expect(store.getDirtyFields('Article', 'a-1')).toContain('title')
			expect(store.getDirtyFields('Article', 'a-2')).toContain('title')

			// Server data should be unchanged
			const snapshot1 = store.getEntitySnapshot('Article', 'a-1')
			const snapshot2 = store.getEntitySnapshot('Article', 'a-2')
			expect(snapshot1?.serverData).toHaveProperty('title', 'Original 1')
			expect(snapshot2?.serverData).toHaveProperty('title', 'Original 2')
		})

		test('should not commit successful entities when one fails in transaction', async () => {
			const adapter = createMockAdapter({
				persistTransaction: async (mutations) => ({
					ok: false, // Overall transaction failed
					results: mutations.map((m, i) => ({
						entityType: m.entityType,
						entityId: m.entityId,
						ok: i === 0, // First succeeded before failure
						errorMessage: i !== 0 ? 'Failed' : undefined,
					})),
				}),
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original 1' }, true)
			store.setEntityData('Article', 'a-2', { id: 'a-2', title: 'Original 2' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated 1')
			store.setFieldValue('Article', 'a-2', ['title'], 'Updated 2')

			await persister.persistAll()

			// Even the "successful" entity should be rolled back
			expect(store.getDirtyFields('Article', 'a-1')).toContain('title')
			expect(store.getDirtyFields('Article', 'a-2')).toContain('title')
		})
	})

	describe('client validation errors', () => {
		test('should block persist for entities with client errors', async () => {
			const persistCalled = { value: false }

			const adapter = createMockAdapter({
				persistTransaction: async (mutations) => {
					persistCalled.value = true
					return {
						ok: true,
						results: mutations.map(m => ({
							entityType: m.entityType,
							entityId: m.entityId,
							ok: true,
						})),
					}
				},
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: '' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated')
			store.addFieldError('Article', 'a-1', 'title', {
				message: 'Title cannot be empty',
				source: 'client',
			})

			const result = await persister.persist('Article', 'a-1')

			expect(result.success).toBe(false)
			// Adapter should not be called when client validation fails
			expect(persistCalled.value).toBe(false)
		})

		test('should report client validation errors in result', async () => {
			const adapter = createMockAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: '' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'x')
			store.addFieldError('Article', 'a-1', 'title', {
				message: 'Title must be at least 3 characters',
				source: 'client',
			})

			const result = await persister.persist('Article', 'a-1')

			expect(result.success).toBe(false)
			// Result should indicate validation error
			expect(result.error?.message).toContain('validation')
		})

		test('should allow persist after client errors are cleared', async () => {
			const adapter = createMockAdapter({
				persistTransaction: async (mutations) => ({
					ok: true,
					results: mutations.map(m => ({
						entityType: m.entityType,
						entityId: m.entityId,
						ok: true,
					})),
				}),
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: '' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'x')
			store.addFieldError('Article', 'a-1', 'title', {
				message: 'Title too short',
				source: 'client',
			})

			// First persist should fail
			const result1 = await persister.persist('Article', 'a-1')
			expect(result1.success).toBe(false)

			// Clear errors and fix the value
			store.clearFieldErrors('Article', 'a-1', 'title')
			store.setFieldValue('Article', 'a-1', ['title'], 'Valid Title')

			// Second persist should succeed
			const result2 = await persister.persist('Article', 'a-1')
			expect(result2.success).toBe(true)
		})
	})

	describe('network/adapter errors', () => {
		test('should handle adapter throwing an exception', async () => {
			const adapter = createMockAdapter({
				persistTransaction: async () => {
					throw new Error('Network error: Connection refused')
				},
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Title' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated')

			const result = await persister.persistAll()

			expect(result.success).toBe(false)
			// Entities should remain dirty after network error
			expect(store.getDirtyFields('Article', 'a-1')).toContain('title')
		})
	})

	describe('partial success handling', () => {
		test('should correctly report mixed success/failure results', async () => {
			const adapter = createMockAdapter({
				persistTransaction: async (mutations) => ({
					ok: false,
					results: mutations.map((m, i) => ({
						entityType: m.entityType,
						entityId: m.entityId,
						ok: i % 2 === 0, // Even indices succeed, odd fail
						errorMessage: i % 2 !== 0 ? `Error for ${m.entityId}` : undefined,
					})),
				}),
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			// Create 4 dirty entities
			for (let i = 0; i < 4; i++) {
				store.setEntityData('Article', `a-${i}`, { id: `a-${i}`, title: `Original ${i}` }, true)
				store.setFieldValue('Article', `a-${i}`, ['title'], `Updated ${i}`)
			}

			const result = await persister.persistAll()

			expect(result.success).toBe(false)
			expect(result.successCount).toBe(2)
			expect(result.failedCount).toBe(2)

			// Check individual results
			const successResults = result.results.filter(r => r.success)
			const failedResults = result.results.filter(r => !r.success)

			expect(successResults.length).toBe(2)
			expect(failedResults.length).toBe(2)

			// Failed entities should have error messages
			for (const failed of failedResults) {
				expect(failed.error?.message).toBeDefined()
			}
		})
	})

	describe('entity not found', () => {
		test('should return error when trying to persist non-existent entity', async () => {
			const adapter = createMockAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			const result = await persister.persist('Article', 'nonexistent-id')

			expect(result.success).toBe(false)
		})
	})
})
