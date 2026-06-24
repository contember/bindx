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
