import { useCallback, useSyncExternalStore } from 'react'
import type { Notification, NotificationInput } from '@contember/bindx'
import { useNotificationStore } from './BackendAdapterContext.js'

const EMPTY: readonly Notification[] = []

/**
 * Returns all active notifications, re-rendering on changes.
 * Uses useSyncExternalStore for efficient subscriptions.
 */
export function useNotifications(): readonly Notification[] {
	const store = useNotificationStore()
	return useSyncExternalStore(
		store.subscribe.bind(store),
		() => store.getAll(),
		() => EMPTY,
	)
}

/**
 * Returns a stable callback for adding a notification.
 */
export function useShowNotification(): (input: NotificationInput) => string {
	const store = useNotificationStore()
	return useCallback(
		(input: NotificationInput) => store.add(input),
		[store],
	)
}

/**
 * Returns a stable callback for dismissing a notification.
 */
export function useDismissNotification(): (id: string) => void {
	const store = useNotificationStore()
	return useCallback(
		(id: string) => store.dismiss(id),
		[store],
	)
}
