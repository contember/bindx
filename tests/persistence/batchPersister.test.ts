import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	BatchPersister,
	type BackendAdapter,
	type TransactionResult,
	type TransactionMutation,
} from '@contember/bindx'

// Mock adapter that supports transactions
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

describe('BatchPersister', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let adapter: BackendAdapter
	let persister: BatchPersister

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
		adapter = createMockAdapter()
		persister = new BatchPersister(adapter, store, dispatcher)
	})

	describe('persistAll()', () => {
		test('should persist all dirty entities', async () => {
			// Setup two dirty entities
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setEntityData('Article', 'a-2', { id: 'a-2', title: 'Original 2' }, true)

			store.setFieldValue('Article', 'a-1', ['title'], 'Updated 1')
			store.setFieldValue('Article', 'a-2', ['title'], 'Updated 2')

			const result = await persister.persistAll()

			expect(result.success).toBe(true)
			expect(result.results.length).toBe(2)
			expect(result.successCount).toBe(2)
			expect(result.failedCount).toBe(0)
		})

		test('should return empty result when no dirty entities', async () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Title' }, true)

			const result = await persister.persistAll()

			expect(result.success).toBe(true)
			expect(result.results.length).toBe(0)
			expect(result.successCount).toBe(0)
		})

		test('should commit entities on success', async () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated')

			// Verify dirty before persist
			expect(store.getDirtyFields('Article', 'a-1')).toContain('title')

			await persister.persistAll()

			// Verify clean after persist
			expect(store.getDirtyFields('Article', 'a-1').length).toBe(0)
		})
	})

	describe('persist() single entity', () => {
		test('should persist a single entity', async () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated')

			const result = await persister.persist('Article', 'a-1')

			expect(result.success).toBe(true)
			expect(result.entityType).toBe('Article')
			expect(result.entityId).toBe('a-1')
			expect(result.operation).toBe('update')
		})

		test('should return error for non-dirty entity', async () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Title' }, true)

			const result = await persister.persist('Article', 'a-1')

			expect(result.success).toBe(false)
		})

		test('should handle new entity creation', async () => {
			const tempId = store.createEntity('Article', { title: 'New Article' })

			const result = await persister.persist('Article', tempId)

			expect(result.success).toBe(true)
			expect(result.operation).toBe('create')
			expect(result.persistedId).toBe('new-id-123')
		})
	})

	describe('persistFields()', () => {
		test('should persist only specified fields', async () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				title: 'Original Title',
				content: 'Original Content',
			}, true)

			store.setFieldValue('Article', 'a-1', ['title'], 'Updated Title')
			store.setFieldValue('Article', 'a-1', ['content'], 'Updated Content')

			const result = await persister.persistFields('Article', 'a-1', ['title'])

			expect(result.success).toBe(true)

			// Title should be committed, content should still be dirty
			const snapshot = store.getEntitySnapshot('Article', 'a-1')
			expect(snapshot?.serverData).toHaveProperty('title', 'Updated Title')
			// Content should remain dirty (serverData unchanged)
			expect(snapshot?.serverData).toHaveProperty('content', 'Original Content')
		})

		test('should return error when specified fields are not dirty', async () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Title', content: 'Content' }, true)
			store.setFieldValue('Article', 'a-1', ['content'], 'Updated')

			const result = await persister.persistFields('Article', 'a-1', ['title'])

			expect(result.success).toBe(false)
		})
	})

	describe('transactional behavior', () => {
		test('should use persistTransaction when adapter supports it', async () => {
			const transactionMock = mock(() =>
				Promise.resolve({
					ok: true,
					results: [
						{ entityType: 'Article', entityId: 'a-1', ok: true },
						{ entityType: 'Article', entityId: 'a-2', ok: true },
					],
				}),
			)

			const transactionAdapter = createMockAdapter({
				persistTransaction: transactionMock,
			})

			const transactionPersister = new BatchPersister(transactionAdapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setEntityData('Article', 'a-2', { id: 'a-2', title: 'Original' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated 1')
			store.setFieldValue('Article', 'a-2', ['title'], 'Updated 2')

			await transactionPersister.persistAll()

			expect(transactionMock).toHaveBeenCalledTimes(1)
		})

		test('should not commit any entity when transaction fails', async () => {
			const transactionAdapter = createMockAdapter({
				persistTransaction: () =>
					Promise.resolve({
						ok: false,
						results: [
							{ entityType: 'Article', entityId: 'a-1', ok: true },
							{ entityType: 'Article', entityId: 'a-2', ok: false, errorMessage: 'Validation failed' },
						],
					}),
			})

			const transactionPersister = new BatchPersister(transactionAdapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setEntityData('Article', 'a-2', { id: 'a-2', title: 'Original' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated 1')
			store.setFieldValue('Article', 'a-2', ['title'], 'Updated 2')

			const result = await transactionPersister.persistAll()

			expect(result.success).toBe(false)

			// Both entities should still be dirty (transaction rolled back)
			expect(store.getDirtyFields('Article', 'a-1')).toContain('title')
			expect(store.getDirtyFields('Article', 'a-2')).toContain('title')
		})
	})

	describe('dependency ordering', () => {
		test('should persist creates before updates', async () => {
			const persistOrder: string[] = []

			const orderTrackingAdapter = createMockAdapter({
				persistTransaction: (mutations) => {
					for (const m of mutations) {
						persistOrder.push(`${m.operation}:${m.entityId}`)
					}
					return Promise.resolve({
						ok: true,
						results: mutations.map(m => ({
							entityType: m.entityType,
							entityId: m.entityId,
							ok: true,
							persistedId: m.operation === 'create' ? 'new-id' : undefined,
						})),
					})
				},
			})

			const orderPersister = new BatchPersister(orderTrackingAdapter, store, dispatcher)

			// Create a new entity
			const tempId = store.createEntity('Article', { title: 'New' })

			// Update an existing entity
			store.setEntityData('Article', 'existing-1', { id: 'existing-1', title: 'Old' }, true)
			store.setFieldValue('Article', 'existing-1', ['title'], 'Updated')

			await orderPersister.persistAll()

			// Creates should come before updates
			expect(persistOrder[0]).toMatch(/^create:/)
			expect(persistOrder[1]).toMatch(/^update:/)
		})
	})

	describe('client validation errors', () => {
		test('should block persist when entity has client errors', async () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated')
			store.addFieldError('Article', 'a-1', 'title', {
				message: 'Title is required',
				source: 'client',
			})

			const result = await persister.persistAll()

			expect(result.success).toBe(false)
			expect(result.failedCount).toBe(1)
		})
	})

	describe('ChangeRegistry integration', () => {
		test('should track in-flight status during persist', async () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated')

			const registry = persister.getChangeRegistry()

			// Create a delayed adapter to check in-flight status
			let inFlightDuringPersist = false
			const delayedAdapter = createMockAdapter({
				persistTransaction: async (mutations) => {
					inFlightDuringPersist = registry.isInFlight('Article', 'a-1')
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

			const delayedPersister = new BatchPersister(delayedAdapter, store, dispatcher)

			await delayedPersister.persistAll()

			expect(inFlightDuringPersist).toBe(true)
			expect(registry.isInFlight('Article', 'a-1')).toBe(false)
		})
	})
})
