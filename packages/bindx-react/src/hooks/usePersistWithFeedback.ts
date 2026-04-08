import { useCallback } from 'react'
import type { BatchPersistOptions, PersistenceResult, NotificationDetail } from '@contember/bindx'
import { usePersist, type PersistApi } from './usePersist.js'
import { useNotificationStore } from './BackendAdapterContext.js'

/**
 * Extended persist API that automatically shows notifications on success/failure.
 */
export interface PersistWithFeedbackApi extends PersistApi {
	/** Persist all dirty entities with automatic toast feedback */
	persistAllWithFeedback(options?: BatchPersistOptions): Promise<PersistenceResult>
}

/**
 * Wraps `usePersist()` with automatic notification feedback.
 *
 * - On success: shows a success notification
 * - On failure with server errors: shows an error notification with details
 * - On failure with client validation errors: shows a warning notification
 *
 * The raw `usePersist()` methods are still available for manual control.
 *
 * @example
 * ```tsx
 * function SaveButton() {
 *   const { persistAllWithFeedback, isPersisting, isDirty } = usePersistWithFeedback()
 *   return (
 *     <button onClick={() => persistAllWithFeedback()} disabled={isPersisting || !isDirty}>
 *       Save
 *     </button>
 *   )
 * }
 * ```
 */
export function usePersistWithFeedback(): PersistWithFeedbackApi {
	const persistApi = usePersist()
	const notificationStore = useNotificationStore()

	const persistAllWithFeedback = useCallback(
		async (options?: BatchPersistOptions): Promise<PersistenceResult> => {
			const result = await persistApi.persistAll(options)

			if (result.success) {
				notificationStore.add({
					type: 'success',
					message: 'Changes saved successfully',
					source: 'persist',
					dismissAfter: 6_000,
				})
			} else {
				const details: NotificationDetail[] = []
				let hasClientErrors = false

				for (const entityResult of result.results) {
					if (entityResult.success) continue

					if (entityResult.error) {
						// Server error
						details.push({
							entityType: entityResult.entityType,
							message: entityResult.error.message,
						})

						// Add field-level details from mutation result
						if (entityResult.error.mutationResult) {
							for (const err of entityResult.error.mutationResult.errors) {
								details.push({ message: err.message })
							}
							for (const err of entityResult.error.mutationResult.validation.errors) {
								details.push({ message: err.message.text })
							}
						}
					} else {
						// No server error means blocked by client validation
						hasClientErrors = true
					}
				}

				if (hasClientErrors && details.length === 0) {
					notificationStore.add({
						type: 'warning',
						message: 'Please fix validation errors before saving',
						source: 'persist',
						dismissAfter: 15_000,
					})
				} else {
					notificationStore.add({
						type: 'error',
						message: 'Failed to save changes',
						details: details.length > 0 ? details : undefined,
						source: 'persist',
						dismissAfter: 60_000,
					})
				}
			}

			return result
		},
		[persistApi, notificationStore],
	)

	return {
		...persistApi,
		persistAllWithFeedback,
	}
}
