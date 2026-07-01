import type { ActionMiddleware } from '../core/ActionDispatcher.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import type { RekeyContext } from '../store/RekeyOrchestrator.js'
import { UndoJournal, cellRefKey, type JournalEntry, type JournalCellImage } from './UndoJournal.js'
import { rekeyJournalEntry } from './rekeyJournalEntry.js'
import type { UndoManagerConfig, UndoState } from './types.js'

type Subscriber = () => void

/**
 * Generates a unique id for manual group handles.
 */
function generateId(): string {
	return `undo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * UndoManager — the policy layer over the {@link UndoJournal}.
 *
 * The journal records each gesture (one dispatch / one handle transaction) as a
 * {@link JournalEntry} of editable-layer pre-images. UndoManager owns the undo /
 * redo stacks and the grouping policy (debounced auto-grouping + manual
 * begin/endGroup), blocks during persist, and keeps the stacks aligned across a
 * temp→persisted rekey. Restore goes straight through the store's write paths, so
 * the edge index and reachability cache rebuild themselves; the event/interceptor
 * pipeline is NOT replayed.
 */
export class UndoManager {
	private readonly journal: UndoJournal
	private undoStack: JournalEntry[] = []
	private redoStack: JournalEntry[] = []

	/** Cells accumulated while a debounce window or manual group is open (first-writer-wins). */
	private pending: Map<string, JournalCellImage> | null = null
	private debounceTimer: ReturnType<typeof setTimeout> | null = null
	private manualGroupId: string | null = null

	private isBlocked = false
	private subscribers = new Set<Subscriber>()
	private cachedState: UndoState | null = null

	private readonly maxHistorySize: number
	private readonly debounceMs: number

	constructor(
		private readonly store: SnapshotStore,
		config: UndoManagerConfig = {},
	) {
		this.maxHistorySize = config.maxHistorySize ?? 100
		this.debounceMs = config.debounceMs ?? 300
		this.journal = new UndoJournal(
			store,
			entry => this.onEntry(entry),
			ctx => this.rekeyStacks(ctx),
		)
	}

	/**
	 * Wires the journal into the store so its write paths record gestures. The
	 * returned middleware is a backward-compatible pass-through (recording is native
	 * to the store transaction, not the middleware).
	 */
	createMiddleware(): ActionMiddleware {
		this.store.setJournal(this.journal)
		const middleware: ActionMiddleware = () => true
		middleware.dispose = () => {
			this.store.clearJournal(this.journal)
		}
		return middleware
	}

	// ==================== Recording (journal commit sink) ====================

	private onEntry(entry: JournalEntry): void {
		if (this.isBlocked || entry.cells.length === 0) return

		// A fresh user action invalidates the redo stack.
		if (this.redoStack.length > 0) {
			this.redoStack = []
		}

		if (this.manualGroupId !== null) {
			this.mergeIntoPending(entry)
			this.notifySubscribers()
			return
		}

		if (this.debounceMs === 0) {
			this.pushEntry(entry)
			return
		}

		this.mergeIntoPending(entry)
		this.resetDebounceTimer()
		this.notifySubscribers()
	}

	private mergeIntoPending(entry: JournalEntry): void {
		if (!this.pending) {
			this.pending = new Map()
		}
		for (const cell of entry.cells) {
			const key = cellRefKey(cell)
			// First-writer-wins: keep the state from before the group began.
			if (!this.pending.has(key)) {
				this.pending.set(key, cell)
			}
		}
	}

	private flushPending(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
			this.debounceTimer = null
		}
		const pending = this.pending
		this.pending = null
		if (pending && pending.size > 0) {
			this.pushEntry({ cells: [...pending.values()] })
		}
	}

	private pushEntry(entry: JournalEntry): void {
		this.undoStack.push(entry)
		while (this.undoStack.length > this.maxHistorySize) {
			this.undoStack.shift()
		}
		this.notifySubscribers()
	}

	private resetDebounceTimer(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
		}
		this.debounceTimer = setTimeout(() => this.flushPending(), this.debounceMs)
	}

	// ==================== Grouping ====================

	/**
	 * Starts a manual group: every gesture until {@link endGroup} folds into one
	 * undo entry. Returns a handle that must be passed back to endGroup.
	 */
	beginGroup(_label?: string): string {
		this.flushPending()
		const id = generateId()
		this.manualGroupId = id
		return id
	}

	endGroup(groupId: string): void {
		if (this.manualGroupId !== groupId) {
			console.warn(`UndoManager: endGroup called with wrong groupId. Expected ${this.manualGroupId}, got ${groupId}`)
			return
		}
		this.manualGroupId = null
		this.flushPending()
	}

	// ==================== Undo / Redo ====================

	undo(): void {
		this.flushPending()
		if (this.isBlocked || this.undoStack.length === 0) return

		const entry = this.undoStack.pop()!
		// Capture the current state of the same cells as the inverse (redo) entry,
		// then restore the pre-images.
		const inverse = this.journal.captureCurrent(entry.cells)
		this.journal.apply(entry.cells)
		this.redoStack.push({ cells: inverse })

		this.notifySubscribers()
	}

	redo(): void {
		if (this.isBlocked || this.redoStack.length === 0) return

		const entry = this.redoStack.pop()!
		const inverse = this.journal.captureCurrent(entry.cells)
		this.journal.apply(entry.cells)
		this.undoStack.push({ cells: inverse })

		this.notifySubscribers()
	}

	// ==================== Blocking (during persist) ====================

	block(): void {
		this.flushPending()
		this.isBlocked = true
		this.notifySubscribers()
	}

	unblock(): void {
		this.isBlocked = false
		this.notifySubscribers()
	}

	// ==================== Persist rekey ====================

	/**
	 * Rewrites every stacked entry when a temp id is replaced by its persisted id,
	 * so stored cells keep valid keys / id references (and sealed creates drop out).
	 */
	private rekeyStacks(ctx: RekeyContext): void {
		const liveServerIds = (key: string): Set<string> => this.store.getLiveHasManyServerIds(key)
		const undoCount = this.undoStack.length
		const redoCount = this.redoStack.length
		const hadPending = this.pending !== null && this.pending.size > 0

		this.undoStack = this.undoStack
			.map(entry => rekeyJournalEntry(entry, ctx, liveServerIds))
			.filter(entry => entry.cells.length > 0)
		this.redoStack = this.redoStack
			.map(entry => rekeyJournalEntry(entry, ctx, liveServerIds))
			.filter(entry => entry.cells.length > 0)
		if (this.pending) {
			const rekeyed = rekeyJournalEntry({ cells: [...this.pending.values()] }, ctx, liveServerIds)
			if (rekeyed.cells.length > 0) {
				this.pending = new Map(rekeyed.cells.map(cell => [cellRefKey(cell), cell]))
			} else {
				this.pending = null
				if (this.debounceTimer) {
					clearTimeout(this.debounceTimer)
					this.debounceTimer = null
				}
			}
		}

		const hasPending = this.pending !== null && this.pending.size > 0
		if (this.undoStack.length !== undoCount || this.redoStack.length !== redoCount || hasPending !== hadPending) {
			this.notifySubscribers()
		}
	}

	// ==================== History / State ====================

	clear(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
			this.debounceTimer = null
		}
		this.pending = null
		this.manualGroupId = null
		this.undoStack = []
		this.redoStack = []
		this.notifySubscribers()
	}

	subscribe(callback: Subscriber): () => void {
		this.subscribers.add(callback)
		return () => {
			this.subscribers.delete(callback)
		}
	}

	getState(): UndoState {
		if (!this.cachedState) {
			const hasPending = this.pending !== null && this.pending.size > 0
			this.cachedState = {
				canUndo: this.undoStack.length > 0 || hasPending,
				canRedo: this.redoStack.length > 0,
				isBlocked: this.isBlocked,
				undoCount: this.undoStack.length + (hasPending ? 1 : 0),
				redoCount: this.redoStack.length,
			}
		}
		return this.cachedState
	}

	private notifySubscribers(): void {
		this.cachedState = null
		for (const sub of this.subscribers) {
			sub()
		}
	}
}
