import { useRef, useEffect, useMemo } from 'react'
import type { SchemaRegistry, EntityUniqueWhere } from '@contember/bindx'
import { EntityHandle } from '@contember/bindx'
import { useBindxContext } from './BackendAdapterContext.js'
import { useEntityCore } from './useEntityCore.js'
import { resolveSelectionMeta, type SelectionInput } from '@contember/bindx'
import type { SelectionMeta } from '@contember/bindx'
import type { EntityFields, SelectedEntityFields } from '@contember/bindx'

/**
 * Options for useEntity hook
 */
export interface UseEntityOptions {
	/** Unique field(s) to identify the entity (e.g., { id: '...' } or { slug: '...' }) */
	by: EntityUniqueWhere
	/** If true, use cached data from store if available (default: false) */
	cache?: boolean
}

/**
 * Loading state for entity accessor
 */
export interface LoadingEntityAccessor {
	readonly status: 'loading'
	readonly isLoading: true
	readonly isError: false
	readonly isPersisting: false
	readonly isDirty: false
	readonly id: string
	readonly fields: never
	readonly data: never
	persist(): Promise<void>
	reset(): void
}

/**
 * Error state for entity accessor
 */
export interface ErrorEntityAccessor {
	readonly status: 'error'
	readonly isLoading: false
	readonly isError: true
	readonly error: Error
	readonly isPersisting: false
	readonly isDirty: false
	readonly id: string
	readonly fields: never
	readonly data: never
	persist(): Promise<void>
	reset(): void
}

/**
 * Ready state base interface for entity accessor
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 */
export interface ReadyEntityAccessorBase<TEntity extends object, TSelected extends object = TEntity> {
	readonly status: 'ready'
	readonly isLoading: false
	readonly isError: false
	readonly isPersisting: boolean
	readonly isDirty: boolean
	readonly id: string
	readonly fields: SelectedEntityFields<TEntity, TSelected>
	readonly data: TSelected
	persist(): Promise<void>
	reset(): void
}

/**
 * Ready state for entity accessor with direct field access via Proxy.
 * Access fields directly: `entity.fieldName` instead of `entity.fields.fieldName`.
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 */
export type ReadyEntityAccessor<TEntity extends object, TSelected extends object = TEntity> =
	ReadyEntityAccessorBase<TEntity, TSelected> & SelectedEntityFields<TEntity, TSelected>

/**
 * Union of all entity accessor states
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields (defaults to TEntity for backwards compatibility)
 */
export type EntityAccessorResult<TEntity extends object, TSelected extends object = TEntity> =
	| LoadingEntityAccessor
	| ErrorEntityAccessor
	| ReadyEntityAccessor<TEntity, TSelected>

/**
 * Creates a loading accessor placeholder
 */
function createLoadingAccessor(id: string): LoadingEntityAccessor {
	return {
		status: 'loading',
		isLoading: true,
		isError: false,
		isPersisting: false,
		isDirty: false,
		id,
		get fields(): never {
			throw new Error('Cannot access fields while loading')
		},
		get data(): never {
			throw new Error('Cannot access data while loading')
		},
		async persist() {
			// No-op while loading
		},
		reset() {
			// No-op while loading
		},
	}
}

/**
 * Creates an error accessor placeholder
 */
function createErrorAccessor(id: string, error: Error): ErrorEntityAccessor {
	return {
		status: 'error',
		isLoading: false,
		isError: true,
		error,
		isPersisting: false,
		isDirty: false,
		id,
		get fields(): never {
			throw new Error('Cannot access fields after error')
		},
		get data(): never {
			throw new Error('Cannot access data after error')
		},
		async persist() {
			// No-op after error
		},
		reset() {
			// No-op after error
		},
	}
}

/**
 * Generic implementation of useEntity hook.
 * Used by createBindx to create typed versions.
 *
 * @typeParam TEntity - The full entity type
 * @typeParam TSelected - The selected subset of fields
 * @internal
 */
export function useEntityImpl<TEntity extends object, TSelected extends object>(
	entityType: string,
	options: UseEntityOptions,
	selectionMeta: SelectionMeta,
	schema: SchemaRegistry<Record<string, object>>,
): EntityAccessorResult<TEntity, TSelected> {
	const { store, dispatcher, batchPersister } = useBindxContext()

	// Derive ID from 'by' for internal use (before entity is loaded)
	const derivedId = useMemo(() => {
		const by = options.by
		if ('id' in by && typeof by['id'] === 'string') {
			return by['id']
		}
		const firstValue = Object.values(by)[0]
		return typeof firstValue === 'string' ? firstValue : String(firstValue)
	}, [options.by])

	// Use core hook for data loading
	const coreResult = useEntityCore({
		entityType,
		by: options.by,
		selectionMeta,
		cache: options.cache,
	})

	// Create stable handle (memoized on derivedId/type)
	const handle = useMemo(
		() => new EntityHandle<TEntity, TSelected>(derivedId, entityType, store, dispatcher, schema),
		[derivedId, entityType, store, dispatcher, schema],
	)

	// Cleanup handle on unmount
	useEffect(() => {
		return () => {
			handle.dispose()
		}
	}, [handle])

	// Build accessor from core result
	const accessor = useMemo((): EntityAccessorResult<TEntity, TSelected> => {
		if (coreResult.status === 'loading') {
			return createLoadingAccessor(derivedId)
		}

		if (coreResult.status === 'error') {
			return createErrorAccessor(derivedId, coreResult.error!)
		}

		if (coreResult.status === 'not_found') {
			return createLoadingAccessor(derivedId) // Treat not_found as loading for now
		}

		// Ready state - use real ID from snapshot if available
		const snapshot = coreResult.snapshot!
		const realId = (snapshot.data as Record<string, unknown>)?.['id'] as string | undefined ?? derivedId

		const baseAccessor: ReadyEntityAccessorBase<TEntity, TSelected> = {
			status: 'ready',
			isLoading: false,
			isError: false,
			isPersisting: coreResult.isPersisting,
			get isDirty() {
				// Use handle.$isDirty which includes scalar and relation changes
				return handle.$isDirty
			},
			id: realId,
			fields: handle.$fields as SelectedEntityFields<TEntity, TSelected>,
			data: snapshot.data as TSelected,
			async persist() {
				await batchPersister.persist(entityType, realId)
			},
			reset() {
				handle.reset()
			},
		}

		// Wrap in Proxy to enable direct field access (entity.fieldName instead of entity.fields.fieldName)
		return new Proxy(baseAccessor, {
			get(target, prop, receiver) {
				// First check if property exists on the base accessor
				if (prop in target) {
					return Reflect.get(target, prop, receiver)
				}
				// Then delegate to fields for direct field access
				// Note: fields is a Proxy without a has trap, so we access directly
				if (typeof prop === 'string') {
					const fields = target.fields as Record<string, unknown>
					const fieldValue = fields[prop]
					if (fieldValue !== undefined) {
						return fieldValue
					}
				}
				return undefined
			},
		}) as ReadyEntityAccessor<TEntity, TSelected>
	}, [coreResult, derivedId, handle, batchPersister, entityType])

	return accessor
}
