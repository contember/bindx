/**
 * Notification types for user-facing feedback (toasts, alerts).
 */

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

export type NotificationSource = 'persist' | 'load' | 'client'

/**
 * A single notification displayed to the user.
 */
export interface Notification {
	readonly id: string
	readonly type: NotificationType
	readonly message: string
	/** Structured details (e.g., per-field errors) */
	readonly details?: readonly NotificationDetail[]
	/** Raw technical detail (e.g., server errorMessage) */
	readonly technicalDetail?: string
	/** Auto-dismiss timeout in ms. 0 = manual dismiss only. */
	readonly dismissAfter: number
	/** What triggered this notification */
	readonly source: NotificationSource
	readonly timestamp: number
}

/**
 * Structured detail within a notification.
 */
export interface NotificationDetail {
	readonly entityType?: string
	readonly fieldName?: string
	readonly message: string
}

/**
 * Input for creating a notification (id and timestamp are auto-generated).
 */
export type NotificationInput = Omit<Notification, 'id' | 'timestamp'>
