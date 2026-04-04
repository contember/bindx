import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
	SnapshotStore,
	ActionDispatcher,
	EventEmitter,
	setField,
	resetEntity,
	commitEntity,
	setEntityData,
	connectRelation,
	disconnectRelation,
	deleteRelation,
	setLoadState,
	setPersisting,
	addFieldError,
	clearFieldErrors,
	addEntityError,
	clearEntityErrors,
	clearAllErrors,
	createServerError,
	createLoadError,
} from '@contember/bindx'
import { createTestStore, createTestDispatcher, createMockSubscriber } from '../shared/unitTestHelpers.js'

describe('ActionDispatcher', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let eventEmitter: EventEmitter

	beforeEach(() => {
		const setup = createTestDispatcher()
		store = setup.store
		dispatcher = setup.dispatcher
		eventEmitter = setup.eventEmitter
	})

	// ==================== Sync Dispatch ====================

	describe('Sync Dispatch', () => {
		describe('SET_FIELD', () => {
			test('should set field value in store', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)

				dispatcher.dispatch(setField('Article', 'a-1', ['title'], 'Updated'))

				const snapshot = store.getEntitySnapshot('Article', 'a-1')
				expect(snapshot?.data).toHaveProperty('title', 'Updated')
			})

			test('should emit field:changed event', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)

				const listener = mock(() => {})
				eventEmitter.on('field:changed', listener)

				dispatcher.dispatch(setField('Article', 'a-1', ['title'], 'Updated'))

				expect(listener).toHaveBeenCalledTimes(1)
			})
		})

		describe('RESET_ENTITY', () => {
			test('should reset entity to server data', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
				store.setFieldValue('Article', 'a-1', ['title'], 'Modified')

				dispatcher.dispatch(resetEntity('Article', 'a-1'))

				const snapshot = store.getEntitySnapshot('Article', 'a-1')
				expect(snapshot?.data).toHaveProperty('title', 'Original')
			})
		})

		describe('COMMIT_ENTITY', () => {
			test('should commit entity changes', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
				store.setFieldValue('Article', 'a-1', ['title'], 'Modified')

				dispatcher.dispatch(commitEntity('Article', 'a-1'))

				const snapshot = store.getEntitySnapshot('Article', 'a-1')
				expect(snapshot?.serverData).toHaveProperty('title', 'Modified')
			})
		})

		describe('SET_ENTITY_DATA', () => {
			test('should set entity data in store', () => {
				dispatcher.dispatch(setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true))

				const snapshot = store.getEntitySnapshot('Article', 'a-1')
				expect(snapshot?.data).toHaveProperty('title', 'Test')
			})

			test('should set server data when isServerData is true', () => {
				dispatcher.dispatch(setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true))

				const snapshot = store.getEntitySnapshot('Article', 'a-1')
				expect(snapshot?.serverData).toHaveProperty('title', 'Test')
			})
		})

		describe('CONNECT_RELATION', () => {
			test('should connect relation in store', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)

				dispatcher.dispatch(connectRelation('Article', 'a-1', 'author', 'auth-1'))

				const relation = store.getRelation('Article', 'a-1', 'author')
				expect(relation?.currentId).toBe('auth-1')
				expect(relation?.state).toBe('connected')
			})
		})

		describe('DISCONNECT_RELATION', () => {
			test('should disconnect relation in store', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', author: { id: 'auth-1' } }, true)
				store.setRelation('Article', 'a-1', 'author', {
					currentId: 'auth-1',
					state: 'connected',
				})

				dispatcher.dispatch(disconnectRelation('Article', 'a-1', 'author'))

				const relation = store.getRelation('Article', 'a-1', 'author')
				expect(relation?.currentId).toBeNull()
				expect(relation?.state).toBe('disconnected')
			})
		})

		describe('DELETE_RELATION', () => {
			test('should mark relation as deleted', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', author: { id: 'auth-1' } }, true)
				store.setRelation('Article', 'a-1', 'author', {
					currentId: 'auth-1',
					state: 'connected',
				})

				dispatcher.dispatch(deleteRelation('Article', 'a-1', 'author'))

				const relation = store.getRelation('Article', 'a-1', 'author')
				expect(relation?.state).toBe('deleted')
			})
		})

		describe('SET_LOAD_STATE', () => {
			test('should set load state in store', () => {
				dispatcher.dispatch(setLoadState('Article', 'a-1', 'loading'))

				const loadState = store.getLoadState('Article', 'a-1')
				expect(loadState?.status).toBe('loading')
			})

			test('should set error in load state', () => {
				const error = createLoadError(new Error('Network error'))
				dispatcher.dispatch(setLoadState('Article', 'a-1', 'error', error))

				const loadState = store.getLoadState('Article', 'a-1')
				expect(loadState?.status).toBe('error')
				expect(loadState?.error).toBe(error)
			})
		})

		describe('SET_PERSISTING', () => {
			test('should set persisting state in store', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)

				dispatcher.dispatch(setPersisting('Article', 'a-1', true))

				expect(store.isPersisting('Article', 'a-1')).toBe(true)
			})
		})

		describe('Error Actions', () => {
			test('ADD_FIELD_ERROR should add error to field', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)

				dispatcher.dispatch(addFieldError('Article', 'a-1', 'title', {
					message: 'Title is required',
					source: 'client',
				}))

				const errors = store.getFieldErrors('Article', 'a-1', 'title')
				expect(errors.length).toBe(1)
				expect(errors[0]?.message).toBe('Title is required')
			})

			test('CLEAR_FIELD_ERRORS should clear field errors', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.addFieldError('Article', 'a-1', 'title', { message: 'Error', source: 'client' })

				dispatcher.dispatch(clearFieldErrors('Article', 'a-1', 'title'))

				expect(store.getFieldErrors('Article', 'a-1', 'title').length).toBe(0)
			})

			test('ADD_ENTITY_ERROR should add error to entity', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)

				dispatcher.dispatch(addEntityError('Article', 'a-1', createServerError('Entity error')))

				const errors = store.getEntityErrors('Article', 'a-1')
				expect(errors.length).toBe(1)
			})

			test('CLEAR_ENTITY_ERRORS should clear entity errors', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.addEntityError('Article', 'a-1', { message: 'Error', source: 'client' })

				dispatcher.dispatch(clearEntityErrors('Article', 'a-1'))

				expect(store.getEntityErrors('Article', 'a-1').length).toBe(0)
			})

			test('CLEAR_ALL_ERRORS should clear all errors', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.addFieldError('Article', 'a-1', 'title', { message: 'Error', source: 'client' })
				store.addEntityError('Article', 'a-1', { message: 'Error', source: 'client' })

				dispatcher.dispatch(clearAllErrors('Article', 'a-1'))

				expect(store.hasAnyErrors('Article', 'a-1')).toBe(false)
			})
		})

		describe('List Actions', () => {
			test('CONNECT_TO_LIST should connect to has-many', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.getOrCreateHasMany('Article', 'a-1', 'tags')

				dispatcher.dispatch({
					type: 'CONNECT_TO_LIST',
					entityType: 'Article',
					entityId: 'a-1',
					fieldName: 'tags',
					itemId: 't-1',
				})

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.plannedConnections.has('t-1')).toBe(true)
			})

			test('ADD_TO_LIST should create entity and add to has-many', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.getOrCreateHasMany('Article', 'a-1', 'tags')

				dispatcher.dispatch({
					type: 'ADD_TO_LIST',
					entityType: 'Article',
					entityId: 'a-1',
					fieldName: 'tags',
					targetType: 'Tag',
					itemData: { name: 'New Tag' },
				})

				const orderedIds = store.getHasManyOrderedIds('Article', 'a-1', 'tags')
				expect(orderedIds.length).toBe(1)
			})

			test('REMOVE_FROM_LIST should remove from has-many', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])

				dispatcher.dispatch({
					type: 'REMOVE_FROM_LIST',
					entityType: 'Article',
					entityId: 'a-1',
					fieldName: 'tags',
					itemKey: 't-1',
					removalType: 'disconnect',
				})

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.plannedRemovals.has('t-1')).toBe(true)
				expect(state?.plannedRemovals.get('t-1')).toBe('disconnect')
			})

			test('REMOVE_FROM_LIST with delete removalType should plan delete', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1'])

				dispatcher.dispatch({
					type: 'REMOVE_FROM_LIST',
					entityType: 'Article',
					entityId: 'a-1',
					fieldName: 'tags',
					itemKey: 't-1',
					removalType: 'delete',
				})

				const state = store.getHasMany('Article', 'a-1', 'tags')
				expect(state?.plannedRemovals.has('t-1')).toBe(true)
				expect(state?.plannedRemovals.get('t-1')).toBe('delete')
			})

			test('MOVE_IN_LIST should move item in has-many', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.getOrCreateHasMany('Article', 'a-1', 'tags', ['t-1', 't-2', 't-3'])

				dispatcher.dispatch({
					type: 'MOVE_IN_LIST',
					entityType: 'Article',
					entityId: 'a-1',
					fieldName: 'tags',
					fromIndex: 0,
					toIndex: 2,
				})

				const orderedIds = store.getHasManyOrderedIds('Article', 'a-1', 'tags')
				expect(orderedIds).toEqual(['t-2', 't-3', 't-1'])
			})
		})
	})

	// ==================== Sync Dispatch with Interceptors ====================

	describe('Sync Dispatch with Interceptors', () => {
		test('should cancel action when sync interceptor cancels', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)

			eventEmitter.intercept('field:changing', () => ({ action: 'cancel' as const }))

			dispatcher.dispatch(setField('Article', 'a-1', ['title'], 'Updated'))

			expect(store.getEntitySnapshot('Article', 'a-1')?.data).toHaveProperty('title', 'Original')
		})

		test('should apply modified value from sync interceptor', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)

			eventEmitter.intercept('field:changing', (event) => ({
				action: 'modify' as const,
				event: { ...event, newValue: 'Interceptor Modified' },
			}))

			dispatcher.dispatch(setField('Article', 'a-1', ['title'], 'Updated'))

			expect(store.getEntitySnapshot('Article', 'a-1')?.data).toHaveProperty('title', 'Interceptor Modified')
		})

		test('should not emit after event when sync interceptor cancels', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)

			eventEmitter.intercept('field:changing', () => ({ action: 'cancel' as const }))

			const listener = mock(() => {})
			eventEmitter.on('field:changed', listener)

			dispatcher.dispatch(setField('Article', 'a-1', ['title'], 'Updated'))

			expect(listener).not.toHaveBeenCalled()
		})

		test('should cancel CONNECT_RELATION when sync interceptor cancels', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)

			eventEmitter.intercept('relation:connecting', () => ({ action: 'cancel' as const }))

			dispatcher.dispatch(connectRelation('Article', 'a-1', 'author', 'auth-1'))

			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(relation).toBeUndefined()
		})

		test('should skip async interceptors with sync dispatch', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)

			// Register an async interceptor that would cancel
			eventEmitter.intercept('field:changing', async () => ({ action: 'cancel' as const }))

			// Sync dispatch should skip the async interceptor and proceed
			dispatcher.dispatch(setField('Article', 'a-1', ['title'], 'Updated'))

			expect(store.getEntitySnapshot('Article', 'a-1')?.data).toHaveProperty('title', 'Updated')
		})
	})

	// ==================== Middleware ====================

	describe('Middleware', () => {
		test('should execute middleware before action', () => {
			const middleware = mock(() => undefined)
			dispatcher.addMiddleware(middleware)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			dispatcher.dispatch(setField('Article', 'a-1', ['title'], 'Updated'))

			expect(middleware).toHaveBeenCalledTimes(1)
		})

		test('should pass action and store to middleware', () => {
			const middleware = mock(() => undefined)
			dispatcher.addMiddleware(middleware)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			const action = setField('Article', 'a-1', ['title'], 'Updated')
			dispatcher.dispatch(action)

			expect(middleware).toHaveBeenCalledWith(action, store)
		})

		test('should cancel action when middleware returns false', () => {
			dispatcher.addMiddleware(() => false)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			dispatcher.dispatch(setField('Article', 'a-1', ['title'], 'Updated'))

			const snapshot = store.getEntitySnapshot('Article', 'a-1')
			expect(snapshot?.data).toHaveProperty('title', 'Original')
		})

		test('should execute multiple middlewares in order', () => {
			const callOrder: number[] = []

			dispatcher.addMiddleware(() => {
				callOrder.push(1)
				return undefined
			})
			dispatcher.addMiddleware(() => {
				callOrder.push(2)
				return undefined
			})

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			dispatcher.dispatch(setField('Article', 'a-1', ['title'], 'Updated'))

			expect(callOrder).toEqual([1, 2])
		})

		test('should remove middleware', () => {
			const middleware = mock(() => undefined)
			dispatcher.addMiddleware(middleware)
			dispatcher.removeMiddleware(middleware)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			dispatcher.dispatch(setField('Article', 'a-1', ['title'], 'Updated'))

			expect(middleware).not.toHaveBeenCalled()
		})
	})

	// ==================== Async Dispatch ====================

	describe('Async Dispatch with Interceptors', () => {
		test('should execute action when interceptor allows', async () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)

			const result = await dispatcher.dispatchAsync(setField('Article', 'a-1', ['title'], 'Updated'))

			expect(result).toBe(true)
			expect(store.getEntitySnapshot('Article', 'a-1')?.data).toHaveProperty('title', 'Updated')
		})

		test('should cancel action when interceptor cancels', async () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)

			eventEmitter.intercept('field:changing', () => ({ action: 'cancel' as const }))

			const result = await dispatcher.dispatchAsync(setField('Article', 'a-1', ['title'], 'Updated'))

			expect(result).toBe(false)
			expect(store.getEntitySnapshot('Article', 'a-1')?.data).toHaveProperty('title', 'Original')
		})

		test('should apply modified value from interceptor', async () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)

			eventEmitter.intercept('field:changing', (event) => ({
				action: 'modify' as const,
				event: { ...event, newValue: 'Interceptor Modified' },
			}))

			await dispatcher.dispatchAsync(setField('Article', 'a-1', ['title'], 'Updated'))

			expect(store.getEntitySnapshot('Article', 'a-1')?.data).toHaveProperty('title', 'Interceptor Modified')
		})

		test('should apply modified targetId from interceptor for CONNECT_RELATION', async () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)

			eventEmitter.intercept('relation:connecting', (event) => ({
				action: 'modify' as const,
				event: { ...event, targetId: 'modified-auth-id' },
			}))

			await dispatcher.dispatchAsync(connectRelation('Article', 'a-1', 'author', 'original-auth-id'))

			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(relation?.currentId).toBe('modified-auth-id')
		})

		test('should emit after event after successful dispatch', async () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)

			const listener = mock(() => {})
			eventEmitter.on('field:changed', listener)

			await dispatcher.dispatchAsync(setField('Article', 'a-1', ['title'], 'Updated'))

			expect(listener).toHaveBeenCalledTimes(1)
		})

		test('should not emit after event when interceptor cancels', async () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)

			eventEmitter.intercept('field:changing', () => ({ action: 'cancel' as const }))

			const listener = mock(() => {})
			eventEmitter.on('field:changed', listener)

			await dispatcher.dispatchAsync(setField('Article', 'a-1', ['title'], 'Updated'))

			expect(listener).not.toHaveBeenCalled()
		})

		test('should respect middleware in async dispatch', async () => {
			dispatcher.addMiddleware(() => false)

			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			const result = await dispatcher.dispatchAsync(setField('Article', 'a-1', ['title'], 'Updated'))

			expect(result).toBe(false)
		})
	})

	// ==================== Event Emitter Access ====================

	describe('Event Emitter Access', () => {
		test('should return event emitter', () => {
			expect(dispatcher.getEventEmitter()).toBe(eventEmitter)
		})

		test('should create default event emitter if not provided', () => {
			const dispatcherWithoutEmitter = new ActionDispatcher(store)
			expect(dispatcherWithoutEmitter.getEventEmitter()).toBeDefined()
		})
	})

	// ==================== Placeholder Data ====================

	describe('SET_PLACEHOLDER_DATA', () => {
		test('should set placeholder data on relation', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: null,
				serverId: null,
				state: 'disconnected',
				serverState: 'disconnected',
				placeholderData: {},
			})

			dispatcher.dispatch({
				type: 'SET_PLACEHOLDER_DATA',
				entityType: 'Article',
				entityId: 'a-1',
				fieldName: 'author',
				fieldPath: ['name'],
				value: 'New Author Name',
			})

			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(relation?.placeholderData).toHaveProperty('name', 'New Author Name')
		})

		test('should merge with existing placeholder data', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.getOrCreateRelation('Article', 'a-1', 'author', {
				currentId: null,
				serverId: null,
				state: 'disconnected',
				serverState: 'disconnected',
				placeholderData: { email: 'test@example.com' },
			})

			dispatcher.dispatch({
				type: 'SET_PLACEHOLDER_DATA',
				entityType: 'Article',
				entityId: 'a-1',
				fieldName: 'author',
				fieldPath: ['name'],
				value: 'New Author Name',
			})

			const relation = store.getRelation('Article', 'a-1', 'author')
			expect(relation?.placeholderData).toHaveProperty('name', 'New Author Name')
			expect(relation?.placeholderData).toHaveProperty('email', 'test@example.com')
		})
	})

	// ==================== Relation Actions ====================

	describe('Relation Actions', () => {
		describe('RESET_RELATION', () => {
			test('should reset relation to server state', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', author: { id: 'auth-1' } }, true)
				store.getOrCreateRelation('Article', 'a-1', 'author', {
					currentId: 'auth-2',
					serverId: 'auth-1',
					state: 'connected',
					serverState: 'connected',
					placeholderData: {},
				})

				dispatcher.dispatch({
					type: 'RESET_RELATION',
					entityType: 'Article',
					entityId: 'a-1',
					fieldName: 'author',
				})

				const relation = store.getRelation('Article', 'a-1', 'author')
				expect(relation?.currentId).toBe('auth-1')
			})
		})

		describe('COMMIT_RELATION', () => {
			test('should commit relation changes', () => {
				store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
				store.getOrCreateRelation('Article', 'a-1', 'author', {
					currentId: 'auth-2',
					serverId: 'auth-1',
					state: 'connected',
					serverState: 'connected',
					placeholderData: {},
				})

				dispatcher.dispatch({
					type: 'COMMIT_RELATION',
					entityType: 'Article',
					entityId: 'a-1',
					fieldName: 'author',
				})

				const relation = store.getRelation('Article', 'a-1', 'author')
				expect(relation?.serverId).toBe('auth-2')
			})
		})
	})
})
