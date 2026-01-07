import type { ActionMiddleware } from '../core/ActionDispatcher.js'
import type { Action } from '../core/actions.js'
import {
	isTrackableAction,
	getAffectedKeys,
	mergeAffectedKeys,
	createEmptyAffectedKeys,
	type StoreAffectedKeys,
} from '../core/actionClassification.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import type {
	PartialStoreSnapshot,
	PendingUndoEntry,
	UndoEntry,
	UndoManagerConfig,
	UndoState,
} from './types.js'

type Subscriber = () => void

/**
 * Generates a unique ID for undo entries.
 */
function generateId(): string {
	return `undo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * UndoManager provides undo/redo functionality for the Bindx store.
 *
 * Features:
 * - Automatic debounced grouping of rapid changes
 * - Manual grouping via beginGroup/endGroup
 * - Configurable history size
 * - Block/unblock during persist operations
 * - React integration via subscribe/getState
 */
export class UndoManager {
	private undoStack: UndoEntry[] = []
	private redoStack: UndoEntry[] = []
	private pendingEntry: PendingUndoEntry | null = null
	private debounceTimer: ReturnType<typeof setTimeout> | null = null
	private isBlocked = false
	private manualGroupId: string | null = null
	private manualGroupLabel: string | undefined = undefined
	private subscribers = new Set<Subscriber>()

	private readonly maxHistorySize: number
	private readonly debounceMs: number

	constructor(
		private readonly store: SnapshotStore,
		config: UndoManagerConfig = {},
	) {
		this.maxHistorySize = config.maxHistorySize ?? 100
		this.debounceMs = config.debounceMs ?? 300
	}

	/**
	 * Creates middleware for ActionDispatcher.
	 * Must be added to dispatcher to enable undo tracking.
	 */
	createMiddleware(): ActionMiddleware {
		return (action: Action) => {
			this.handleAction(action)
			// Always allow action to proceed
			return true
		}
	}

	/**
	 * Handles an action, capturing state for undo if trackable.
	 */
	private handleAction(action: Action): void {
		// Skip if blocked or not trackable
		if (this.isBlocked || !isTrackableAction(action)) {
			return
		}

		const keys = getAffectedKeys(action)

		// Clear redo stack on new action
		if (this.redoStack.length > 0) {
			this.redoStack = []
			this.notifySubscribers()
		}

		if (this.manualGroupId !== null) {
			// Manual grouping mode
			this.handleManualGroupAction(keys)
		} else {
			// Auto-debounce mode
			this.handleDebouncedAction(keys)
		}
	}

	/**
	 * Handles action in manual group mode.
	 */
	private handleManualGroupAction(keys: StoreAffectedKeys): void {
		if (!this.pendingEntry) {
			// First action in group - capture snapshot
			const snapshot = this.store.exportPartialSnapshot(keys)
			this.pendingEntry = {
				beforeSnapshot: snapshot,
				affectedKeys: { ...keys, entityKeys: [...keys.entityKeys], relationKeys: [...keys.relationKeys], hasManyKeys: [...keys.hasManyKeys] },
				timestamp: Date.now(),
				label: this.manualGroupLabel,
			}
		} else {
			// Merge keys and expand snapshot if needed
			const newKeys = this.getNewKeys(this.pendingEntry.affectedKeys, keys)
			if (!this.isEmptyKeys(newKeys)) {
				// Capture additional state for new keys
				const additionalSnapshot = this.store.exportPartialSnapshot(newKeys)
				this.mergeSnapshots(this.pendingEntry.beforeSnapshot, additionalSnapshot)
				mergeAffectedKeys(this.pendingEntry.affectedKeys, keys)
			}
		}
	}

	/**
	 * Handles action in debounced auto-group mode.
	 */
	private handleDebouncedAction(keys: StoreAffectedKeys): void {
		// If debounceMs is 0, immediately create individual entries (no grouping)
		if (this.debounceMs === 0) {
			const snapshot = this.store.exportPartialSnapshot(keys)
			this.undoStack.push({
				id: generateId(),
				beforeSnapshot: snapshot,
				affectedKeys: { ...keys, entityKeys: [...keys.entityKeys], relationKeys: [...keys.relationKeys], hasManyKeys: [...keys.hasManyKeys] },
				timestamp: Date.now(),
			})
			this.trimHistory()
			this.notifySubscribers()
			return
		}

		if (this.pendingEntry) {
			// Extend existing pending entry
			const newKeys = this.getNewKeys(this.pendingEntry.affectedKeys, keys)
			if (!this.isEmptyKeys(newKeys)) {
				const additionalSnapshot = this.store.exportPartialSnapshot(newKeys)
				this.mergeSnapshots(this.pendingEntry.beforeSnapshot, additionalSnapshot)
				mergeAffectedKeys(this.pendingEntry.affectedKeys, keys)
			}
			this.resetDebounceTimer()
		} else {
			// First action - capture snapshot and start timer
			const snapshot = this.store.exportPartialSnapshot(keys)
			this.pendingEntry = {
				beforeSnapshot: snapshot,
				affectedKeys: { ...keys, entityKeys: [...keys.entityKeys], relationKeys: [...keys.relationKeys], hasManyKeys: [...keys.hasManyKeys] },
				timestamp: Date.now(),
			}
			this.startDebounceTimer()
		}
	}

	/**
	 * Gets keys that are in source but not in target.
	 */
	private getNewKeys(target: StoreAffectedKeys, source: StoreAffectedKeys): StoreAffectedKeys {
		return {
			entityKeys: source.entityKeys.filter(k => !target.entityKeys.includes(k)),
			relationKeys: source.relationKeys.filter(k => !target.relationKeys.includes(k)),
			hasManyKeys: source.hasManyKeys.filter(k => !target.hasManyKeys.includes(k)),
		}
	}

	/**
	 * Checks if keys object is empty.
	 */
	private isEmptyKeys(keys: StoreAffectedKeys): boolean {
		return keys.entityKeys.length === 0 && keys.relationKeys.length === 0 && keys.hasManyKeys.length === 0
	}

	/**
	 * Merges additional snapshot into target.
	 */
	private mergeSnapshots(target: PartialStoreSnapshot, source: PartialStoreSnapshot): void {
		for (const [key, value] of source.entitySnapshots) {
			if (!target.entitySnapshots.has(key)) {
				target.entitySnapshots.set(key, value)
			}
		}
		for (const [key, value] of source.relationStates) {
			if (!target.relationStates.has(key)) {
				target.relationStates.set(key, value)
			}
		}
		for (const [key, value] of source.hasManyStates) {
			if (!target.hasManyStates.has(key)) {
				target.hasManyStates.set(key, value)
			}
		}
		for (const [key, value] of source.entityMetas) {
			if (!target.entityMetas.has(key)) {
				target.entityMetas.set(key, value)
			}
		}
	}

	/**
	 * Starts the debounce timer.
	 */
	private startDebounceTimer(): void {
		this.debounceTimer = setTimeout(() => {
			this.flushPendingEntry()
		}, this.debounceMs)
	}

	/**
	 * Resets the debounce timer.
	 */
	private resetDebounceTimer(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
		}
		this.startDebounceTimer()
	}

	/**
	 * Flushes pending entry to undo stack.
	 */
	private flushPendingEntry(): void {
		if (!this.pendingEntry) return

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
			this.debounceTimer = null
		}

		this.undoStack.push({
			id: generateId(),
			label: this.pendingEntry.label,
			beforeSnapshot: this.pendingEntry.beforeSnapshot,
			affectedKeys: this.pendingEntry.affectedKeys,
			timestamp: this.pendingEntry.timestamp,
		})

		this.pendingEntry = null
		this.trimHistory()
		this.notifySubscribers()
	}

	/**
	 * Trims history to max size.
	 */
	private trimHistory(): void {
		while (this.undoStack.length > this.maxHistorySize) {
			this.undoStack.shift()
		}
	}

	/**
	 * Starts a manual group. All actions until endGroup are grouped as one undo entry.
	 * Returns group ID that must be passed to endGroup.
	 */
	beginGroup(label?: string): string {
		// Flush any pending debounced entry first
		this.flushPendingEntry()

		const groupId = generateId()
		this.manualGroupId = groupId
		this.manualGroupLabel = label
		return groupId
	}

	/**
	 * Ends a manual group and pushes to undo stack.
	 */
	endGroup(groupId: string): void {
		if (this.manualGroupId !== groupId) {
			console.warn(`UndoManager: endGroup called with wrong groupId. Expected ${this.manualGroupId}, got ${groupId}`)
			return
		}

		this.manualGroupId = null
		this.manualGroupLabel = undefined
		this.flushPendingEntry()
	}

	/**
	 * Undoes the last entry.
	 */
	undo(): void {
		// Flush any pending entry first
		this.flushPendingEntry()

		if (this.isBlocked || this.undoStack.length === 0) {
			return
		}

		const entry = this.undoStack.pop()!

		// Capture current state for redo
		const currentSnapshot = this.store.exportPartialSnapshot(entry.affectedKeys)

		// Push to redo stack with current state
		this.redoStack.push({
			id: entry.id,
			label: entry.label,
			beforeSnapshot: currentSnapshot,
			affectedKeys: entry.affectedKeys,
			timestamp: Date.now(),
		})

		// Restore the before snapshot
		this.store.importPartialSnapshot(entry.beforeSnapshot)

		this.notifySubscribers()
	}

	/**
	 * Redoes the last undone entry.
	 */
	redo(): void {
		if (this.isBlocked || this.redoStack.length === 0) {
			return
		}

		const entry = this.redoStack.pop()!

		// Capture current state for undo
		const currentSnapshot = this.store.exportPartialSnapshot(entry.affectedKeys)

		// Push back to undo stack
		this.undoStack.push({
			id: entry.id,
			label: entry.label,
			beforeSnapshot: currentSnapshot,
			affectedKeys: entry.affectedKeys,
			timestamp: Date.now(),
		})

		// Restore the redo snapshot
		this.store.importPartialSnapshot(entry.beforeSnapshot)

		this.notifySubscribers()
	}

	/**
	 * Blocks undo/redo operations.
	 * Use during persist to prevent inconsistent state.
	 */
	block(): void {
		// Flush any pending entry before blocking
		this.flushPendingEntry()
		this.isBlocked = true
		this.notifySubscribers()
	}

	/**
	 * Unblocks undo/redo operations.
	 */
	unblock(): void {
		this.isBlocked = false
		this.notifySubscribers()
	}

	/**
	 * Clears all undo/redo history.
	 */
	clear(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
			this.debounceTimer = null
		}
		this.pendingEntry = null
		this.undoStack = []
		this.redoStack = []
		this.manualGroupId = null
		this.manualGroupLabel = undefined
		this.notifySubscribers()
	}

	/**
	 * Subscribes to state changes.
	 * Returns unsubscribe function.
	 */
	subscribe(callback: Subscriber): () => void {
		this.subscribers.add(callback)
		return () => {
			this.subscribers.delete(callback)
		}
	}

	/**
	 * Gets current state for React integration.
	 */
	getState(): UndoState {
		return {
			canUndo: this.undoStack.length > 0 || this.pendingEntry !== null,
			canRedo: this.redoStack.length > 0,
			isBlocked: this.isBlocked,
			undoCount: this.undoStack.length + (this.pendingEntry ? 1 : 0),
			redoCount: this.redoStack.length,
		}
	}

	/**
	 * Notifies all subscribers of state change.
	 */
	private notifySubscribers(): void {
		for (const sub of this.subscribers) {
			sub()
		}
	}
}
