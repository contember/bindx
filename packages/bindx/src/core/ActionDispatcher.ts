import type { SnapshotStore } from '../store/SnapshotStore.js'
import type { Action } from './actions.js'
import { EventEmitter } from '../events/EventEmitter.js'
import {
	createBeforeEvent,
	createAfterEvent,
	captureStateBeforeAction,
} from '../events/eventFactory.js'

/**
 * ActionDispatcher centralizes all state mutations.
 * All changes to the store go through this dispatcher.
 *
 * Benefits:
 * - Single point of control for all mutations
 * - Easy to add logging, debugging, middleware
 * - Ensures consistent state updates
 * - Enables action replay/undo if needed
 * - Event system for subscriptions and interceptors
 */
export class ActionDispatcher {
	private readonly middlewares: ActionMiddleware[] = []
	private readonly eventEmitter: EventEmitter

	constructor(
		private readonly store: SnapshotStore,
		eventEmitter?: EventEmitter,
	) {
		this.eventEmitter = eventEmitter ?? new EventEmitter()
	}

	/**
	 * Gets the event emitter for external access.
	 */
	getEventEmitter(): EventEmitter {
		return this.eventEmitter
	}

	/**
	 * Dispatches an action to update the store.
	 * Runs synchronous interceptors (before-events) and emits after-events.
	 * Async interceptors are skipped with a warning — use dispatchAsync() for those.
	 */
	dispatch(action: Action): void {
		// Run through middlewares first
		for (const middleware of this.middlewares) {
			const result = middleware(action, this.store)
			if (result === false) {
				// Middleware can cancel the action
				return
			}
		}

		// Create and run before event through interceptors (synchronously)
		const beforeEvent = createBeforeEvent(action, this.store)
		if (beforeEvent) {
			const result = this.eventEmitter.runInterceptorsSync(beforeEvent)
			if (result === null) {
				// Interceptor cancelled the action
				return
			}
			// If event was modified, update action accordingly
			if (result !== beforeEvent) {
				action = this.updateActionFromEvent(action, result)
			}
		}

		// Capture state before execution (for after events)
		const stateBefore = captureStateBeforeAction(action, this.store)

		// Execute the action
		this.execute(action)

		// Emit after event
		const afterEvent = createAfterEvent(action, stateBefore, this.store)
		if (afterEvent) {
			this.eventEmitter.emit(afterEvent)
		}
	}

	/**
	 * Dispatches an action with full interceptor support.
	 * Returns true if the action was executed, false if it was cancelled by an interceptor.
	 */
	async dispatchAsync(action: Action): Promise<boolean> {
		// Run through middlewares first
		for (const middleware of this.middlewares) {
			const result = middleware(action, this.store)
			if (result === false) {
				return false
			}
		}

		// Create and run before event through interceptors
		const beforeEvent = createBeforeEvent(action, this.store)
		if (beforeEvent) {
			const result = await this.eventEmitter.runInterceptors(beforeEvent)
			if (result === null) {
				// Interceptor cancelled the action
				return false
			}
			// If event was modified, update action accordingly
			if (result !== beforeEvent) {
				action = this.updateActionFromEvent(action, result)
			}
		}

		// Capture state before execution (for after events)
		const stateBefore = captureStateBeforeAction(action, this.store)

		// Execute the action
		this.execute(action)

		// Emit after event
		const afterEvent = createAfterEvent(action, stateBefore, this.store)
		if (afterEvent) {
			this.eventEmitter.emit(afterEvent)
		}

		return true
	}

	/**
	 * Updates an action based on a modified before event.
	 * Used when an interceptor modifies the event.
	 */
	private updateActionFromEvent(action: Action, event: ReturnType<typeof createBeforeEvent>): Action {
		if (!event) return action

		switch (action.type) {
			case 'SET_FIELD':
				if (event.type === 'field:changing') {
					return {
						...action,
						value: event.newValue,
					}
				}
				break

			case 'CONNECT_RELATION':
				if (event.type === 'relation:connecting') {
					return {
						...action,
						targetId: event.targetId,
					}
				}
				break

			case 'CONNECT_TO_LIST':
				if (event.type === 'hasMany:connecting') {
					return {
						...action,
						itemId: event.itemId,
					}
				}
				break
		}

		return action
	}

	/**
	 * Adds a middleware to the dispatcher.
	 * Middlewares are called in order before action execution.
	 */
	addMiddleware(middleware: ActionMiddleware): void {
		this.middlewares.push(middleware)
	}

	/**
	 * Removes a middleware from the dispatcher.
	 */
	removeMiddleware(middleware: ActionMiddleware): void {
		const index = this.middlewares.indexOf(middleware)
		if (index !== -1) {
			this.middlewares.splice(index, 1)
		}
	}

	/**
	 * Executes an action, updating the store.
	 */
	private execute(action: Action): void {
		switch (action.type) {
			case 'SET_FIELD':
				this.store.setFieldValue(
					action.entityType,
					action.entityId,
					action.fieldPath,
					action.value,
				)
				break

			case 'RESET_ENTITY':
				this.store.resetEntity(action.entityType, action.entityId)
				break

			case 'COMMIT_ENTITY':
				this.store.commitEntity(action.entityType, action.entityId)
				break

			case 'SET_ENTITY_DATA':
				this.store.setEntityData(
					action.entityType,
					action.entityId,
					action.data,
					action.isServerData,
				)
				break

			case 'CONNECT_RELATION':
				this.store.setRelation(
					action.entityType,
					action.entityId,
					action.fieldName,
					{
						currentId: action.targetId,
						state: 'connected',
					},
				)
				this.store.registerParentChild(action.entityType, action.entityId, action.targetType, action.targetId)
				break

			case 'DISCONNECT_RELATION':
				this.store.setRelation(
					action.entityType,
					action.entityId,
					action.fieldName,
					{
						currentId: null,
						state: 'disconnected',
						placeholderData: {},
					},
				)
				break

			case 'DELETE_RELATION':
				this.store.setRelation(
					action.entityType,
					action.entityId,
					action.fieldName,
					{
						state: 'deleted',
					},
				)
				break

			case 'RESET_RELATION':
				this.store.resetRelation(
					action.entityType,
					action.entityId,
					action.fieldName,
				)
				break

			case 'COMMIT_RELATION':
				this.store.commitRelation(
					action.entityType,
					action.entityId,
					action.fieldName,
				)
				break

			case 'SET_PLACEHOLDER_DATA': {
				const relation = this.store.getRelation(
					action.entityType,
					action.entityId,
					action.fieldName,
				)
				const currentPlaceholderData = relation?.placeholderData ?? {}
				const newPlaceholderData = setNestedValue(
					{ ...currentPlaceholderData },
					action.fieldPath,
					action.value,
				)
				// When setting placeholder data on a disconnected relation, transition to 'creating'
				const stateUpdate = (!relation || relation.state === 'disconnected')
					? { state: 'creating' as const, placeholderData: newPlaceholderData }
					: { placeholderData: newPlaceholderData }
				this.store.setRelation(
					action.entityType,
					action.entityId,
					action.fieldName,
					stateUpdate,
				)
				break
			}

			case 'CONNECT_TO_LIST':
				this.store.planHasManyConnection(
					action.entityType,
					action.entityId,
					action.fieldName,
					action.itemId,
					action.alias,
				)
				this.store.registerParentChild(action.entityType, action.entityId, action.targetType, action.itemId)
				break

			case 'ADD_TO_LIST': {
				// Create entity if itemId not provided
				const itemId = action.itemId ?? this.store.createEntity(action.targetType, action.itemData)
				// Add to has-many relation
				this.store.addToHasMany(
					action.entityType,
					action.entityId,
					action.fieldName,
					itemId,
					action.alias,
				)
				this.store.registerParentChild(action.entityType, action.entityId, action.targetType, itemId)
				break
			}

			case 'REMOVE_FROM_LIST':
				this.store.removeFromHasMany(
					action.entityType,
					action.entityId,
					action.fieldName,
					action.itemKey,
					action.removalType,
					action.alias,
				)
				break

			case 'MOVE_IN_LIST':
				this.store.moveInHasMany(
					action.entityType,
					action.entityId,
					action.fieldName,
					action.fromIndex,
					action.toIndex,
					action.alias,
				)
				break

			case 'SET_LOAD_STATE':
				this.store.setLoadState(
					action.entityType,
					action.entityId,
					action.status,
					action.error,
				)
				break

			case 'SET_PERSISTING':
				this.store.setPersisting(
					action.entityType,
					action.entityId,
					action.isPersisting,
				)
				break

			case 'ADD_FIELD_ERROR':
				this.store.addFieldError(
					action.entityType,
					action.entityId,
					action.fieldName,
					action.error,
				)
				break

			case 'CLEAR_FIELD_ERRORS':
				this.store.clearFieldErrors(
					action.entityType,
					action.entityId,
					action.fieldName,
					action.source,
				)
				break

			case 'ADD_ENTITY_ERROR':
				this.store.addEntityError(
					action.entityType,
					action.entityId,
					action.error,
				)
				break

			case 'CLEAR_ENTITY_ERRORS':
				this.store.clearEntityErrors(
					action.entityType,
					action.entityId,
					action.source,
				)
				break

			case 'ADD_RELATION_ERROR':
				this.store.addRelationError(
					action.entityType,
					action.entityId,
					action.relationName,
					action.error,
				)
				break

			case 'CLEAR_RELATION_ERRORS':
				this.store.clearRelationErrors(
					action.entityType,
					action.entityId,
					action.relationName,
					action.source,
				)
				break

			case 'CLEAR_ALL_SERVER_ERRORS':
				this.store.clearAllServerErrors(
					action.entityType,
					action.entityId,
				)
				break

			case 'CLEAR_ALL_ERRORS':
				this.store.clearAllErrors(
					action.entityType,
					action.entityId,
				)
				break

			default:
				// Exhaustive check
				const _exhaustive: never = action
				throw new Error(`Unknown action type: ${(_exhaustive as Action).type}`)
		}
	}
}

/**
 * Middleware function type.
 * Can inspect/modify actions before execution.
 * Return false to cancel the action.
 */
export type ActionMiddleware = (action: Action, store: SnapshotStore) => boolean | void

/**
 * Creates a logging middleware for debugging.
 */
export function createLoggingMiddleware(
	prefix: string = '[Bindx]',
): ActionMiddleware {
	return (action) => {
		console.log(`${prefix} ${action.type}`, action)
	}
}

// ==================== Helper Functions ====================

/**
 * Sets a nested value in an object, returning a new object.
 */
function setNestedValue(
	obj: Record<string, unknown>,
	path: string[],
	value: unknown,
): Record<string, unknown> {
	if (path.length === 0) return obj

	const result = { ...obj }
	let current: Record<string, unknown> = result

	for (let i = 0; i < path.length - 1; i++) {
		const key = path[i]!
		const nextValue = current[key]

		if (typeof nextValue === 'object' && nextValue !== null) {
			current[key] = { ...(nextValue as Record<string, unknown>) }
		} else {
			current[key] = {}
		}

		current = current[key] as Record<string, unknown>
	}

	const lastKey = path[path.length - 1]!
	current[lastKey] = value

	return result
}
