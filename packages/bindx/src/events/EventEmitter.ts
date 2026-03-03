/**
 * EventEmitter manages event subscriptions and dispatching.
 * Supports both scoped (entity/field-level) and global subscriptions.
 */

import type {
	AfterEvent,
	AfterEventTypes,
	BeforeEvent,
	BeforeEventTypes,
	EventListener,
	EventTypeMap,
	FieldScopedEvent,
	Interceptor,
	InterceptorResult,
	Unsubscribe,
} from './types.js'

interface ScopeKey {
	entityType: string
	entityId: string
	fieldName?: string
}

/**
 * EventEmitter for the bindx event system.
 *
 * Provides:
 * - Global event subscriptions (all events of a type)
 * - Entity-scoped subscriptions (events for a specific entity)
 * - Field-scoped subscriptions (events for a specific field/relation)
 * - Interceptors for before-events (can cancel or modify)
 */
export class EventEmitter {
	// Global listeners by event type
	private readonly globalListeners = new Map<string, Set<EventListener<AfterEvent>>>()

	// Scoped listeners: "eventType:entityType:entityId[:fieldName]" -> Set<listener>
	private readonly scopedListeners = new Map<string, Set<EventListener<AfterEvent>>>()

	// Global interceptors by event type
	private readonly globalInterceptors = new Map<string, Set<Interceptor<BeforeEvent>>>()

	// Scoped interceptors
	private readonly scopedInterceptors = new Map<string, Set<Interceptor<BeforeEvent>>>()

	// ============================================================================
	// Listener Subscription Methods
	// ============================================================================

	/**
	 * Subscribe to an event globally (receives all events of that type).
	 */
	on<T extends AfterEventTypes>(
		eventType: T,
		listener: EventListener<EventTypeMap[T] & AfterEvent>,
	): Unsubscribe {
		const listeners = this.getOrCreateSet(this.globalListeners, eventType)
		listeners.add(listener as EventListener<AfterEvent>)
		return () => listeners.delete(listener as EventListener<AfterEvent>)
	}

	/**
	 * Subscribe to an event for a specific entity.
	 */
	onEntity<T extends AfterEventTypes>(
		eventType: T,
		entityType: string,
		entityId: string,
		listener: EventListener<EventTypeMap[T] & AfterEvent>,
	): Unsubscribe {
		const key = this.buildScopeKey(eventType, { entityType, entityId })
		const listeners = this.getOrCreateSet(this.scopedListeners, key)
		listeners.add(listener as EventListener<AfterEvent>)
		return () => listeners.delete(listener as EventListener<AfterEvent>)
	}

	/**
	 * Subscribe to an event for a specific field or relation.
	 */
	onField<T extends AfterEventTypes>(
		eventType: T,
		entityType: string,
		entityId: string,
		fieldName: string,
		listener: EventListener<EventTypeMap[T] & AfterEvent>,
	): Unsubscribe {
		const key = this.buildScopeKey(eventType, { entityType, entityId, fieldName })
		const listeners = this.getOrCreateSet(this.scopedListeners, key)
		listeners.add(listener as EventListener<AfterEvent>)
		return () => listeners.delete(listener as EventListener<AfterEvent>)
	}

	// ============================================================================
	// Interceptor Subscription Methods
	// ============================================================================

	/**
	 * Add a global interceptor for a before event.
	 * Interceptors can cancel or modify the action.
	 */
	intercept<T extends BeforeEventTypes>(
		eventType: T,
		interceptor: Interceptor<EventTypeMap[T] & BeforeEvent>,
	): Unsubscribe {
		const interceptors = this.getOrCreateSet(this.globalInterceptors, eventType)
		interceptors.add(interceptor as Interceptor<BeforeEvent>)
		return () => interceptors.delete(interceptor as Interceptor<BeforeEvent>)
	}

	/**
	 * Add an entity-scoped interceptor.
	 */
	interceptEntity<T extends BeforeEventTypes>(
		eventType: T,
		entityType: string,
		entityId: string,
		interceptor: Interceptor<EventTypeMap[T] & BeforeEvent>,
	): Unsubscribe {
		const key = this.buildScopeKey(eventType, { entityType, entityId })
		const interceptors = this.getOrCreateSet(this.scopedInterceptors, key)
		interceptors.add(interceptor as Interceptor<BeforeEvent>)
		return () => interceptors.delete(interceptor as Interceptor<BeforeEvent>)
	}

	/**
	 * Add a field-scoped interceptor.
	 */
	interceptField<T extends BeforeEventTypes>(
		eventType: T,
		entityType: string,
		entityId: string,
		fieldName: string,
		interceptor: Interceptor<EventTypeMap[T] & BeforeEvent>,
	): Unsubscribe {
		const key = this.buildScopeKey(eventType, { entityType, entityId, fieldName })
		const interceptors = this.getOrCreateSet(this.scopedInterceptors, key)
		interceptors.add(interceptor as Interceptor<BeforeEvent>)
		return () => interceptors.delete(interceptor as Interceptor<BeforeEvent>)
	}

	// ============================================================================
	// Dispatch Methods
	// ============================================================================

	/**
	 * Runs interceptors for a before event.
	 * Returns the (possibly modified) event or null if cancelled.
	 */
	async runInterceptors<T extends BeforeEvent>(event: T): Promise<T | null> {
		let currentEvent: T = event

		// Get field name if this is a field-scoped event
		const fieldName = this.getFieldNameFromEvent(event)

		// Run scoped interceptors first (more specific takes precedence)
		// Field-level interceptors
		if (fieldName) {
			const fieldKey = this.buildScopeKey(event.type, {
				entityType: event.entityType,
				entityId: event.entityId,
				fieldName,
			})
			const result = await this.runInterceptorSet(
				this.scopedInterceptors.get(fieldKey),
				currentEvent,
			)
			if (result === null) return null
			// Type assertion safe: interceptors return same event type
			currentEvent = result as T
		}

		// Entity-level interceptors
		const entityKey = this.buildScopeKey(event.type, {
			entityType: event.entityType,
			entityId: event.entityId,
		})
		const entityResult = await this.runInterceptorSet(
			this.scopedInterceptors.get(entityKey),
			currentEvent,
		)
		if (entityResult === null) return null
		// Type assertion safe: interceptors return same event type
		currentEvent = entityResult as T

		// Global interceptors
		const globalResult = await this.runInterceptorSet(
			this.globalInterceptors.get(event.type),
			currentEvent,
		)
		if (globalResult === null) return null

		// Type assertion safe: interceptors return same event type
		return globalResult as T
	}

	/**
	 * Emits an after event to all listeners.
	 */
	emit<T extends AfterEvent>(event: T): void {
		// Get field name if this is a field-scoped event
		const fieldName = this.getFieldNameFromEvent(event)

		// Emit to scoped listeners first (most specific to least specific)
		// Field-level listeners
		if (fieldName) {
			const fieldKey = this.buildScopeKey(event.type, {
				entityType: event.entityType,
				entityId: event.entityId,
				fieldName,
			})
			this.notifyListeners(this.scopedListeners.get(fieldKey), event)
		}

		// Entity-level listeners
		const entityKey = this.buildScopeKey(event.type, {
			entityType: event.entityType,
			entityId: event.entityId,
		})
		this.notifyListeners(this.scopedListeners.get(entityKey), event)

		// Global listeners
		this.notifyListeners(this.globalListeners.get(event.type), event)
	}

	// ============================================================================
	// Helper Methods
	// ============================================================================

	/**
	 * Builds a scope key for listener/interceptor lookup.
	 */
	private buildScopeKey(eventType: string, scope: ScopeKey): string {
		const parts = [eventType, scope.entityType, scope.entityId]
		if (scope.fieldName) {
			parts.push(scope.fieldName)
		}
		return parts.join(':')
	}

	/**
	 * Gets or creates a Set in a Map.
	 */
	private getOrCreateSet<T>(map: Map<string, Set<T>>, key: string): Set<T> {
		let set = map.get(key)
		if (!set) {
			set = new Set()
			map.set(key, set)
		}
		return set
	}

	/**
	 * Extracts fieldName from a field-scoped event.
	 */
	private getFieldNameFromEvent(event: BeforeEvent | AfterEvent): string | undefined {
		if ('fieldName' in event && typeof event.fieldName === 'string') {
			return event.fieldName
		}
		return undefined
	}

	/**
	 * Notifies all listeners in a set.
	 */
	private notifyListeners<T extends AfterEvent>(
		listeners: Set<EventListener<T>> | undefined,
		event: T,
	): void {
		if (!listeners) return
		for (const listener of listeners) {
			try {
				listener(event)
			} catch (error) {
				console.error('[Bindx EventEmitter] Listener error:', error)
			}
		}
	}

	/**
	 * Runs interceptors for a before event synchronously.
	 * Returns the (possibly modified) event or null if cancelled.
	 * If an interceptor returns a Promise, logs a warning and skips it.
	 */
	runInterceptorsSync<T extends BeforeEvent>(event: T): T | null {
		let currentEvent: T = event

		// Get field name if this is a field-scoped event
		const fieldName = this.getFieldNameFromEvent(event)

		// Run scoped interceptors first (more specific takes precedence)
		// Field-level interceptors
		if (fieldName) {
			const fieldKey = this.buildScopeKey(event.type, {
				entityType: event.entityType,
				entityId: event.entityId,
				fieldName,
			})
			const result = this.runInterceptorSetSync(
				this.scopedInterceptors.get(fieldKey),
				currentEvent,
			)
			if (result === null) return null
			currentEvent = result as T
		}

		// Entity-level interceptors
		const entityKey = this.buildScopeKey(event.type, {
			entityType: event.entityType,
			entityId: event.entityId,
		})
		const entityResult = this.runInterceptorSetSync(
			this.scopedInterceptors.get(entityKey),
			currentEvent,
		)
		if (entityResult === null) return null
		currentEvent = entityResult as T

		// Global interceptors
		const globalResult = this.runInterceptorSetSync(
			this.globalInterceptors.get(event.type),
			currentEvent,
		)
		if (globalResult === null) return null

		return globalResult as T
	}

	/**
	 * Runs all interceptors in a set.
	 * Returns the (possibly modified) event or null if cancelled.
	 */
	private async runInterceptorSet<T extends BeforeEvent>(
		interceptors: Set<Interceptor<T>> | undefined,
		event: T,
	): Promise<T | null> {
		if (!interceptors || interceptors.size === 0) return event

		let currentEvent = event
		for (const interceptor of interceptors) {
			try {
				const result = await interceptor(currentEvent)

				// No explicit return or undefined means continue
				if (result === undefined || result === null) {
					continue
				}

				const typedResult = result as InterceptorResult<T>

				if (typedResult.action === 'cancel') {
					return null
				}

				if (typedResult.action === 'modify' && 'event' in typedResult) {
					currentEvent = typedResult.event
				}
				// 'continue' - just proceed with current event
			} catch (error) {
				console.error('[Bindx EventEmitter] Interceptor error:', error)
				// On error, cancel the action for safety
				return null
			}
		}

		return currentEvent
	}

	/**
	 * Runs all interceptors in a set synchronously.
	 * If an interceptor returns a Promise, logs a warning and skips it.
	 */
	private runInterceptorSetSync<T extends BeforeEvent>(
		interceptors: Set<Interceptor<T>> | undefined,
		event: T,
	): T | null {
		if (!interceptors || interceptors.size === 0) return event

		let currentEvent = event
		for (const interceptor of interceptors) {
			try {
				const result = interceptor(currentEvent)

				// If the interceptor returned a Promise, skip it with a warning
				if (result !== null && result !== undefined && typeof result === 'object' && 'then' in result) {
					console.warn(
						'[Bindx EventEmitter] Async interceptor used with synchronous dispatch. ' +
						'Use dispatchAsync() for async interceptors.',
					)
					continue
				}

				// No explicit return or undefined means continue
				if (result === undefined || result === null) {
					continue
				}

				const typedResult = result as InterceptorResult<T>

				if (typedResult.action === 'cancel') {
					return null
				}

				if (typedResult.action === 'modify' && 'event' in typedResult) {
					currentEvent = typedResult.event
				}
				// 'continue' - just proceed with current event
			} catch (error) {
				console.error('[Bindx EventEmitter] Interceptor error:', error)
				// On error, cancel the action for safety
				return null
			}
		}

		return currentEvent
	}

	/**
	 * Clears all listeners and interceptors.
	 * Useful for testing or cleanup.
	 */
	clear(): void {
		this.globalListeners.clear()
		this.scopedListeners.clear()
		this.globalInterceptors.clear()
		this.scopedInterceptors.clear()
	}

	/**
	 * Returns the number of listeners for a given event type.
	 * Useful for debugging.
	 */
	listenerCount(eventType: string): number {
		let count = 0
		const global = this.globalListeners.get(eventType)
		if (global) count += global.size

		// Count scoped listeners
		for (const [key, listeners] of this.scopedListeners) {
			if (key.startsWith(eventType + ':')) {
				count += listeners.size
			}
		}

		return count
	}
}
