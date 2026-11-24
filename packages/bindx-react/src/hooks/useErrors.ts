import { useCallback } from 'react'
import type { FieldError } from '@contember/bindx'
import { useBindxContext } from './BackendAdapterContext.js'
import { useStoreSubscription } from './useStoreSubscription.js'

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
	const { store, schema } = useBindxContext()

	// Create a stable function to collect all errors for this entity
	const collectErrors = useCallback((): EntityErrorsState => {
		const entityErrors = store.getEntityErrors(entityType, entityId)

		// Collect field errors
		const fieldErrorsMap = new Map<string, readonly FieldError[]>()

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

		// Relations are not part of the snapshot, so the schema lists them.
		const relationErrorsMap = new Map<string, readonly FieldError[]>()
		for (const fieldName of schema.getRelationFields(entityType)) {
			const errors = store.getRelationErrors(entityType, entityId, fieldName)
			if (errors.length > 0) {
				relationErrorsMap.set(fieldName, errors)
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
	}, [store, schema, entityType, entityId])

	// Subscribe to entity changes
	const subscribe = useCallback(
		(callback: () => void) => store.subscribeToEntity(entityType, entityId, callback),
		[store, entityType, entityId],
	)

	// collectErrors builds a new state on every call; without the cache React sees a
	// changed snapshot on each read and re-renders without end.
	return useStoreSubscription({
		subscribe,
		getSnapshot: collectErrors,
		isEqual: haveSameErrors,
	})
}

function haveSameErrors(a: EntityErrorsState, b: EntityErrorsState): boolean {
	return isSameErrorList(a.entityErrors, b.entityErrors)
		&& isSameErrorMap(a.fieldErrors, b.fieldErrors)
		&& isSameErrorMap(a.relationErrors, b.relationErrors)
}

function isSameErrorMap(
	a: ReadonlyMap<string, readonly FieldError[]>,
	b: ReadonlyMap<string, readonly FieldError[]>,
): boolean {
	if (a.size !== b.size) return false
	for (const [key, errors] of a) {
		const other = b.get(key)
		if (other === undefined || !isSameErrorList(errors, other)) return false
	}
	return true
}

// The store keeps an error list's identity until it changes; an empty list is a fresh array per read.
function isSameErrorList(a: readonly FieldError[], b: readonly FieldError[]): boolean {
	return a === b || (a.length === 0 && b.length === 0)
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
