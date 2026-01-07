import { useCallback, useSyncExternalStore } from 'react'
import type { UndoState } from '@contember/bindx'
import { useBindxContext } from './BackendAdapterContext.js'

/**
 * Result type for useUndo hook.
 */
export interface UndoHookResult {
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
	/** Undo the last action or group */
	undo: () => void
	/** Redo the last undone action or group */
	redo: () => void
	/** Begin a manual group - all actions until endGroup are grouped as one undo entry */
	beginGroup: (label?: string) => string
	/** End a manual group */
	endGroup: (groupId: string) => void
	/** Clear all undo/redo history */
	clear: () => void
}

/**
 * Hook to access undo/redo functionality.
 * Must be used within a BindxProvider with enableUndo={true}.
 *
 * @example
 * ```tsx
 * function Editor() {
 *   const { canUndo, canRedo, undo, redo } = useUndo()
 *
 *   return (
 *     <div>
 *       <button onClick={undo} disabled={!canUndo}>Undo</button>
 *       <button onClick={redo} disabled={!canRedo}>Redo</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useUndo(): UndoHookResult {
	const { undoManager } = useBindxContext()

	if (!undoManager) {
		throw new Error(
			'useUndo: Undo is not enabled. Set enableUndo={true} on BindxProvider.',
		)
	}

	// Subscribe to undo manager state changes
	const state = useSyncExternalStore(
		useCallback((callback) => undoManager.subscribe(callback), [undoManager]),
		useCallback(() => undoManager.getState(), [undoManager]),
		useCallback(() => undoManager.getState(), [undoManager]),
	)

	const undo = useCallback(() => undoManager.undo(), [undoManager])
	const redo = useCallback(() => undoManager.redo(), [undoManager])
	const beginGroup = useCallback((label?: string) => undoManager.beginGroup(label), [undoManager])
	const endGroup = useCallback((id: string) => undoManager.endGroup(id), [undoManager])
	const clear = useCallback(() => undoManager.clear(), [undoManager])

	return {
		canUndo: state.canUndo,
		canRedo: state.canRedo,
		isBlocked: state.isBlocked,
		undoCount: state.undoCount,
		redoCount: state.redoCount,
		undo,
		redo,
		beginGroup,
		endGroup,
		clear,
	}
}
