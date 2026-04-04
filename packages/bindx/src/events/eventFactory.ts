/**
 * Factory functions for creating events from actions.
 */

import type { Action } from '../core/actions.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import type {
	BeforeEvent,
	AfterEvent,
	FieldChangingEvent,
	FieldChangedEvent,
	RelationConnectingEvent,
	RelationConnectedEvent,
	RelationDisconnectingEvent,
	RelationDisconnectedEvent,
	RelationDeletingEvent,
	RelationDeletedEvent,
	HasManyConnectingEvent,
	HasManyConnectedEvent,
	HasManyDisconnectingEvent,
	HasManyDisconnectedEvent,
	EntityResettingEvent,
	EntityResetEvent,
	ErrorAddedEvent,
	ErrorsClearedEvent,
	LoadStateChangedEvent,
} from './types.js'

/**
 * State captured before action execution.
 * Used to create after events with old values.
 */
export interface CapturedState {
	oldValue?: unknown
	previousId?: string | null
	currentId?: string | null
	previousStatus?: string
}

/**
 * Creates a before event from an action.
 * Returns null for actions that don't have before events.
 */
export function createBeforeEvent(
	action: Action,
	store: SnapshotStore,
): BeforeEvent | null {
	const timestamp = Date.now()

	switch (action.type) {
		case 'SET_FIELD': {
			const snapshot = store.getEntitySnapshot(action.entityType, action.entityId)
			const fieldName = action.fieldPath[action.fieldPath.length - 1] ?? action.fieldPath[0] ?? ''
			const oldValue = getNestedValue(snapshot?.data, action.fieldPath)

			return {
				type: 'field:changing',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				fieldName,
				fieldPath: action.fieldPath,
				oldValue,
				newValue: action.value,
			} satisfies FieldChangingEvent
		}

		case 'CONNECT_RELATION': {
			const relation = store.getRelation(
				action.entityType,
				action.entityId,
				action.fieldName,
			)
			return {
				type: 'relation:connecting',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				fieldName: action.fieldName,
				targetId: action.targetId,
				previousId: relation?.currentId ?? null,
			} satisfies RelationConnectingEvent
		}

		case 'DISCONNECT_RELATION': {
			const relation = store.getRelation(
				action.entityType,
				action.entityId,
				action.fieldName,
			)
			return {
				type: 'relation:disconnecting',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				fieldName: action.fieldName,
				currentId: relation?.currentId ?? null,
			} satisfies RelationDisconnectingEvent
		}

		case 'DELETE_RELATION': {
			const relation = store.getRelation(
				action.entityType,
				action.entityId,
				action.fieldName,
			)
			return {
				type: 'relation:deleting',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				fieldName: action.fieldName,
				currentId: relation?.currentId ?? null,
			} satisfies RelationDeletingEvent
		}

		case 'RESET_ENTITY': {
			return {
				type: 'entity:resetting',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
			} satisfies EntityResettingEvent
		}

		case 'CONNECT_TO_LIST': {
			return {
				type: 'hasMany:connecting',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				fieldName: action.fieldName,
				itemId: action.itemId,
			} satisfies HasManyConnectingEvent
		}

		case 'ADD_TO_LIST': {
			return {
				type: 'hasMany:connecting',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				fieldName: action.fieldName,
				itemId: action.itemId ?? '',
			} satisfies HasManyConnectingEvent
		}

		case 'REMOVE_FROM_LIST': {
			return {
				type: 'hasMany:disconnecting',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				fieldName: action.fieldName,
				itemId: action.itemKey,
			} satisfies HasManyDisconnectingEvent
		}

		default:
			return null
	}
}

/**
 * Captures relevant state before action execution.
 * Used to create after events with accurate old values.
 */
export function captureStateBeforeAction(
	action: Action,
	store: SnapshotStore,
): CapturedState {
	switch (action.type) {
		case 'SET_FIELD': {
			const snapshot = store.getEntitySnapshot(action.entityType, action.entityId)
			return {
				oldValue: getNestedValue(snapshot?.data, action.fieldPath),
			}
		}

		case 'CONNECT_RELATION':
		case 'DISCONNECT_RELATION':
		case 'DELETE_RELATION': {
			const relation = store.getRelation(
				action.entityType,
				action.entityId,
				action.fieldName,
			)
			return {
				previousId: relation?.currentId ?? null,
			}
		}

		case 'SET_LOAD_STATE': {
			const loadState = store.getLoadState(action.entityType, action.entityId)
			return {
				previousStatus: loadState?.status,
			}
		}

		case 'CONNECT_TO_LIST':
		case 'ADD_TO_LIST':
		case 'REMOVE_FROM_LIST':
			return {}

		default:
			return {}
	}
}

/**
 * Creates an after event from an action and captured state.
 * Returns null for actions that don't have after events.
 */
export function createAfterEvent(
	action: Action,
	stateBefore: CapturedState,
	store: SnapshotStore,
): AfterEvent | null {
	const timestamp = Date.now()

	switch (action.type) {
		case 'SET_FIELD': {
			const fieldName = action.fieldPath[action.fieldPath.length - 1] ?? action.fieldPath[0] ?? ''
			return {
				type: 'field:changed',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				fieldName,
				fieldPath: action.fieldPath,
				oldValue: stateBefore.oldValue,
				newValue: action.value,
			} satisfies FieldChangedEvent
		}

		case 'CONNECT_RELATION': {
			return {
				type: 'relation:connected',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				fieldName: action.fieldName,
				targetId: action.targetId,
				previousId: stateBefore.previousId ?? null,
			} satisfies RelationConnectedEvent
		}

		case 'DISCONNECT_RELATION': {
			return {
				type: 'relation:disconnected',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				fieldName: action.fieldName,
				previousId: stateBefore.previousId ?? null,
			} satisfies RelationDisconnectedEvent
		}

		case 'DELETE_RELATION': {
			return {
				type: 'relation:deleted',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				fieldName: action.fieldName,
				previousId: stateBefore.previousId ?? null,
			} satisfies RelationDeletedEvent
		}

		case 'RESET_ENTITY': {
			return {
				type: 'entity:reset',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
			} satisfies EntityResetEvent
		}

		case 'ADD_FIELD_ERROR': {
			return {
				type: 'error:added',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				target: 'field',
				targetName: action.fieldName,
				error: action.error,
			} satisfies ErrorAddedEvent
		}

		case 'ADD_ENTITY_ERROR': {
			return {
				type: 'error:added',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				target: 'entity',
				targetName: null,
				error: action.error,
			} satisfies ErrorAddedEvent
		}

		case 'ADD_RELATION_ERROR': {
			return {
				type: 'error:added',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				target: 'relation',
				targetName: action.relationName,
				error: action.error,
			} satisfies ErrorAddedEvent
		}

		case 'CLEAR_FIELD_ERRORS': {
			return {
				type: 'errors:cleared',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				target: 'field',
				targetName: action.fieldName,
			} satisfies ErrorsClearedEvent
		}

		case 'CLEAR_ENTITY_ERRORS': {
			return {
				type: 'errors:cleared',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				target: 'entity',
				targetName: null,
			} satisfies ErrorsClearedEvent
		}

		case 'CLEAR_RELATION_ERRORS': {
			return {
				type: 'errors:cleared',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				target: 'relation',
				targetName: action.relationName,
			} satisfies ErrorsClearedEvent
		}

		case 'CLEAR_ALL_ERRORS':
		case 'CLEAR_ALL_SERVER_ERRORS': {
			return {
				type: 'errors:cleared',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				target: 'all',
				targetName: null,
			} satisfies ErrorsClearedEvent
		}

		case 'SET_LOAD_STATE': {
			return {
				type: 'load:stateChanged',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				previousStatus: stateBefore.previousStatus,
				newStatus: action.status,
				error: action.error,
			} satisfies LoadStateChangedEvent
		}

		case 'CONNECT_TO_LIST': {
			return {
				type: 'hasMany:connected',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				fieldName: action.fieldName,
				itemId: action.itemId,
			} satisfies HasManyConnectedEvent
		}

		case 'ADD_TO_LIST': {
			return {
				type: 'hasMany:connected',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				fieldName: action.fieldName,
				itemId: action.itemId ?? '',
			} satisfies HasManyConnectedEvent
		}

		case 'REMOVE_FROM_LIST': {
			return {
				type: 'hasMany:disconnected',
				timestamp,
				entityType: action.entityType,
				entityId: action.entityId,
				fieldName: action.fieldName,
				itemId: action.itemKey,
			} satisfies HasManyDisconnectedEvent
		}

		default:
			return null
	}
}

/**
 * Creates hasMany connection events.
 * These are separate since hasMany operations may not go through standard actions.
 */
export function createHasManyConnectingEvent(
	entityType: string,
	entityId: string,
	fieldName: string,
	itemId: string,
): HasManyConnectingEvent {
	return {
		type: 'hasMany:connecting',
		timestamp: Date.now(),
		entityType,
		entityId,
		fieldName,
		itemId,
	}
}

export function createHasManyConnectedEvent(
	entityType: string,
	entityId: string,
	fieldName: string,
	itemId: string,
): HasManyConnectedEvent {
	return {
		type: 'hasMany:connected',
		timestamp: Date.now(),
		entityType,
		entityId,
		fieldName,
		itemId,
	}
}

export function createHasManyDisconnectingEvent(
	entityType: string,
	entityId: string,
	fieldName: string,
	itemId: string,
): HasManyDisconnectingEvent {
	return {
		type: 'hasMany:disconnecting',
		timestamp: Date.now(),
		entityType,
		entityId,
		fieldName,
		itemId,
	}
}

export function createHasManyDisconnectedEvent(
	entityType: string,
	entityId: string,
	fieldName: string,
	itemId: string,
): HasManyDisconnectedEvent {
	return {
		type: 'hasMany:disconnected',
		timestamp: Date.now(),
		entityType,
		entityId,
		fieldName,
		itemId,
	}
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets a nested value from an object by path.
 */
function getNestedValue(obj: unknown, path: readonly string[]): unknown {
	if (obj === null || obj === undefined) return undefined
	if (path.length === 0) return obj

	let current: unknown = obj
	for (const key of path) {
		if (current === null || current === undefined) return undefined
		if (typeof current !== 'object') return undefined
		current = (current as Record<string, unknown>)[key]
	}
	return current
}
