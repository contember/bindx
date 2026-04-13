import type { HasOneRelationState } from '../handles/types.js'
import type { FieldError } from '../errors/types.js'

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
	readonly targetType: string
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
 * Connects an existing entity to a has-many list
 */
export interface ConnectToListAction {
	readonly type: 'CONNECT_TO_LIST'
	readonly entityType: string
	readonly entityId: string
	readonly fieldName: string
	readonly itemId: string
	readonly targetType: string
	readonly alias?: string
}

/**
 * Adds an item to a has-many list
 */
export interface AddToListAction {
	readonly type: 'ADD_TO_LIST'
	readonly entityType: string
	readonly entityId: string
	readonly fieldName: string
	readonly targetType: string
	readonly itemData?: Record<string, unknown>
	readonly itemId?: string
	readonly alias?: string
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
	readonly removalType: 'disconnect' | 'delete'
	readonly alias?: string
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
	readonly alias?: string
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
	readonly error?: FieldError
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

// ==================== Error Actions ====================

/**
 * Adds an error to a field
 */
export interface AddFieldErrorAction {
	readonly type: 'ADD_FIELD_ERROR'
	readonly entityType: string
	readonly entityId: string
	readonly fieldName: string
	readonly error: FieldError
}

/**
 * Clears errors from a field
 */
export interface ClearFieldErrorsAction {
	readonly type: 'CLEAR_FIELD_ERRORS'
	readonly entityType: string
	readonly entityId: string
	readonly fieldName: string
	readonly source?: 'client' | 'server'
}

/**
 * Adds an error to an entity
 */
export interface AddEntityErrorAction {
	readonly type: 'ADD_ENTITY_ERROR'
	readonly entityType: string
	readonly entityId: string
	readonly error: FieldError
}

/**
 * Clears errors from an entity
 */
export interface ClearEntityErrorsAction {
	readonly type: 'CLEAR_ENTITY_ERRORS'
	readonly entityType: string
	readonly entityId: string
	readonly source?: 'client' | 'server'
}

/**
 * Adds an error to a relation
 */
export interface AddRelationErrorAction {
	readonly type: 'ADD_RELATION_ERROR'
	readonly entityType: string
	readonly entityId: string
	readonly relationName: string
	readonly error: FieldError
}

/**
 * Clears errors from a relation
 */
export interface ClearRelationErrorsAction {
	readonly type: 'CLEAR_RELATION_ERRORS'
	readonly entityType: string
	readonly entityId: string
	readonly relationName: string
	readonly source?: 'client' | 'server'
}

/**
 * Clears all server errors for an entity (entity-level, fields, and relations)
 */
export interface ClearAllServerErrorsAction {
	readonly type: 'CLEAR_ALL_SERVER_ERRORS'
	readonly entityType: string
	readonly entityId: string
}

/**
 * Clears all errors for an entity (entity-level, fields, and relations)
 */
export interface ClearAllErrorsAction {
	readonly type: 'CLEAR_ALL_ERRORS'
	readonly entityType: string
	readonly entityId: string
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
	| ConnectToListAction
	| AddToListAction
	| RemoveFromListAction
	| MoveInListAction
	| SetLoadStateAction
	| SetPersistingAction
	| AddFieldErrorAction
	| ClearFieldErrorsAction
	| AddEntityErrorAction
	| ClearEntityErrorsAction
	| AddRelationErrorAction
	| ClearRelationErrorsAction
	| ClearAllServerErrorsAction
	| ClearAllErrorsAction

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
	targetType: string,
): ConnectRelationAction {
	return { type: 'CONNECT_RELATION', entityType, entityId, fieldName, targetId, targetType }
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
	error?: FieldError,
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

/**
 * Creates a SET_PLACEHOLDER_DATA action
 */
export function setPlaceholderData(
	entityType: string,
	entityId: string,
	fieldName: string,
	fieldPath: string[],
	value: unknown,
): SetPlaceholderDataAction {
	return { type: 'SET_PLACEHOLDER_DATA', entityType, entityId, fieldName, fieldPath, value }
}

/**
 * Creates an ADD_FIELD_ERROR action
 */
export function addFieldError(
	entityType: string,
	entityId: string,
	fieldName: string,
	error: FieldError,
): AddFieldErrorAction {
	return { type: 'ADD_FIELD_ERROR', entityType, entityId, fieldName, error }
}

/**
 * Creates a CLEAR_FIELD_ERRORS action
 */
export function clearFieldErrors(
	entityType: string,
	entityId: string,
	fieldName: string,
	source?: 'client' | 'server',
): ClearFieldErrorsAction {
	return { type: 'CLEAR_FIELD_ERRORS', entityType, entityId, fieldName, source }
}

/**
 * Creates an ADD_ENTITY_ERROR action
 */
export function addEntityError(
	entityType: string,
	entityId: string,
	error: FieldError,
): AddEntityErrorAction {
	return { type: 'ADD_ENTITY_ERROR', entityType, entityId, error }
}

/**
 * Creates a CLEAR_ENTITY_ERRORS action
 */
export function clearEntityErrors(
	entityType: string,
	entityId: string,
	source?: 'client' | 'server',
): ClearEntityErrorsAction {
	return { type: 'CLEAR_ENTITY_ERRORS', entityType, entityId, source }
}

/**
 * Creates an ADD_RELATION_ERROR action
 */
export function addRelationError(
	entityType: string,
	entityId: string,
	relationName: string,
	error: FieldError,
): AddRelationErrorAction {
	return { type: 'ADD_RELATION_ERROR', entityType, entityId, relationName, error }
}

/**
 * Creates a CLEAR_RELATION_ERRORS action
 */
export function clearRelationErrors(
	entityType: string,
	entityId: string,
	relationName: string,
	source?: 'client' | 'server',
): ClearRelationErrorsAction {
	return { type: 'CLEAR_RELATION_ERRORS', entityType, entityId, relationName, source }
}

/**
 * Creates a CLEAR_ALL_SERVER_ERRORS action
 */
export function clearAllServerErrors(
	entityType: string,
	entityId: string,
): ClearAllServerErrorsAction {
	return { type: 'CLEAR_ALL_SERVER_ERRORS', entityType, entityId }
}

/**
 * Creates a CLEAR_ALL_ERRORS action
 */
export function clearAllErrors(
	entityType: string,
	entityId: string,
): ClearAllErrorsAction {
	return { type: 'CLEAR_ALL_ERRORS', entityType, entityId }
}

// ==================== List Action Creators ====================

/**
 * Creates a CONNECT_TO_LIST action
 */
export function connectToList(
	entityType: string,
	entityId: string,
	fieldName: string,
	itemId: string,
	targetType: string,
	alias?: string,
): ConnectToListAction {
	return { type: 'CONNECT_TO_LIST', entityType, entityId, fieldName, itemId, targetType, alias }
}

/**
 * Creates an ADD_TO_LIST action
 */
export function addToList(
	entityType: string,
	entityId: string,
	fieldName: string,
	targetType: string,
	itemId: string,
	alias?: string,
): AddToListAction {
	return { type: 'ADD_TO_LIST', entityType, entityId, fieldName, targetType, itemId, alias }
}

/**
 * Creates a REMOVE_FROM_LIST action
 */
export function removeFromList(
	entityType: string,
	entityId: string,
	fieldName: string,
	itemKey: string,
	removalType: 'disconnect' | 'delete',
	alias?: string,
): RemoveFromListAction {
	return { type: 'REMOVE_FROM_LIST', entityType, entityId, fieldName, itemKey, removalType, alias }
}

/**
 * Creates a MOVE_IN_LIST action
 */
export function moveInList(
	entityType: string,
	entityId: string,
	fieldName: string,
	fromIndex: number,
	toIndex: number,
	alias?: string,
): MoveInListAction {
	return { type: 'MOVE_IN_LIST', entityType, entityId, fieldName, fromIndex, toIndex, alias }
}
