import { useCallback, useRef, useSyncExternalStore } from 'react'

/**
 * Options for useStoreSubscription hook.
 */
export interface UseStoreSubscriptionOptions<T> {
	/** Function to subscribe to store changes */
	subscribe: (callback: () => void) => () => void
	/** Function to get current snapshot */
	getSnapshot: () => T
	/** Optional equality function for cache comparison (defaults to ===) */
	isEqual?: (a: T, b: T) => boolean
}

/**
 * Generic hook for subscribing to store changes with useSyncExternalStore.
 * Provides snapshot caching for referential stability.
 *
 * @internal This hook is for internal use only.
 */
export function useStoreSubscription<T>(
	options: UseStoreSubscriptionOptions<T>,
): T {
	const { subscribe, getSnapshot, isEqual = defaultIsEqual } = options

	// Cache for snapshot to ensure referential stability
	const cacheRef = useRef<{ value: T } | null>(null)

	// Stable getSnapshot callback with caching
	const getSnapshotCached = useCallback((): T => {
		const newValue = getSnapshot()

		// Return cached value if equal
		if (cacheRef.current !== null && isEqual(cacheRef.current.value, newValue)) {
			return cacheRef.current.value
		}

		// Update cache and return new value
		cacheRef.current = { value: newValue }
		return newValue
	}, [getSnapshot, isEqual])

	return useSyncExternalStore(subscribe, getSnapshotCached, getSnapshotCached)
}

/**
 * Default equality check using strict equality.
 */
function defaultIsEqual<T>(a: T, b: T): boolean {
	return a === b
}
