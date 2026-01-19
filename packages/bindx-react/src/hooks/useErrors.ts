import { useSyncExternalStore, useCallback, useMemo } from 'react'
import type { FieldError } from '@contember/bindx'
import { useBindxContext } from './BackendAdapterContext.js'

/**
 * Error state for an entity, including all field and relation errors.
 */
export interface EntityErrorsState {
	/** Entity-level errors */
	readonly entityErrors: readonly FieldError[]
	/** Field errors keyed by field name */
	readonly fieldErrors: ReadonlyMap<string, readonly FieldError[]>
	/** Relation errors keyed by relation name */
	readonly relationErrors: ReadonlyMap<string, readonly FieldError[]>
	/** Whether the entity has any errors */
	readonly hasErrors: boolean
	/** Whether the entity has any client-side errors */
	readonly hasClientErrors: boolean
	/** Whether the entity has any server-side errors */
	readonly hasServerErrors: boolean
	/** All errors as a flat array */
	readonly allErrors: readonly FieldError[]
}

/**
 * Hook for accessing error state for a specific entity.
 * Provides reactive access to entity, field, and relation errors.
 *
 * @example
 * ```tsx
 * function ArticleEditor({ id }: { id: string }) {
 *   const { hasErrors, entityErrors, fieldErrors } = useEntityErrors('Article', id)
 *
 *   return (
 *     <div>
 *       {hasErrors && (
 *         <div className="error-banner">
 *           There are validation errors. Please fix them before saving.
 *         </div>
 *       )}
 *       {entityErrors.map(e => <p key={e.message}>{e.message}</p>)}
 *     </div>
 *   )
 * }
 * ```
 */
export function useEntityErrors(entityType: string, entityId: string): EntityErrorsState {
	const { store } = useBindxContext()

	// Create a stable function to collect all errors for this entity
	const collectErrors = useCallback((): EntityErrorsState => {
		const entityErrors = store.getEntityErrors(entityType, entityId)

		// Collect field errors
		const fieldErrorsMap = new Map<string, readonly FieldError[]>()
		const keyPrefix = `${entityType}:${entityId}:`

		// We need to iterate through all fields, but the store doesn't expose
		// a method to list all field keys. Instead, we access the snapshot
		// and check each field.
		const snapshot = store.getEntitySnapshot(entityType, entityId)
		if (snapshot?.data) {
			for (const fieldName of Object.keys(snapshot.data as Record<string, unknown>)) {
				const errors = store.getFieldErrors(entityType, entityId, fieldName)
				if (errors.length > 0) {
					fieldErrorsMap.set(fieldName, errors)
				}
			}
		}

		// Collect relation errors - similar approach
		const relationErrorsMap = new Map<string, readonly FieldError[]>()
		if (snapshot?.data) {
			for (const fieldName of Object.keys(snapshot.data as Record<string, unknown>)) {
				const errors = store.getRelationErrors(entityType, entityId, fieldName)
				if (errors.length > 0) {
					relationErrorsMap.set(fieldName, errors)
				}
			}
		}

		// Compute all errors flat array
		const allErrors: FieldError[] = [...entityErrors]
		for (const errors of fieldErrorsMap.values()) {
			allErrors.push(...errors)
		}
		for (const errors of relationErrorsMap.values()) {
			allErrors.push(...errors)
		}

		const hasErrors = allErrors.length > 0
		const hasClientErrors = allErrors.some(e => e.source === 'client')
		const hasServerErrors = allErrors.some(e => e.source === 'server')

		return {
			entityErrors,
			fieldErrors: fieldErrorsMap,
			relationErrors: relationErrorsMap,
			hasErrors,
			hasClientErrors,
			hasServerErrors,
			allErrors,
		}
	}, [store, entityType, entityId])

	// Subscribe to entity changes
	const subscribe = useCallback(
		(callback: () => void) => store.subscribeToEntity(entityType, entityId, callback),
		[store, entityType, entityId],
	)

	const errorsState = useSyncExternalStore(
		subscribe,
		collectErrors,
		collectErrors,
	)

	return errorsState
}

/**
 * Hook for accessing persistence error state from the most recent persist operation.
 * Useful for displaying a summary of what went wrong during persistence.
 *
 * @example
 * ```tsx
 * function SaveButton() {
 *   const { persistAll } = usePersist()
 *   const [lastResult, setLastResult] = useState<PersistenceResult | null>(null)
 *
 *   const handleSave = async () => {
 *     const result = await persistAll({ rollbackOnError: true })
 *     setLastResult(result)
 *   }
 *
 *   return (
 *     <div>
 *       <button onClick={handleSave}>Save</button>
 *       {lastResult && !lastResult.success && (
 *         <div className="error">
 *           Failed to save {lastResult.failedCount} items
 *         </div>
 *       )}
 *     </div>
 *   )
 * }
 * ```
 */
// Note: For tracking persistence results, use the result returned by persist methods
// in usePersist hook. This hook focuses on reactive entity error state.
