import type { SnapshotStore } from '../store/SnapshotStore.js'
import type { Action } from './actions.js'

/**
 * ActionDispatcher centralizes all state mutations.
 * All changes to the store go through this dispatcher.
 *
 * Benefits:
 * - Single point of control for all mutations
 * - Easy to add logging, debugging, middleware
 * - Ensures consistent state updates
 * - Enables action replay/undo if needed
 */
export class ActionDispatcher {
	private readonly middlewares: ActionMiddleware[] = []

	constructor(private readonly store: SnapshotStore) {}

	/**
	 * Dispatches an action to update the store.
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

		// Execute the action
		this.execute(action)
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
				if (relation) {
					const newPlaceholderData = setNestedValue(
						{ ...relation.placeholderData },
						action.fieldPath,
						action.value,
					)
					this.store.setRelation(
						action.entityType,
						action.entityId,
						action.fieldName,
						{ placeholderData: newPlaceholderData },
					)
				}
				break
			}

			case 'ADD_TO_LIST':
				// List operations are handled by the list accessor
				// This is a placeholder for future implementation
				break

			case 'REMOVE_FROM_LIST':
				// List operations are handled by the list accessor
				break

			case 'MOVE_IN_LIST':
				// List operations are handled by the list accessor
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
