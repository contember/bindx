import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	BatchPersister,
	SchemaRegistry,
	type SchemaDefinition,
	type BackendAdapter,
	type TransactionResult,
	type TransactionMutation,
} from '@contember/bindx'

interface PersistSchema {
	Article: { id: string; title: string; comments?: Array<{ id: string; text: string }> }
	Comment: { id: string; text: string }
	[key: string]: object
}

// Minimal schema enabling relation persistence (auto-creates a MutationCollector),
// so a created child nests into its parent's mutation.
const persistSchema: SchemaDefinition<PersistSchema> = {
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

// Helper to create a mock adapter
function createMockAdapter(options?: {
	failAll?: boolean
	persistTransaction?: (mutations: readonly TransactionMutation[]) => Promise<TransactionResult>
}): BackendAdapter {
	const failAll = options?.failAll ?? false

	return {
		query: mock(() => Promise.resolve([])),
		persist: mock((entityType: string, id: string, changes: Record<string, unknown>) => {
			if (failAll) {
				return Promise.resolve({ ok: false, errorMessage: 'Persist failed' })
			}
			return Promise.resolve({ ok: true })
		}),
		create: mock((entityType: string, data: Record<string, unknown>) => {
			if (failAll) {
				return Promise.resolve({ ok: false, errorMessage: 'Create failed' })
			}
			return Promise.resolve({ ok: true, data: { id: 'persisted-id-123', ...data } })
		}),
		delete: mock((entityType: string, id: string) => {
			if (failAll) {
				return Promise.resolve({ ok: false, errorMessage: 'Delete failed' })
			}
			return Promise.resolve({ ok: true })
		}),
		persistTransaction: options?.persistTransaction,
	}
}

// Helper to create a failing adapter
function createFailingAdapter(): BackendAdapter {
	return {
		query: mock(() => Promise.resolve([])),
		persist: mock(() => Promise.resolve({ ok: false, errorMessage: 'Failed' })),
		create: mock(() => Promise.resolve({ ok: false, errorMessage: 'Failed' })),
		delete: mock(() => Promise.resolve({ ok: false, errorMessage: 'Failed' })),
		persistTransaction: mock(async (mutations: readonly TransactionMutation[]) => ({
			ok: false,
			results: mutations.map(m => ({
				entityType: m.entityType,
				entityId: m.entityId,
				ok: false,
				errorMessage: 'Server error',
			})),
		})),
	}
}

describe('pessimistic update mode', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
	})

	describe('provider-level configuration', () => {
		test('should use optimistic mode by default', () => {
			const adapter = createMockAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)
			expect(persister.getDefaultUpdateMode()).toBe('optimistic')
		})

		test('should accept pessimistic mode in options', () => {
			const adapter = createMockAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher, {
				defaultUpdateMode: 'pessimistic',
			})
			expect(persister.getDefaultUpdateMode()).toBe('pessimistic')
		})
	})

	describe('pessimistic update flow', () => {
		test('should commit changes on successful persist', async () => {
			const adapter = createMockAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			// Load initial data
			store.setEntityData('Article', '1', { id: '1', title: 'Original Title' }, true)

			// Make a change
			store.setFieldValue('Article', '1', ['title'], 'Updated Title')
			expect(store.getEntitySnapshot('Article', '1')?.data).toEqual({
				id: '1',
				title: 'Updated Title',
			})

			// Persist with pessimistic mode
			const result = await persister.persist('Article', '1', { updateMode: 'pessimistic' })

			// Should succeed
			expect(result.success).toBe(true)

			// Final state should be the updated value, committed
			const finalSnapshot = store.getEntitySnapshot('Article', '1')
			expect(finalSnapshot?.data).toEqual({ id: '1', title: 'Updated Title' })
			expect(finalSnapshot?.serverData).toEqual({ id: '1', title: 'Updated Title' })
		})

		test('should preserve local edits for retry when persist fails in pessimistic mode', async () => {
			const adapter = createFailingAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			// Load initial data
			store.setEntityData('Article', '1', { id: '1', title: 'Original Title' }, true)

			// Make a change
			store.setFieldValue('Article', '1', ['title'], 'Failed Update')

			// Persist with pessimistic mode
			const result = await persister.persist('Article', '1', { updateMode: 'pessimistic' })

			// Should fail
			expect(result.success).toBe(false)

			// P2: the user's edit is restored and kept dirty so they can fix the error
			// and retry — not stuck showing server data the pessimistic reset left.
			const finalSnapshot = store.getEntitySnapshot('Article', '1')
			expect((finalSnapshot?.data as { title: string })?.title).toBe('Failed Update')
			expect((finalSnapshot?.serverData as { title: string })?.title).toBe('Original Title')
			expect(store.getAllDirtyEntities()).toContainEqual({
				entityType: 'Article',
				entityId: '1',
				changeType: 'update',
			})
		})

		test('should preserve a created entity for retry when persist fails in pessimistic mode', async () => {
			const adapter = createFailingAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			const tempId = store.createEntity('Article', { title: 'Draft' })

			const result = await persister.persist('Article', tempId, { updateMode: 'pessimistic' })
			expect(result.success).toBe(false)

			// P2: the create survives as a pending create the user can retry — not
			// stranded in a half-state nor dropped by the post-persist sweep.
			expect(store.hasEntity('Article', tempId)).toBe(true)
			expect((store.getEntitySnapshot('Article', tempId)?.data as { title: string })?.title).toBe('Draft')
			expect(store.getAllDirtyEntities()).toContainEqual({
				entityType: 'Article',
				entityId: tempId,
				changeType: 'create',
			})
		})

		test('should commit changes on success with optimistic mode', async () => {
			const adapter = createMockAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			// Load initial data
			store.setEntityData('Article', '1', { id: '1', title: 'Original Title' }, true)

			// Make a change
			store.setFieldValue('Article', '1', ['title'], 'Updated Title')

			// Persist with optimistic mode (default)
			const result = await persister.persist('Article', '1', { updateMode: 'optimistic' })

			// Should succeed
			expect(result.success).toBe(true)

			// Final state should be committed
			const finalSnapshot = store.getEntitySnapshot('Article', '1')
			expect(finalSnapshot?.data).toEqual({ id: '1', title: 'Updated Title' })
			expect(finalSnapshot?.serverData).toEqual({ id: '1', title: 'Updated Title' })
		})

		test('should keep changes on failure in optimistic mode without rollback', async () => {
			const adapter = createFailingAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			// Load initial data
			store.setEntityData('Article', '1', { id: '1', title: 'Original Title' }, true)

			// Make a change
			store.setFieldValue('Article', '1', ['title'], 'Failed Update')

			// Persist with optimistic mode (no rollback)
			const result = await persister.persist('Article', '1', {
				updateMode: 'optimistic',
				rollbackOnError: false,
			})

			// Should fail
			expect(result.success).toBe(false)

			// State should still show the local change (optimistic keeps changes)
			const finalSnapshot = store.getEntitySnapshot('Article', '1')
			expect((finalSnapshot?.data as { title: string })?.title).toBe('Failed Update')
			// Server data remains unchanged
			expect((finalSnapshot?.serverData as { title: string })?.title).toBe('Original Title')
		})
	})

	describe('per-operation override', () => {
		test('should allow per-operation override of provider default', async () => {
			const adapter = createMockAdapter()
			// Create persister with pessimistic default
			const persister = new BatchPersister(adapter, store, dispatcher, {
				defaultUpdateMode: 'pessimistic',
			})

			// Load initial data
			store.setEntityData('Article', '1', { id: '1', title: 'Original Title' }, true)

			// Make a change
			store.setFieldValue('Article', '1', ['title'], 'Updated Title')

			// Persist with explicit optimistic mode (overriding default)
			const result = await persister.persist('Article', '1', { updateMode: 'optimistic' })

			// Should succeed
			expect(result.success).toBe(true)
		})
	})

	describe('loading state handling', () => {
		test('should set isPersisting during pessimistic persist', async () => {
			let wasPersisting = false

			const adapter: BackendAdapter = {
				query: mock(() => Promise.resolve([])),
				persist: mock(async () => {
					// Check persisting state during operation
					wasPersisting = store.isPersisting('Article', '1')
					return { ok: true }
				}),
				create: mock(() => Promise.resolve({ ok: true, data: {} })),
				delete: mock(() => Promise.resolve({ ok: true })),
			}

			const persister = new BatchPersister(adapter, store, dispatcher)

			// Load initial data
			store.setEntityData('Article', '1', { id: '1', title: 'Original Title' }, true)

			// Make a change
			store.setFieldValue('Article', '1', ['title'], 'Updated Title')

			// Persist
			await persister.persist('Article', '1', { updateMode: 'pessimistic' })

			// Should have been persisting during the operation
			expect(wasPersisting).toBe(true)

			// Should not be persisting after completion
			expect(store.isPersisting('Article', '1')).toBe(false)
		})
	})

	describe('batch operations with pessimistic mode', () => {
		test('should handle multiple entities in pessimistic mode', async () => {
			const adapter = createMockAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			// Load initial data
			store.setEntityData('Article', '1', { id: '1', title: 'Title 1' }, true)
			store.setEntityData('Article', '2', { id: '2', title: 'Title 2' }, true)

			// Make changes
			store.setFieldValue('Article', '1', ['title'], 'Updated 1')
			store.setFieldValue('Article', '2', ['title'], 'Updated 2')

			// Persist all with pessimistic mode
			const result = await persister.persistAll({ updateMode: 'pessimistic' })

			// Should succeed
			expect(result.success).toBe(true)
			expect(result.successCount).toBe(2)

			// Both should be committed
			expect((store.getEntitySnapshot('Article', '1')?.data as { title: string })?.title).toBe('Updated 1')
			expect((store.getEntitySnapshot('Article', '2')?.data as { title: string })?.title).toBe('Updated 2')
		})

		test('should preserve local edits for retry on batch failure in pessimistic mode', async () => {
			const adapter = createFailingAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			// Load initial data
			store.setEntityData('Article', '1', { id: '1', title: 'Title 1' }, true)
			store.setEntityData('Article', '2', { id: '2', title: 'Title 2' }, true)

			// Make changes
			store.setFieldValue('Article', '1', ['title'], 'Updated 1')
			store.setFieldValue('Article', '2', ['title'], 'Updated 2')

			// Persist all with pessimistic mode
			const result = await persister.persistAll({ updateMode: 'pessimistic' })

			// Should fail
			expect(result.success).toBe(false)

			// P2: both edits are preserved (kept dirty) for a retry rather than reverted.
			expect((store.getEntitySnapshot('Article', '1')?.data as { title: string })?.title).toBe('Updated 1')
			expect((store.getEntitySnapshot('Article', '2')?.data as { title: string })?.title).toBe('Updated 2')
			expect((store.getEntitySnapshot('Article', '1')?.serverData as { title: string })?.title).toBe('Title 1')
			expect((store.getEntitySnapshot('Article', '2')?.serverData as { title: string })?.title).toBe('Title 2')
		})

		// PERSIST-1 regression: on a PARTIAL failure (one mutation succeeds, the
		// transaction fails overall via the non-atomic sequential fallback — the only
		// path any real adapter takes), the succeeded-but-reset entity must NOT be
		// stranded at the server view. Every captured entity is restored for retry.
		test('should restore even the individually-succeeded entity on a partial batch failure', async () => {
			// One mutation succeeds, the other fails → transaction reported as failed.
			const adapter: BackendAdapter = {
				query: mock(() => Promise.resolve([])),
				persist: mock((_entityType: string, id: string) =>
					id === '2'
						? Promise.resolve({ ok: false, errorMessage: 'Failed 2' })
						: Promise.resolve({ ok: true }),
				),
				create: mock(() => Promise.resolve({ ok: true, data: {} })),
				delete: mock(() => Promise.resolve({ ok: true })),
			}
			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', '1', { id: '1', title: 'Title 1' }, true)
			store.setEntityData('Article', '2', { id: '2', title: 'Title 2' }, true)
			store.setFieldValue('Article', '1', ['title'], 'Updated 1')
			store.setFieldValue('Article', '2', ['title'], 'Updated 2')

			const result = await persister.persistAll({ updateMode: 'pessimistic' })
			expect(result.success).toBe(false)

			// '1' succeeded individually but the transaction failed — it must be restored
			// to its dirty edit (not left showing the reset server view) and kept dirty.
			expect((store.getEntitySnapshot('Article', '1')?.data as { title: string })?.title).toBe('Updated 1')
			expect((store.getEntitySnapshot('Article', '2')?.data as { title: string })?.title).toBe('Updated 2')
			expect(store.getAllDirtyEntities()).toContainEqual({
				entityType: 'Article', entityId: '1', changeType: 'update',
			})
			expect(store.getAllDirtyEntities()).toContainEqual({
				entityType: 'Article', entityId: '2', changeType: 'update',
			})
		})

		// PERSIST-1 regression: an inline-created child of a reset parent must survive a
		// partial batch failure — restore-all re-establishes the parent's edge so the
		// child stays reachable, and the post-persist sweep runs only on success.
		test('should preserve an inline-created child of a succeeded parent on partial batch failure', async () => {
			const schema = new SchemaRegistry(persistSchema)
			const adapter: BackendAdapter = {
				query: mock(() => Promise.resolve([])),
				persist: mock((_entityType: string, id: string) =>
					id === '2'
						? Promise.resolve({ ok: false, errorMessage: 'Failed 2' })
						: Promise.resolve({ ok: true, data: { id } }),
				),
				create: mock(() => Promise.resolve({ ok: true, data: {} })),
				delete: mock(() => Promise.resolve({ ok: true })),
			}
			const persister = new BatchPersister(adapter, store, dispatcher, { schema })

			// Server parent A with a created child + a dirty title (so A is an update that
			// gets reset pre-transaction), plus an unrelated server parent B that fails.
			store.setEntityData('Article', '1', { id: '1', title: 'A', comments: [] }, true)
			store.setEntityData('Article', '2', { id: '2', title: 'B' }, true)
			store.setFieldValue('Article', '1', ['title'], 'A edited')
			store.setFieldValue('Article', '2', ['title'], 'B edited')

			const childId = store.createEntity('Comment', { text: 'draft' })
			store.addToHasMany('Article', '1', 'comments', childId)
			store.registerParentChild('Article', '1', 'Comment', childId)

			const result = await persister.persistAll({ updateMode: 'pessimistic' })
			expect(result.success).toBe(false)

			// The created child must NOT be swept: A's edge is restored (reachable again)
			// and the sweep is gated to full success. It survives as a pending create.
			expect(store.hasEntity('Comment', childId)).toBe(true)
			expect(store.getAllDirtyEntities()).toContainEqual({
				entityType: 'Comment', entityId: childId, changeType: 'create',
			})
			// A's own edit is preserved for retry as well.
			expect((store.getEntitySnapshot('Article', '1')?.data as { title: string })?.title).toBe('A edited')
		})
	})
})
