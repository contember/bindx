import type { Notification, NotificationInput } from './types.js'

const DEFAULT_DISMISS_MS: Record<string, number> = {
	error: 60_000,
	warning: 15_000,
	success: 6_000,
	info: 6_000,
}

let nextId = 1

/**
 * Framework-agnostic store for user-facing notifications.
 * Follows the same subscriber pattern as ChangeRegistry / SnapshotStore.
 */
export class NotificationStore {
	private readonly notifications = new Map<string, Notification>()
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
	private readonly subscribers = new Set<() => void>()

	/** Cached snapshot for useSyncExternalStore */
	private snapshot: readonly Notification[] = []

	/**
	 * Add a notification. Returns its ID.
	 * Deduplicates by source + message — if an identical notification
	 * already exists, the existing ID is returned without adding a new one.
	 */
	add(input: NotificationInput): string {
		// Deduplicate
		for (const existing of this.notifications.values()) {
			if (existing.source === input.source && existing.message === input.message) {
				return existing.id
			}
		}

		const id = `notification-${nextId++}`
		const notification: Notification = {
			...input,
			id,
			timestamp: Date.now(),
		}

		this.notifications.set(id, notification)

		// Schedule auto-dismiss
		const dismissAfter = input.dismissAfter ?? DEFAULT_DISMISS_MS[input.type] ?? 6_000
		if (dismissAfter > 0) {
			this.timers.set(id, setTimeout(() => this.dismiss(id), dismissAfter))
		}

		this.updateSnapshot()
		return id
	}

	/**
	 * Remove a notification by ID.
	 */
	dismiss(id: string): void {
		if (!this.notifications.has(id)) return

		this.notifications.delete(id)
		const timer = this.timers.get(id)
		if (timer !== undefined) {
			clearTimeout(timer)
			this.timers.delete(id)
		}
		this.updateSnapshot()
	}

	/**
	 * Remove all notifications.
	 */
	clear(): void {
		for (const timer of this.timers.values()) {
			clearTimeout(timer)
		}
		this.timers.clear()
		this.notifications.clear()
		this.updateSnapshot()
	}

	/**
	 * Get all active notifications sorted by timestamp (oldest first).
	 * Returns a stable reference for useSyncExternalStore.
	 */
	getAll(): readonly Notification[] {
		return this.snapshot
	}

	/**
	 * Subscribe to notification changes.
	 * Returns an unsubscribe function.
	 */
	subscribe(callback: () => void): () => void {
		this.subscribers.add(callback)
		return () => this.subscribers.delete(callback)
	}

	/**
	 * Clean up all timers. Call when the store is no longer needed.
	 */
	destroy(): void {
		this.clear()
		this.subscribers.clear()
	}

	private updateSnapshot(): void {
		this.snapshot = Array.from(this.notifications.values()).sort(
			(a, b) => a.timestamp - b.timestamp,
		)
		for (const cb of this.subscribers) {
			cb()
		}
	}
}
