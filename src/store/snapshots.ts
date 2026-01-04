/**
 * Immutable snapshot types for React integration.
 * All snapshots are frozen objects that are replaced (not mutated) on changes.
 */

import type { HasOneRelationState } from '../accessors/types.js'

/**
 * Status of a data load operation
 */
export type LoadStatus = 'idle' | 'loading' | 'success' | 'error' | 'not_found'

/**
 * Immutable snapshot of entity data stored in the IdentityMap.
 * A new snapshot is created whenever the entity data changes.
 */
export interface EntitySnapshot<T extends object = object> {
	/** Entity ID */
	readonly id: string
	/** Entity type name */
	readonly entityType: string
	/** Current (local) data - may differ from serverData if modified */
	readonly data: Readonly<T>
	/** Data as received from server - used for dirty tracking and reset */
	readonly serverData: Readonly<T>
	/** Version number - incremented on each change, used for comparison */
	readonly version: number
}

/**
 * Immutable snapshot of a scalar field value.
 */
export interface FieldSnapshot<T = unknown> {
	/** Current value */
	readonly value: T | null
	/** Server value (for dirty tracking) */
	readonly serverValue: T | null
	/** Whether the field has been modified */
	readonly isDirty: boolean
}

/**
 * State information for a has-one relation.
 */
export interface HasOneRelationSnapshot<T extends object = object> {
	/** Current relation state */
	readonly state: HasOneRelationState
	/** Current referenced entity ID (null if disconnected) */
	readonly entityId: string | null
	/** Server-side entity ID (for dirty tracking) */
	readonly serverEntityId: string | null
	/** The related entity snapshot (if connected and loaded) */
	readonly entity: EntitySnapshot<T> | null
	/** Whether the relation has been modified */
	readonly isDirty: boolean
	/** Version for change detection */
	readonly version: number
}

/**
 * Item in a has-many relation list.
 */
export interface HasManyItemSnapshot<T extends object = object> {
	/** Unique key for React reconciliation */
	readonly key: string
	/** The entity snapshot */
	readonly entity: EntitySnapshot<T>
	/** Whether this item was added locally (not from server) */
	readonly isNew: boolean
}

/**
 * Immutable snapshot of a has-many relation (entity list).
 */
export interface HasManySnapshot<T extends object = object> {
	/** List items in current order */
	readonly items: ReadonlyArray<HasManyItemSnapshot<T>>
	/** Keys of items that came from the server */
	readonly serverItemKeys: ReadonlySet<string>
	/** Keys of items that were added locally */
	readonly addedKeys: ReadonlySet<string>
	/** Keys of items that were removed locally */
	readonly removedKeys: ReadonlySet<string>
	/** Whether the order has been changed */
	readonly orderChanged: boolean
	/** Whether the list has any modifications */
	readonly isDirty: boolean
	/** Version for change detection */
	readonly version: number
}

/**
 * Loading state for an entity.
 */
export interface LoadingState {
	readonly status: 'loading'
	readonly id: string
}

/**
 * Error state for an entity.
 */
export interface ErrorState {
	readonly status: 'error'
	readonly id: string
	readonly error: Error
}

/**
 * Not found state for an entity.
 */
export interface NotFoundState {
	readonly status: 'not_found'
	readonly id: string
}

/**
 * Ready state with entity data.
 */
export interface ReadyState<T extends object = object> {
	readonly status: 'ready'
	readonly id: string
	readonly entityType: string
	readonly snapshot: EntitySnapshot<T>
}

/**
 * Union of all possible entity states.
 */
export type EntityState<T extends object = object> =
	| LoadingState
	| ErrorState
	| NotFoundState
	| ReadyState<T>

/**
 * Helper to check if state is ready
 */
export function isReadyState<T extends object>(state: EntityState<T>): state is ReadyState<T> {
	return state.status === 'ready'
}

/**
 * Helper to check if state is loading
 */
export function isLoadingState<T extends object>(state: EntityState<T>): state is LoadingState {
	return state.status === 'loading'
}

/**
 * Helper to check if state is error
 */
export function isErrorState<T extends object>(state: EntityState<T>): state is ErrorState {
	return state.status === 'error'
}

/**
 * Creates an immutable entity snapshot from data.
 */
export function createEntitySnapshot<T extends object>(
	id: string,
	entityType: string,
	data: T,
	serverData: T,
	version: number,
): EntitySnapshot<T> {
	return Object.freeze({
		id,
		entityType,
		data: Object.freeze({ ...data }) as Readonly<T>,
		serverData: Object.freeze({ ...serverData }) as Readonly<T>,
		version,
	})
}

/**
 * Creates a new entity snapshot with updated data.
 * Returns a new frozen object with incremented version.
 */
export function updateEntitySnapshot<T extends object>(
	snapshot: EntitySnapshot<T>,
	updates: Partial<T>,
): EntitySnapshot<T> {
	return Object.freeze({
		...snapshot,
		data: Object.freeze({ ...snapshot.data, ...updates }) as Readonly<T>,
		version: snapshot.version + 1,
	})
}

/**
 * Creates a field snapshot from entity snapshot.
 */
export function createFieldSnapshot<T>(
	value: T | null,
	serverValue: T | null,
): FieldSnapshot<T> {
	return Object.freeze({
		value,
		serverValue,
		isDirty: value !== serverValue,
	})
}
