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

describe('BatchPersister - Dependency Ordering', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
	})

	describe('creates before updates', () => {
		test('should persist new entities before existing entities that might reference them', async () => {
			const operationOrder: string[] = []

			const adapter = createMockAdapter({
				persistTransaction: async (mutations) => {
					for (const m of mutations) {
						operationOrder.push(`${m.operation}:${m.entityType}:${m.entityId}`)
					}
					return {
						ok: true,
						results: mutations.map(m => ({
							entityType: m.entityType,
							entityId: m.entityId,
							ok: true,
							persistedId: m.operation === 'create' ? 'persisted-id' : undefined,
						})),
					}
				},
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			// Create a new entity
			const tempId = store.createEntity('Author', { name: 'New Author' })

			// Update an existing entity
			store.setEntityData('Article', 'article-1', { id: 'article-1', title: 'Existing' }, true)
			store.setFieldValue('Article', 'article-1', ['title'], 'Updated')

			await persister.persistAll()

			// Creates should come before updates
			const createIndex = operationOrder.findIndex(op => op.startsWith('create:'))
			const updateIndex = operationOrder.findIndex(op => op.startsWith('update:'))

			expect(createIndex).toBeLessThan(updateIndex)
		})

		test('should persist multiple new entities before updates', async () => {
			const operationOrder: string[] = []

			const adapter = createMockAdapter({
				persistTransaction: async (mutations) => {
					for (const m of mutations) {
						operationOrder.push(`${m.operation}:${m.entityType}:${m.entityId}`)
					}
					return {
						ok: true,
						results: mutations.map(m => ({
							entityType: m.entityType,
							entityId: m.entityId,
							ok: true,
							persistedId: m.operation === 'create' ? `persisted-${m.entityId}` : undefined,
						})),
					}
				},
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			// Create multiple new entities
			store.createEntity('Author', { name: 'Author 1' })
			store.createEntity('Tag', { name: 'Tag 1' })

			// Update multiple existing entities
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Article 1' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated 1')

			store.setEntityData('Article', 'a-2', { id: 'a-2', title: 'Article 2' }, true)
			store.setFieldValue('Article', 'a-2', ['title'], 'Updated 2')

			await persister.persistAll()

			// All creates should come before all updates
			const firstUpdateIndex = operationOrder.findIndex(op => op.startsWith('update:'))
			const lastCreateIndex = operationOrder.reduce((lastIndex, op, i) =>
				op.startsWith('create:') ? i : lastIndex, -1)

			expect(lastCreateIndex).toBeLessThan(firstUpdateIndex)
		})
	})

	describe('deletes ordering', () => {
		test('should handle deletes appropriately in the order', async () => {
			const operationOrder: string[] = []

			const adapter = createMockAdapter({
				persistTransaction: async (mutations) => {
					for (const m of mutations) {
						operationOrder.push(`${m.operation}:${m.entityType}:${m.entityId}`)
					}
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

			// Create a new entity
			store.createEntity('Tag', { name: 'New Tag' })

			// Update an existing entity
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Article' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated')

			// Delete an existing entity
			store.setEntityData('Comment', 'c-1', { id: 'c-1', text: 'Comment' }, true)
			store.scheduleForDeletion('Comment', 'c-1')

			await persister.persistAll()

			// Verify all operations are included
			expect(operationOrder.some(op => op.startsWith('create:'))).toBe(true)
			expect(operationOrder.some(op => op.startsWith('update:'))).toBe(true)
			expect(operationOrder.some(op => op.startsWith('delete:'))).toBe(true)
		})
	})

	describe('mixed operations', () => {
		test('should handle complex mix of creates, updates, and deletes', async () => {
			const operations: TransactionMutation[] = []

			const adapter = createMockAdapter({
				persistTransaction: async (mutations) => {
					operations.push(...mutations)
					return {
						ok: true,
						results: mutations.map(m => ({
							entityType: m.entityType,
							entityId: m.entityId,
							ok: true,
							persistedId: m.operation === 'create' ? `new-${m.entityId}` : undefined,
						})),
					}
				},
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			// Mix of operations
			store.createEntity('Author', { name: 'New Author' })
			store.createEntity('Tag', { name: 'New Tag' })

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Existing 1' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated 1')

			store.setEntityData('Article', 'a-2', { id: 'a-2', title: 'Existing 2' }, true)
			store.setFieldValue('Article', 'a-2', ['title'], 'Updated 2')

			store.setEntityData('Comment', 'c-1', { id: 'c-1', text: 'To delete' }, true)
			store.scheduleForDeletion('Comment', 'c-1')

			const result = await persister.persistAll()

			expect(result.success).toBe(true)

			// Count operations by type
			const creates = operations.filter(op => op.operation === 'create')
			const updates = operations.filter(op => op.operation === 'update')
			const deletes = operations.filter(op => op.operation === 'delete')

			expect(creates.length).toBe(2)
			expect(updates.length).toBe(2)
			expect(deletes.length).toBe(1)
		})
	})

	describe('result mapping', () => {
		test('should correctly map results back to entities after reordering', async () => {
			const adapter = createMockAdapter({
				persistTransaction: async (mutations) => ({
					ok: true,
					results: mutations.map(m => ({
						entityType: m.entityType,
						entityId: m.entityId,
						ok: true,
						persistedId: m.operation === 'create' ? `server-id-for-${m.entityId}` : undefined,
					})),
				}),
			})

			const persister = new BatchPersister(adapter, store, dispatcher)

			const tempId = store.createEntity('Author', { name: 'New Author' })

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Existing' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated')

			const result = await persister.persistAll()

			expect(result.success).toBe(true)
			expect(result.results.length).toBe(2)

			// Find the create result
			const createResult = result.results.find(r => r.operation === 'create')
			expect(createResult).toBeDefined()
			expect(createResult?.entityType).toBe('Author')
			expect(createResult?.persistedId).toBe(`server-id-for-${tempId}`)

			// Find the update result
			const updateResult = result.results.find(r => r.operation === 'update')
			expect(updateResult).toBeDefined()
			expect(updateResult?.entityType).toBe('Article')
			expect(updateResult?.entityId).toBe('a-1')
		})
	})
})
