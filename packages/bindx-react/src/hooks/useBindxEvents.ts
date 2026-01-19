import { useEffect, useRef } from 'react'
import { useBindxContext } from './BackendAdapterContext.js'
import type {
	EventTypeMap,
	AfterEventTypes,
	BeforeEventTypes,
	EventListener,
	Interceptor,
} from '@contember/bindx'

// ============================================================================
// Event Listener Hooks
// ============================================================================

/**
 * Subscribe to a global bindx event.
 * Automatically handles subscription lifecycle and cleanup.
 *
 * @example
 * ```tsx
 * useOnEvent('field:changed', (event) => {
 *   console.log('Any field changed:', event)
 * })
 * ```
 */
export function useOnEvent<T extends AfterEventTypes>(
	eventType: T,
	listener: EventListener<EventTypeMap[T]>,
): void {
	const { dispatcher } = useBindxContext()
	const emitter = dispatcher.getEventEmitter()
	const listenerRef = useRef(listener)

	// Always keep the ref up to date
	listenerRef.current = listener

	useEffect(() => {
		const handler: EventListener<EventTypeMap[T]> = (event) => {
			listenerRef.current(event)
		}

		const unsub = emitter.on(eventType, handler)
		return unsub
	}, [emitter, eventType])
}

/**
 * Subscribe to an entity-scoped bindx event.
 * Automatically handles subscription lifecycle and cleanup.
 *
 * @example
 * ```tsx
 * useOnEntityEvent('entity:persisted', 'Article', articleId, (event) => {
 *   toast.success('Article saved!')
 * })
 * ```
 */
export function useOnEntityEvent<T extends AfterEventTypes>(
	eventType: T,
	entityType: string,
	entityId: string,
	listener: EventListener<EventTypeMap[T]>,
): void {
	const { dispatcher } = useBindxContext()
	const emitter = dispatcher.getEventEmitter()
	const listenerRef = useRef(listener)

	// Always keep the ref up to date
	listenerRef.current = listener

	useEffect(() => {
		const handler: EventListener<EventTypeMap[T]> = (event) => {
			listenerRef.current(event)
		}

		const unsub = emitter.onEntity(eventType, entityType, entityId, handler)
		return unsub
	}, [emitter, eventType, entityType, entityId])
}

/**
 * Subscribe to a field-scoped bindx event.
 * Automatically handles subscription lifecycle and cleanup.
 *
 * @example
 * ```tsx
 * useOnFieldEvent('field:changed', 'Article', articleId, 'title', (event) => {
 *   console.log('Title changed:', event.oldValue, '->', event.newValue)
 * })
 * ```
 */
export function useOnFieldEvent<T extends AfterEventTypes>(
	eventType: T,
	entityType: string,
	entityId: string,
	fieldName: string,
	listener: EventListener<EventTypeMap[T]>,
): void {
	const { dispatcher } = useBindxContext()
	const emitter = dispatcher.getEventEmitter()
	const listenerRef = useRef(listener)

	// Always keep the ref up to date
	listenerRef.current = listener

	useEffect(() => {
		const handler: EventListener<EventTypeMap[T]> = (event) => {
			listenerRef.current(event)
		}

		const unsub = emitter.onField(eventType, entityType, entityId, fieldName, handler)
		return unsub
	}, [emitter, eventType, entityType, entityId, fieldName])
}

// ============================================================================
// Interceptor Hooks
// ============================================================================

/**
 * Add a global interceptor for a before event.
 * Automatically handles subscription lifecycle and cleanup.
 *
 * @example
 * ```tsx
 * useIntercept('field:changing', (event) => {
 *   if (event.newValue === '') {
 *     return { action: 'cancel' }
 *   }
 *   return { action: 'continue' }
 * })
 * ```
 */
export function useIntercept<T extends BeforeEventTypes>(
	eventType: T,
	interceptor: Interceptor<EventTypeMap[T]>,
): void {
	const { dispatcher } = useBindxContext()
	const emitter = dispatcher.getEventEmitter()
	const interceptorRef = useRef(interceptor)

	// Always keep the ref up to date
	interceptorRef.current = interceptor

	useEffect(() => {
		const handler: Interceptor<EventTypeMap[T]> = (event) => {
			return interceptorRef.current(event)
		}

		const unsub = emitter.intercept(eventType, handler)
		return unsub
	}, [emitter, eventType])
}

/**
 * Add an entity-scoped interceptor.
 * Automatically handles subscription lifecycle and cleanup.
 *
 * @example
 * ```tsx
 * useInterceptEntity('entity:persisting', 'Article', articleId, (event) => {
 *   if (!isValid) {
 *     return { action: 'cancel' }
 *   }
 *   return { action: 'continue' }
 * })
 * ```
 */
export function useInterceptEntity<T extends BeforeEventTypes>(
	eventType: T,
	entityType: string,
	entityId: string,
	interceptor: Interceptor<EventTypeMap[T]>,
): void {
	const { dispatcher } = useBindxContext()
	const emitter = dispatcher.getEventEmitter()
	const interceptorRef = useRef(interceptor)

	// Always keep the ref up to date
	interceptorRef.current = interceptor

	useEffect(() => {
		const handler: Interceptor<EventTypeMap[T]> = (event) => {
			return interceptorRef.current(event)
		}

		const unsub = emitter.interceptEntity(eventType, entityType, entityId, handler)
		return unsub
	}, [emitter, eventType, entityType, entityId])
}

/**
 * Add a field-scoped interceptor.
 * Automatically handles subscription lifecycle and cleanup.
 *
 * @example
 * ```tsx
 * useInterceptField('field:changing', 'Article', articleId, 'title', (event) => {
 *   if (event.newValue === '') {
 *     return { action: 'cancel' }
 *   }
 *   return { action: 'continue' }
 * })
 * ```
 */
export function useInterceptField<T extends BeforeEventTypes>(
	eventType: T,
	entityType: string,
	entityId: string,
	fieldName: string,
	interceptor: Interceptor<EventTypeMap[T]>,
): void {
	const { dispatcher } = useBindxContext()
	const emitter = dispatcher.getEventEmitter()
	const interceptorRef = useRef(interceptor)

	// Always keep the ref up to date
	interceptorRef.current = interceptor

	useEffect(() => {
		const handler: Interceptor<EventTypeMap[T]> = (event) => {
			return interceptorRef.current(event)
		}

		const unsub = emitter.interceptField(eventType, entityType, entityId, fieldName, handler)
		return unsub
	}, [emitter, eventType, entityType, entityId, fieldName])
}

