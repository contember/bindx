import { describe, test, expect, beforeEach } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	BatchPersister,
	setField,
	type BackendAdapter,
	type EntityPersistedEvent,
	type EntityPersistFailedEvent,
	type EntityPersistingEvent,
} from '@contember/bindx'

interface PersistCall {
	entityType: string
	entityId: string
	changes: Record<string, unknown>
}

interface RecordingAdapter {
	adapter: BackendAdapter
	persistCalls: PersistCall[]
	createCalls: Array<{ entityType: string; data: Record<string, unknown> }>
}

function createRecordingAdapter(options?: { failWith?: string }): RecordingAdapter {
	const persistCalls: PersistCall[] = []
	const createCalls: Array<{ entityType: string; data: Record<string, unknown> }> = []

	const adapter: BackendAdapter = {
		query: () => Promise.resolve([]),
		persist: (entityType, entityId, changes) => {
			persistCalls.push({ entityType, entityId, changes })
			return options?.failWith
				? Promise.resolve({ ok: false, errorMessage: options.failWith })
				: Promise.resolve({ ok: true })
		},
		create: (entityType, data) => {
			createCalls.push({ entityType, data })
			return options?.failWith
				? Promise.resolve({ ok: false, errorMessage: options.failWith })
				: Promise.resolve({ ok: true, data: { id: 'server-id-1', ...data } })
		},
		delete: () => Promise.resolve({ ok: true }),
	}

	return { adapter, persistCalls, createCalls }
}

describe('BatchPersister persist lifecycle events', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher

	beforeEach(() => {
		store = new SnapshotStore()
		dispatcher = new ActionDispatcher(store)
	})

	describe('entity:persisting', () => {
		test('a write made by an interceptor goes out in the same persist', async () => {
			const { adapter, persistCalls } = createRecordingAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original', slug: 'original' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated')

			dispatcher.getEventEmitter().intercept('entity:persisting', () => {
				// The before-persist hook normalizes another field — it must ride along.
				dispatcher.dispatch(setField('Article', 'a-1', ['slug'], 'updated'))
			})

			const result = await persister.persistAll()

			expect(result.success).toBe(true)
			expect(persistCalls).toHaveLength(1)
			expect(persistCalls[0]?.changes).toEqual({ title: 'Updated', slug: 'updated' })
			expect(store.getDirtyFields('Article', 'a-1')).toHaveLength(0)
		})

		test('entity-scoped interceptor fires only for its own entity', async () => {
			const { adapter } = createRecordingAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'One' }, true)
			store.setEntityData('Article', 'a-2', { id: 'a-2', title: 'Two' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'One updated')
			store.setFieldValue('Article', 'a-2', ['title'], 'Two updated')

			const scoped: EntityPersistingEvent[] = []
			dispatcher.getEventEmitter().interceptEntity('entity:persisting', 'Article', 'a-1', event => {
				scoped.push(event)
				return { action: 'continue' }
			})

			await persister.persistAll()

			expect(scoped).toHaveLength(1)
			expect(scoped[0]?.entityId).toBe('a-1')
			expect(scoped[0]?.isNew).toBe(false)
		})

		test('reports isNew for a create', async () => {
			const { adapter } = createRecordingAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			const tempId = store.createEntity('Article', { title: 'New' })

			const events: EntityPersistingEvent[] = []
			dispatcher.getEventEmitter().intercept('entity:persisting', event => {
				events.push(event)
			})

			await persister.persist('Article', tempId)

			expect(events).toHaveLength(1)
			expect(events[0]?.entityId).toBe(tempId)
			expect(events[0]?.isNew).toBe(true)
		})
	})

	describe('entity:persisted', () => {
		test('carries the server-assigned id for a create', async () => {
			const { adapter } = createRecordingAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			const tempId = store.createEntity('Article', { title: 'New' })

			const events: EntityPersistedEvent[] = []
			dispatcher.getEventEmitter().on('entity:persisted', event => {
				events.push(event)
			})

			await persister.persist('Article', tempId)

			expect(events).toHaveLength(1)
			expect(events[0]?.entityType).toBe('Article')
			expect(events[0]?.entityId).toBe(tempId)
			expect(events[0]?.isNew).toBe(true)
			expect(events[0]?.persistedId).toBe('server-id-1')
		})

		test('fires once the persisting flag is already cleared', async () => {
			const { adapter } = createRecordingAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated')

			const observed: boolean[] = []
			dispatcher.getEventEmitter().onEntity('entity:persisted', 'Article', 'a-1', () => {
				observed.push(store.isPersisting('Article', 'a-1'))
			})

			await persister.persistAll()

			expect(observed).toEqual([false])
		})
	})

	describe('entity:persistFailed', () => {
		test('fires with the server error on a failed persist', async () => {
			const { adapter } = createRecordingAdapter({ failWith: 'Server rejected the update' })
			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Updated')

			const failures: EntityPersistFailedEvent[] = []
			const successes: EntityPersistedEvent[] = []
			dispatcher.getEventEmitter().on('entity:persistFailed', event => {
				failures.push(event)
			})
			dispatcher.getEventEmitter().on('entity:persisted', event => {
				successes.push(event)
			})

			const result = await persister.persistAll()

			expect(result.success).toBe(false)
			expect(successes).toHaveLength(0)
			expect(failures).toHaveLength(1)
			expect(failures[0]?.entityType).toBe('Article')
			expect(failures[0]?.entityId).toBe('a-1')
			expect(failures[0]?.isNew).toBe(false)
			expect(failures[0]?.error).toBeInstanceOf(Error)
			expect(failures[0]?.error.message).toBe('Server rejected the update')
		})

		test('fires when the persist itself throws, and the error still propagates', async () => {
			const { adapter } = createRecordingAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			// A dirty relation with no MutationCollector configured makes buildMutations throw.
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setRelation('Article', 'a-1', 'author', { currentId: 'author-1', state: 'connected' })

			const failures: EntityPersistFailedEvent[] = []
			dispatcher.getEventEmitter().on('entity:persistFailed', event => {
				failures.push(event)
			})

			await expect(persister.persistAll()).rejects.toThrow(/MutationCollector/)

			expect(failures).toHaveLength(1)
			expect(failures[0]?.entityId).toBe('a-1')
			expect(failures[0]?.error.message).toMatch(/MutationCollector/)
		})
	})

	describe('cancellation', () => {
		test('a cancelling interceptor excludes just that entity', async () => {
			const { adapter, persistCalls } = createRecordingAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'One' }, true)
			store.setEntityData('Article', 'a-2', { id: 'a-2', title: 'Two' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'One updated')
			store.setFieldValue('Article', 'a-2', ['title'], 'Two updated')

			dispatcher.getEventEmitter().interceptEntity('entity:persisting', 'Article', 'a-1', () => ({
				action: 'cancel',
			}))

			const persisted: EntityPersistedEvent[] = []
			const failed: EntityPersistFailedEvent[] = []
			dispatcher.getEventEmitter().on('entity:persisted', event => persisted.push(event))
			dispatcher.getEventEmitter().on('entity:persistFailed', event => failed.push(event))

			const result = await persister.persistAll()

			// The sibling still went out.
			expect(persistCalls).toHaveLength(1)
			expect(persistCalls[0]?.entityId).toBe('a-2')
			expect(store.getDirtyFields('Article', 'a-2')).toHaveLength(0)

			// The vetoed entity kept its edit and is left in a clean, non-in-flight state.
			expect(store.getDirtyFields('Article', 'a-1')).toContain('title')
			expect(store.isPersisting('Article', 'a-1')).toBe(false)
			expect(persister.getChangeRegistry().isInFlight('Article', 'a-1')).toBe(false)

			// Counted as skipped, never as a success.
			expect(result.success).toBe(false)
			expect(result.successCount).toBe(1)
			expect(result.failedCount).toBe(0)
			expect(result.skippedCount).toBe(1)
			const cancelledEntry = result.results.find(r => r.entityId === 'a-1')
			expect(cancelledEntry?.success).toBe(false)
			expect(cancelledEntry?.error?.message).toMatch(/cancelled/)

			// No after-event is emitted for a vetoed entity.
			expect(persisted.map(e => e.entityId)).toEqual(['a-2'])
			expect(failed).toHaveLength(0)
		})

		test('cancelling the only entity leaves nothing in flight', async () => {
			const { adapter, persistCalls } = createRecordingAdapter()
			const persister = new BatchPersister(adapter, store, dispatcher)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'One' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'One updated')

			dispatcher.getEventEmitter().intercept('entity:persisting', () => ({ action: 'cancel' }))

			const result = await persister.persist('Article', 'a-1')

			expect(persistCalls).toHaveLength(0)
			expect(result.success).toBe(false)
			expect(result.error?.message).toMatch(/cancelled/)
			expect(store.isPersisting('Article', 'a-1')).toBe(false)
			expect(persister.getChangeRegistry().isInFlight('Article', 'a-1')).toBe(false)
			expect(persister.getChangeRegistry().hasInFlight()).toBe(false)
		})
	})
})
