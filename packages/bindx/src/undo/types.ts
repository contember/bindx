import type { StoreAffectedKeys } from '../core/actionClassification.js'
import type { EntitySnapshot } from '../store/snapshots.js'
import type {
	StoredRelationState,
	StoredHasManyState,
	EntityMeta,
} from '../store/SnapshotStore.js'

/**
 * Partial snapshot of store state.
 * Contains only the data affected by an action or group of actions.
 */
export interface PartialStoreSnapshot {
	/** Entity snapshots (frozen, immutable) */
	entitySnapshots: Map<string, EntitySnapshot>
	/** Has-one relation states */
	relationStates: Map<string, StoredRelationState>
	/** Has-many list states */
	hasManyStates: Map<string, StoredHasManyState>
	/** Entity metadata (existsOnServer, deletion flags) */
	entityMetas: Map<string, EntityMeta>
}

/**
 * A single undo/redo entry.
 * Contains the snapshot of state BEFORE the action(s) were applied.
 */
export interface UndoEntry {
	/** Unique identifier for this entry */
	id: string
	/** Optional human-readable label */
	label?: string
	/** Snapshot of state BEFORE the action(s) */
	beforeSnapshot: PartialStoreSnapshot
	/** Keys that were affected (for redo snapshot capture) */
	affectedKeys: StoreAffectedKeys
	/** When this entry was created */
	timestamp: number
}

/**
 * Pending entry during debounce window.
 * Accumulates affected keys while waiting for debounce to complete.
 */
export interface PendingUndoEntry {
	/** Snapshot captured before the first action in the group */
	beforeSnapshot: PartialStoreSnapshot
	/** Accumulated affected keys */
	affectedKeys: StoreAffectedKeys
	/** When the first action occurred */
	timestamp: number
	/** Optional label for manual grouping */
	label?: string
}

/**
 * Configuration options for UndoManager.
 */
export interface UndoManagerConfig {
	/** Maximum number of undo entries to keep (default: 100) */
	maxHistorySize?: number
	/** Debounce time in milliseconds for auto-grouping (default: 300) */
	debounceMs?: number
}

/**
 * Current state of the undo manager.
 * Used for React integration via useSyncExternalStore.
 */
export interface UndoState {
	/** Whether undo is available */
	canUndo: boolean
	/** Whether redo is available */
	canRedo: boolean
	/** Whether undo/redo is currently blocked (e.g., during persist) */
	isBlocked: boolean
	/** Number of entries in undo stack */
	undoCount: number
	/** Number of entries in redo stack */
	redoCount: number
}

// Re-export StoreAffectedKeys for convenience
export type { StoreAffectedKeys } from '../core/actionClassification.js'
