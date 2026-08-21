import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { EventEmitter } from '@contember/bindx'
import type {
	FieldChangedEvent,
	FieldChangingEvent,
	RelationConnectedEvent,
	RelationConnectingEvent,
} from '@contember/bindx'

// Helper to create test events with required properties
function createFieldChangedEvent(overrides: Partial<FieldChangedEvent> = {}): FieldChangedEvent {
	return {
		type: 'field:changed',
		timestamp: Date.now(),
		entityType: 'Article',
		entityId: 'a-1',
		fieldName: 'title',
		fieldPath: ['title'],
		oldValue: 'Old',
		newValue: 'New',
		...overrides,
	}
}

function createFieldChangingEvent(overrides: Partial<FieldChangingEvent> = {}): FieldChangingEvent {
	return {
		type: 'field:changing',
		timestamp: Date.now(),
		entityType: 'Article',
		entityId: 'a-1',
		fieldName: 'title',
		fieldPath: ['title'],
		oldValue: 'Old',
		newValue: 'New',
		...overrides,
	}
}

function createRelationConnectedEvent(overrides: Partial<RelationConnectedEvent> = {}): RelationConnectedEvent {
	return {
		type: 'relation:connected',
		timestamp: Date.now(),
		entityType: 'Article',
		entityId: 'a-1',
		fieldName: 'author',
		targetId: 'auth-1',
		previousId: null,
		...overrides,
	}
}

describe('EventEmitter', () => {
	let emitter: EventEmitter

	beforeEach(() => {
		emitter = new EventEmitter()
	})

	// ==================== Global Listener Subscriptions ====================

	describe('Global Listener Subscriptions', () => {
		test('should subscribe to global events', () => {
			const listener = mock(() => {})
			emitter.on('field:changed', listener)

			const event = createFieldChangedEvent()
			emitter.emit(event)

			expect(listener).toHaveBeenCalledTimes(1)
			expect(listener).toHaveBeenCalledWith(event)
		})

		test('should support multiple global listeners', () => {
			const listener1 = mock(() => {})
			const listener2 = mock(() => {})
			emitter.on('field:changed', listener1)
			emitter.on('field:changed', listener2)

			const event = createFieldChangedEvent()
			emitter.emit(event)

			expect(listener1).toHaveBeenCalledTimes(1)
			expect(listener2).toHaveBeenCalledTimes(1)
		})

		test('should unsubscribe global listener', () => {
			const listener = mock(() => {})
			const unsubscribe = emitter.on('field:changed', listener)

			unsubscribe()

			const event = createFieldChangedEvent()
			emitter.emit(event)

			expect(listener).not.toHaveBeenCalled()
		})
	})

	// ==================== Entity-Scoped Subscriptions ====================

	describe('Entity-Scoped Subscriptions', () => {
		test('should receive events for specific entity', () => {
			const listener = mock(() => {})
			emitter.onEntity('field:changed', 'Article', 'a-1', listener)

			const event = createFieldChangedEvent()
			emitter.emit(event)

			expect(listener).toHaveBeenCalledTimes(1)
		})

		test('should not receive events for different entity', () => {
			const listener = mock(() => {})
			emitter.onEntity('field:changed', 'Article', 'a-1', listener)

			const event = createFieldChangedEvent({ entityId: 'a-2' })
			emitter.emit(event)

			expect(listener).not.toHaveBeenCalled()
		})

		test('should not receive events for different entity type', () => {
			const listener = mock(() => {})
			emitter.onEntity('field:changed', 'Article', 'a-1', listener)

			const event = createFieldChangedEvent({ entityType: 'Author', fieldName: 'name', fieldPath: ['name'] })
			emitter.emit(event)

			expect(listener).not.toHaveBeenCalled()
		})

		test('should unsubscribe entity-scoped listener', () => {
			const listener = mock(() => {})
			const unsubscribe = emitter.onEntity('field:changed', 'Article', 'a-1', listener)

			unsubscribe()

			const event = createFieldChangedEvent()
			emitter.emit(event)

			expect(listener).not.toHaveBeenCalled()
		})
	})

	// ==================== Field-Scoped Subscriptions ====================

	describe('Field-Scoped Subscriptions', () => {
		test('should receive events for specific field', () => {
			const listener = mock(() => {})
			emitter.onField('field:changed', 'Article', 'a-1', 'title', listener)

			const event = createFieldChangedEvent()
			emitter.emit(event)

			expect(listener).toHaveBeenCalledTimes(1)
		})

		test('should not receive events for different field', () => {
			const listener = mock(() => {})
			emitter.onField('field:changed', 'Article', 'a-1', 'title', listener)

			const event = createFieldChangedEvent({ fieldName: 'content', fieldPath: ['content'] })
			emitter.emit(event)

			expect(listener).not.toHaveBeenCalled()
		})

		test('should unsubscribe field-scoped listener', () => {
			const listener = mock(() => {})
			const unsubscribe = emitter.onField('field:changed', 'Article', 'a-1', 'title', listener)

			unsubscribe()

			const event = createFieldChangedEvent()
			emitter.emit(event)

			expect(listener).not.toHaveBeenCalled()
		})
	})

	// ==================== Listener Order ====================

	describe('Listener Order', () => {
		test('should emit to field, entity, then global listeners', () => {
			const callOrder: string[] = []

			emitter.onField('field:changed', 'Article', 'a-1', 'title', () => callOrder.push('field'))
			emitter.onEntity('field:changed', 'Article', 'a-1', () => callOrder.push('entity'))
			emitter.on('field:changed', () => callOrder.push('global'))

			const event = createFieldChangedEvent()
			emitter.emit(event)

			expect(callOrder).toEqual(['field', 'entity', 'global'])
		})
	})

	// ==================== Interceptors ====================

	describe('Interceptors', () => {
		describe('Global Interceptors', () => {
			test('should run interceptors before action', async () => {
				const interceptor = mock(() => ({ action: 'continue' as const }))
				emitter.intercept('field:changing', interceptor)

				const event = createFieldChangingEvent()
				await emitter.runInterceptors(event)

				expect(interceptor).toHaveBeenCalledTimes(1)
			})

			test('should allow interceptor to cancel action', async () => {
				emitter.intercept('field:changing', () => ({ action: 'cancel' as const }))

				const event = createFieldChangingEvent()
				const result = await emitter.runInterceptors(event)

				expect(result).toBeNull()
			})

			test('should allow interceptor to modify event', async () => {
				emitter.intercept('field:changing', (event) => ({
					action: 'modify' as const,
					event: { ...event, newValue: 'Modified' },
				}))

				const event = createFieldChangingEvent()
				const result = await emitter.runInterceptors(event)

				expect(result).not.toBeNull()
				expect((result as FieldChangingEvent).newValue).toBe('Modified')
			})
		})

		describe('Entity-Scoped Interceptors', () => {
			test('should run entity-scoped interceptor', async () => {
				const interceptor = mock(() => undefined)
				emitter.interceptEntity('field:changing', 'Article', 'a-1', interceptor)

				const event = createFieldChangingEvent()
				await emitter.runInterceptors(event)

				expect(interceptor).toHaveBeenCalledTimes(1)
			})

			test('should not run interceptor for different entity', async () => {
				const interceptor = mock(() => undefined)
				emitter.interceptEntity('field:changing', 'Article', 'a-1', interceptor)

				const event = createFieldChangingEvent({ entityId: 'a-2' })
				await emitter.runInterceptors(event)

				expect(interceptor).not.toHaveBeenCalled()
			})
		})

		describe('Field-Scoped Interceptors', () => {
			test('should run field-scoped interceptor', async () => {
				const interceptor = mock(() => undefined)
				emitter.interceptField('field:changing', 'Article', 'a-1', 'title', interceptor)

				const event = createFieldChangingEvent()
				await emitter.runInterceptors(event)

				expect(interceptor).toHaveBeenCalledTimes(1)
			})

			test('should not run interceptor for different field', async () => {
				const interceptor = mock(() => undefined)
				emitter.interceptField('field:changing', 'Article', 'a-1', 'title', interceptor)

				const event = createFieldChangingEvent({ fieldName: 'content', fieldPath: ['content'] })
				await emitter.runInterceptors(event)

				expect(interceptor).not.toHaveBeenCalled()
			})
		})

		describe('Interceptor Order', () => {
			test('should run interceptors in order: field, entity, global', async () => {
				const callOrder: string[] = []

				emitter.interceptField('field:changing', 'Article', 'a-1', 'title', () => {
					callOrder.push('field')
					return undefined
				})
				emitter.interceptEntity('field:changing', 'Article', 'a-1', () => {
					callOrder.push('entity')
					return undefined
				})
				emitter.intercept('field:changing', () => {
					callOrder.push('global')
					return undefined
				})

				const event = createFieldChangingEvent()
				await emitter.runInterceptors(event)

				expect(callOrder).toEqual(['field', 'entity', 'global'])
			})

			test('should stop on cancel and not run further interceptors', async () => {
				const callOrder: string[] = []

				emitter.interceptField('field:changing', 'Article', 'a-1', 'title', () => {
					callOrder.push('field')
					return { action: 'cancel' as const }
				})
				emitter.interceptEntity('field:changing', 'Article', 'a-1', () => {
					callOrder.push('entity')
					return undefined
				})

				const event = createFieldChangingEvent()
				await emitter.runInterceptors(event)

				expect(callOrder).toEqual(['field'])
			})
		})

		describe('Async Interceptors', () => {
			test('should support async interceptors', async () => {
				emitter.intercept('field:changing', async () => {
					await new Promise((resolve) => setTimeout(resolve, 10))
					return { action: 'continue' as const }
				})

				const event = createFieldChangingEvent()
				const result = await emitter.runInterceptors(event)

				expect(result).not.toBeNull()
			})

			test('should handle async interceptor errors by cancelling', async () => {
				emitter.intercept('field:changing', async () => {
					throw new Error('Interceptor error')
				})

				const event = createFieldChangingEvent()
				const result = await emitter.runInterceptors(event)

				expect(result).toBeNull()
			})
		})

		describe('Unsubscribe Interceptor', () => {
			test('should unsubscribe interceptor', async () => {
				const interceptor = mock(() => undefined)
				const unsubscribe = emitter.intercept('field:changing', interceptor)

				unsubscribe()

				const event = createFieldChangingEvent()
				await emitter.runInterceptors(event)

				expect(interceptor).not.toHaveBeenCalled()
			})
		})
	})

	// ==================== Utility Methods ====================

	describe('Utility Methods', () => {
		describe('clear', () => {
			test('should clear all listeners and interceptors', () => {
				emitter.on('field:changed', () => {})
				emitter.onEntity('field:changed', 'Article', 'a-1', () => {})
				emitter.onField('field:changed', 'Article', 'a-1', 'title', () => {})
				emitter.intercept('field:changing', () => undefined)

				emitter.clear()

				expect(emitter.listenerCount('field:changed')).toBe(0)
			})
		})

		describe('listenerCount', () => {
			test('should count global listeners', () => {
				emitter.on('field:changed', () => {})
				emitter.on('field:changed', () => {})

				expect(emitter.listenerCount('field:changed')).toBe(2)
			})

			test('should count scoped listeners', () => {
				emitter.on('field:changed', () => {})
				emitter.onEntity('field:changed', 'Article', 'a-1', () => {})
				emitter.onField('field:changed', 'Article', 'a-1', 'title', () => {})

				expect(emitter.listenerCount('field:changed')).toBe(3)
			})

			test('should return 0 for event type with no listeners', () => {
				expect(emitter.listenerCount('field:changed')).toBe(0)
			})
		})
	})

	// ==================== Error Handling ====================

	describe('Error Handling', () => {
		test('should continue emitting to other listeners on listener error', () => {
			const listener1 = mock(() => {
				throw new Error('Listener error')
			})
			const listener2 = mock(() => {})

			emitter.on('field:changed', listener1)
			emitter.on('field:changed', listener2)

			const event = createFieldChangedEvent()

			// Should not throw
			emitter.emit(event)

			expect(listener1).toHaveBeenCalled()
			expect(listener2).toHaveBeenCalled()
		})
	})

	// ==================== Events Without fieldName ====================

	describe('Events Without fieldName', () => {
		test('should handle events without fieldName property', () => {
			const listener = mock(() => {})
			emitter.onEntity('relation:connected', 'Article', 'a-1', listener)

			const event = createRelationConnectedEvent()
			emitter.emit(event)

			expect(listener).toHaveBeenCalledTimes(1)
		})
	})

	describe('Scoped subscription rekey', () => {
		const context = {
			oldKey: 'Article:__temp_1',
			newKey: 'Article:a-1',
			oldKeyPrefix: 'Article:__temp_1:',
			newKeyPrefix: 'Article:a-1:',
			oldId: '__temp_1',
			newId: 'a-1',
		}

		test('migrates merged listeners once and preserves field/entity/global order', () => {
			const order: string[] = []
			const shared = (): void => { order.push('shared') }
			emitter.onField('field:changed', 'Article', '__temp_1', 'title', () => order.push('field'))
			emitter.onEntity('field:changed', 'Article', '__temp_1', shared)
			emitter.onEntity('field:changed', 'Article', 'a-1', shared)
			emitter.onEntity('field:changed', 'Article', 'a-1', () => order.push('entity'))
			emitter.on('field:changed', () => order.push('global'))

			emitter.rekey(context)
			emitter.emit(createFieldChangedEvent({ entityId: 'a-1' }))

			expect(order).toEqual(['field', 'shared', 'entity', 'global'])
		})

		test('accepts old and new event scopes after rekey', () => {
			const listener = mock(() => {})
			emitter.onEntity('field:changed', 'Article', '__temp_1', listener)
			emitter.rekey(context)

			emitter.emit(createFieldChangedEvent({ entityId: '__temp_1' }))
			emitter.emit(createFieldChangedEvent({ entityId: 'a-1' }))

			expect(listener).toHaveBeenCalledTimes(2)
		})

		test('pre-rekey unsubscribe removes the migrated callback after a merge', () => {
			const listener = mock(() => {})
			const unsubscribe = emitter.onEntity('field:changed', 'Article', '__temp_1', listener)
			emitter.onEntity('field:changed', 'Article', 'a-1', () => {})
			emitter.rekey(context)

			unsubscribe()
			emitter.emit(createFieldChangedEvent({ entityId: 'a-1' }))

			expect(listener).not.toHaveBeenCalled()
		})

		test('migrates interceptors with order and old/new hasInterceptors lookup', () => {
			const order: string[] = []
			emitter.interceptField('field:changing', 'Article', '__temp_1', 'title', () => {
				order.push('field')
			})
			emitter.interceptEntity('field:changing', 'Article', '__temp_1', () => {
				order.push('entity')
			})
			emitter.intercept('field:changing', () => {
				order.push('global')
			})

			emitter.rekey(context)
			expect(emitter.hasInterceptors('field:changing', 'Article', '__temp_1')).toBe(true)
			expect(emitter.hasInterceptors('field:changing', 'Article', 'a-1')).toBe(true)
			emitter.runInterceptorsSync(createFieldChangingEvent({ entityId: 'a-1' }))

			expect(order).toEqual(['field', 'entity', 'global'])
		})
	})
})
