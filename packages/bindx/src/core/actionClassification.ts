import type { Action } from './actions.js'

/**
 * Keys in the store that are affected by an action.
 * Used for partial snapshot capture/restore.
 */
export interface StoreAffectedKeys {
	/** Entity keys in format "entityType:id" */
	entityKeys: string[]
	/** Relation keys in format "entityType:id:fieldName" */
	relationKeys: string[]
	/** Has-many keys in format "entityType:id:fieldName" */
	hasManyKeys: string[]
}

/**
 * Action types that should be tracked for undo/redo.
 * These are user-initiated data mutations.
 */
const TRACKABLE_ACTION_TYPES = new Set<Action['type']>([
	'SET_FIELD',
	'SET_ENTITY_DATA',
	'SET_PLACEHOLDER_DATA',
	'CONNECT_RELATION',
	'DISCONNECT_RELATION',
	'DELETE_RELATION',
	'RESET_ENTITY',
	'RESET_RELATION',
	'ADD_TO_LIST',
	'REMOVE_FROM_LIST',
	'MOVE_IN_LIST',
])

/**
 * Action types that should be skipped for undo/redo.
 * These are operational or commit actions.
 */
const SKIP_ACTION_TYPES = new Set<Action['type']>([
	'SET_LOAD_STATE',
	'SET_PERSISTING',
	'COMMIT_ENTITY',
	'COMMIT_RELATION',
])

/**
 * Checks if an action should be tracked for undo/redo.
 */
export function isTrackableAction(action: Action): boolean {
	return TRACKABLE_ACTION_TYPES.has(action.type)
}

/**
 * Checks if an action should be skipped for undo/redo.
 */
export function isSkippedAction(action: Action): boolean {
	return SKIP_ACTION_TYPES.has(action.type)
}

/**
 * Creates an entity key from type and id.
 */
export function createEntityKey(entityType: string, entityId: string): string {
	return `${entityType}:${entityId}`
}

/**
 * Creates a relation key from parent type, id and field name.
 */
export function createRelationKey(
	entityType: string,
	entityId: string,
	fieldName: string,
): string {
	return `${entityType}:${entityId}:${fieldName}`
}

/**
 * Extracts the store keys affected by an action.
 * Returns entity keys, relation keys, and has-many keys.
 */
export function getAffectedKeys(action: Action): StoreAffectedKeys {
	const entityKeys: string[] = []
	const relationKeys: string[] = []
	const hasManyKeys: string[] = []

	switch (action.type) {
		case 'SET_FIELD':
		case 'SET_ENTITY_DATA':
		case 'RESET_ENTITY':
		case 'COMMIT_ENTITY':
			entityKeys.push(createEntityKey(action.entityType, action.entityId))
			break

		case 'CONNECT_RELATION':
		case 'DISCONNECT_RELATION':
		case 'DELETE_RELATION':
		case 'RESET_RELATION':
		case 'COMMIT_RELATION':
		case 'SET_PLACEHOLDER_DATA':
			relationKeys.push(
				createRelationKey(action.entityType, action.entityId, action.fieldName),
			)
			break

		case 'ADD_TO_LIST':
		case 'REMOVE_FROM_LIST':
		case 'MOVE_IN_LIST':
			hasManyKeys.push(
				createRelationKey(action.entityType, action.entityId, action.fieldName),
			)
			break

		case 'SET_LOAD_STATE':
		case 'SET_PERSISTING':
			// These don't affect undo-able state
			break

		default: {
			const _exhaustive: never = action
			throw new Error(`Unknown action type: ${(_exhaustive as Action).type}`)
		}
	}

	return { entityKeys, relationKeys, hasManyKeys }
}

/**
 * Merges two StoreAffectedKeys objects, deduplicating keys.
 */
export function mergeAffectedKeys(
	target: StoreAffectedKeys,
	source: StoreAffectedKeys,
): void {
	for (const key of source.entityKeys) {
		if (!target.entityKeys.includes(key)) {
			target.entityKeys.push(key)
		}
	}
	for (const key of source.relationKeys) {
		if (!target.relationKeys.includes(key)) {
			target.relationKeys.push(key)
		}
	}
	for (const key of source.hasManyKeys) {
		if (!target.hasManyKeys.includes(key)) {
			target.hasManyKeys.push(key)
		}
	}
}

/**
 * Creates an empty StoreAffectedKeys object.
 */
export function createEmptyAffectedKeys(): StoreAffectedKeys {
	return {
		entityKeys: [],
		relationKeys: [],
		hasManyKeys: [],
	}
}

/**
 * Checks if StoreAffectedKeys is empty.
 */
export function isEmptyAffectedKeys(keys: StoreAffectedKeys): boolean {
	return (
		keys.entityKeys.length === 0 &&
		keys.relationKeys.length === 0 &&
		keys.hasManyKeys.length === 0
	)
}
