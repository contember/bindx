import type { HasOneRelationState } from '../accessors/types.js'

/**
 * Action types for the ActionDispatcher.
 * All mutations to the store go through these actions.
 */

// ==================== Field Actions ====================

/**
 * Sets a scalar field value
 */
export interface SetFieldAction {
	readonly type: 'SET_FIELD'
	readonly entityType: string
	readonly entityId: string
	readonly fieldPath: string[]
	readonly value: unknown
}

// ==================== Entity Actions ====================

/**
 * Resets an entity to its server data
 */
export interface ResetEntityAction {
	readonly type: 'RESET_ENTITY'
	readonly entityType: string
	readonly entityId: string
}

/**
 * Commits entity changes (serverData = data)
 */
export interface CommitEntityAction {
	readonly type: 'COMMIT_ENTITY'
	readonly entityType: string
	readonly entityId: string
}

/**
 * Sets entity data (usually from server)
 */
export interface SetEntityDataAction {
	readonly type: 'SET_ENTITY_DATA'
	readonly entityType: string
	readonly entityId: string
	readonly data: Record<string, unknown>
	readonly isServerData: boolean
}

// ==================== Relation Actions ====================

/**
 * Connects a has-one relation to an entity
 */
export interface ConnectRelationAction {
	readonly type: 'CONNECT_RELATION'
	readonly entityType: string
	readonly entityId: string
	readonly fieldName: string
	readonly targetId: string
}

/**
 * Disconnects a has-one relation
 */
export interface DisconnectRelationAction {
	readonly type: 'DISCONNECT_RELATION'
	readonly entityType: string
	readonly entityId: string
	readonly fieldName: string
}

/**
 * Marks a has-one relation for deletion
 */
export interface DeleteRelationAction {
	readonly type: 'DELETE_RELATION'
	readonly entityType: string
	readonly entityId: string
	readonly fieldName: string
}

/**
 * Resets a relation to server state
 */
export interface ResetRelationAction {
	readonly type: 'RESET_RELATION'
	readonly entityType: string
	readonly entityId: string
	readonly fieldName: string
}

/**
 * Commits relation changes
 */
export interface CommitRelationAction {
	readonly type: 'COMMIT_RELATION'
	readonly entityType: string
	readonly entityId: string
	readonly fieldName: string
}

/**
 * Sets placeholder data for a creating relation
 */
export interface SetPlaceholderDataAction {
	readonly type: 'SET_PLACEHOLDER_DATA'
	readonly entityType: string
	readonly entityId: string
	readonly fieldName: string
	readonly fieldPath: string[]
	readonly value: unknown
}

// ==================== List Actions ====================

/**
 * Adds an item to a has-many list
 */
export interface AddToListAction {
	readonly type: 'ADD_TO_LIST'
	readonly entityType: string
	readonly entityId: string
	readonly fieldName: string
	readonly itemData: Record<string, unknown>
	readonly itemKey?: string
}

/**
 * Removes an item from a has-many list
 */
export interface RemoveFromListAction {
	readonly type: 'REMOVE_FROM_LIST'
	readonly entityType: string
	readonly entityId: string
	readonly fieldName: string
	readonly itemKey: string
}

/**
 * Moves an item within a has-many list
 */
export interface MoveInListAction {
	readonly type: 'MOVE_IN_LIST'
	readonly entityType: string
	readonly entityId: string
	readonly fieldName: string
	readonly fromIndex: number
	readonly toIndex: number
}

// ==================== Load State Actions ====================

/**
 * Sets the load state for an entity
 */
export interface SetLoadStateAction {
	readonly type: 'SET_LOAD_STATE'
	readonly entityType: string
	readonly entityId: string
	readonly status: 'idle' | 'loading' | 'success' | 'error' | 'not_found'
	readonly error?: Error
}

/**
 * Sets the persisting state for an entity
 */
export interface SetPersistingAction {
	readonly type: 'SET_PERSISTING'
	readonly entityType: string
	readonly entityId: string
	readonly isPersisting: boolean
}

// ==================== Union Type ====================

/**
 * Union of all possible actions
 */
export type Action =
	| SetFieldAction
	| ResetEntityAction
	| CommitEntityAction
	| SetEntityDataAction
	| ConnectRelationAction
	| DisconnectRelationAction
	| DeleteRelationAction
	| ResetRelationAction
	| CommitRelationAction
	| SetPlaceholderDataAction
	| AddToListAction
	| RemoveFromListAction
	| MoveInListAction
	| SetLoadStateAction
	| SetPersistingAction

// ==================== Action Creators ====================

/**
 * Creates a SET_FIELD action
 */
export function setField(
	entityType: string,
	entityId: string,
	fieldPath: string[],
	value: unknown,
): SetFieldAction {
	return { type: 'SET_FIELD', entityType, entityId, fieldPath, value }
}

/**
 * Creates a RESET_ENTITY action
 */
export function resetEntity(entityType: string, entityId: string): ResetEntityAction {
	return { type: 'RESET_ENTITY', entityType, entityId }
}

/**
 * Creates a COMMIT_ENTITY action
 */
export function commitEntity(entityType: string, entityId: string): CommitEntityAction {
	return { type: 'COMMIT_ENTITY', entityType, entityId }
}

/**
 * Creates a SET_ENTITY_DATA action
 */
export function setEntityData(
	entityType: string,
	entityId: string,
	data: Record<string, unknown>,
	isServerData: boolean = false,
): SetEntityDataAction {
	return { type: 'SET_ENTITY_DATA', entityType, entityId, data, isServerData }
}

/**
 * Creates a CONNECT_RELATION action
 */
export function connectRelation(
	entityType: string,
	entityId: string,
	fieldName: string,
	targetId: string,
): ConnectRelationAction {
	return { type: 'CONNECT_RELATION', entityType, entityId, fieldName, targetId }
}

/**
 * Creates a DISCONNECT_RELATION action
 */
export function disconnectRelation(
	entityType: string,
	entityId: string,
	fieldName: string,
): DisconnectRelationAction {
	return { type: 'DISCONNECT_RELATION', entityType, entityId, fieldName }
}

/**
 * Creates a DELETE_RELATION action
 */
export function deleteRelation(
	entityType: string,
	entityId: string,
	fieldName: string,
): DeleteRelationAction {
	return { type: 'DELETE_RELATION', entityType, entityId, fieldName }
}

/**
 * Creates a SET_LOAD_STATE action
 */
export function setLoadState(
	entityType: string,
	entityId: string,
	status: 'idle' | 'loading' | 'success' | 'error' | 'not_found',
	error?: Error,
): SetLoadStateAction {
	return { type: 'SET_LOAD_STATE', entityType, entityId, status, error }
}

/**
 * Creates a SET_PERSISTING action
 */
export function setPersisting(
	entityType: string,
	entityId: string,
	isPersisting: boolean,
): SetPersistingAction {
	return { type: 'SET_PERSISTING', entityType, entityId, isPersisting }
}
