import { useSyncExternalStore, useCallback, useMemo } from 'react'
import {
	FIELD_REF_META,
	type BatchPersister,
	type DirtyEntity,
	type EntityPersistResult,
	type PersistenceResult,
	type PersistScope,
	type BatchPersistOptions,
	type FieldRef,
	type HasOneRef,
	type HasManyRef,
	type FieldRefMeta,
} from '@contember/bindx'
import { useBindxContext } from './BackendAdapterContext.js'

/**
 * Any ref that has entity metadata (FieldRef, HasOneRef, HasManyRef)
 */
export type AnyRefWithMeta = { readonly [FIELD_REF_META]: FieldRefMeta }

/**
 * Extracts entity metadata from a ref
 */
function getRefMeta(ref: AnyRefWithMeta): FieldRefMeta {
	return ref[FIELD_REF_META]
}

/**
 * API returned by usePersist hook
 */
export interface PersistApi {
	/** Persist all dirty entities in a transaction */
	persistAll(options?: BatchPersistOptions): Promise<PersistenceResult>

	/**
	 * Persist a single entity.
	 * Can be called with entityType/entityId or with a ref (FieldRef, HasOneRef, HasManyRef).
	 *
	 * @example
	 * ```tsx
	 * // With entityType and entityId
	 * persist('Article', 'abc-123')
	 *
	 * // With a FieldRef - persists the entity the field belongs to
	 * persist(article.fields.title)
	 * ```
	 */
	persist(ref: AnyRefWithMeta, options?: BatchPersistOptions): Promise<EntityPersistResult>
	persist(entityType: string, entityId: string, options?: BatchPersistOptions): Promise<EntityPersistResult>

	/**
	 * Persist specific fields of an entity.
	 *
	 * @example
	 * ```tsx
	 * // With entityType, entityId, and field names
	 * persistFields('Article', 'abc-123', ['title', 'content'])
	 *
	 * // With a FieldRef - persists just that field
	 * persistFields(article.fields.title)
	 * ```
	 */
	persistFields(ref: AnyRefWithMeta, options?: BatchPersistOptions): Promise<EntityPersistResult>
	persistFields(
		entityType: string,
		entityId: string,
		fields: readonly string[],
		options?: BatchPersistOptions,
	): Promise<EntityPersistResult>

	/** Persist with custom scope */
	persistScope(scope: PersistScope, options?: BatchPersistOptions): Promise<PersistenceResult>

	/** Check if any entity is currently being persisted */
	isPersisting: boolean

	/** Get all dirty entities */
	dirtyEntities: readonly DirtyEntity[]

	/** Check if there are any dirty entities */
	isDirty: boolean
}

/**
 * Hook for accessing the persistence API.
 * Provides methods to persist all dirty entities, a single entity, or specific fields.
 *
 * @example
 * ```tsx
 * function SaveButton() {
 *   const { persistAll, isPersisting, isDirty } = usePersist()
 *
 *   return (
 *     <button
 *       onClick={() => persistAll()}
 *       disabled={isPersisting || !isDirty}
 *     >
 *       {isPersisting ? 'Saving...' : 'Save All'}
 *     </button>
 *   )
 * }
 * ```
 */
export function usePersist(): PersistApi {
	const { batchPersister, store } = useBindxContext()

	if (!batchPersister) {
		throw new Error('usePersist requires BatchPersister to be configured in the context')
	}

	const changeRegistry = batchPersister.getChangeRegistry()

	// Subscribe to store changes for dirty tracking
	const dirtyEntities = useSyncExternalStore(
		useCallback((callback) => store.subscribe(callback), [store]),
		useCallback(() => changeRegistry.getDirtyEntities(), [changeRegistry]),
		useCallback(() => changeRegistry.getDirtyEntities(), [changeRegistry]),
	)

	// Subscribe to in-flight changes
	const isPersisting = useSyncExternalStore(
		useCallback((callback) => changeRegistry.subscribe(callback), [changeRegistry]),
		useCallback(() => changeRegistry.hasInFlight(), [changeRegistry]),
		useCallback(() => changeRegistry.hasInFlight(), [changeRegistry]),
	)

	const persistAll = useCallback(
		(options?: BatchPersistOptions) => batchPersister.persistAll(options),
		[batchPersister],
	)

	const persist = useCallback(
		(
			refOrEntityType: AnyRefWithMeta | string,
			entityIdOrOptions?: string | BatchPersistOptions,
			options?: BatchPersistOptions,
		) => {
			if (typeof refOrEntityType === 'string') {
				// Called with (entityType, entityId, options?)
				return batchPersister.persist(refOrEntityType, entityIdOrOptions as string, options)
			}
			// Called with (ref, options?)
			const meta = getRefMeta(refOrEntityType)
			return batchPersister.persist(meta.entityType, meta.entityId, entityIdOrOptions as BatchPersistOptions | undefined)
		},
		[batchPersister],
	)

	const persistFields = useCallback(
		(
			refOrEntityType: AnyRefWithMeta | string,
			entityIdOrOptions?: string | BatchPersistOptions,
			fieldsOrOptions?: readonly string[] | BatchPersistOptions,
			options?: BatchPersistOptions,
		) => {
			if (typeof refOrEntityType === 'string') {
				// Called with (entityType, entityId, fields, options?)
				return batchPersister.persistFields(
					refOrEntityType,
					entityIdOrOptions as string,
					fieldsOrOptions as readonly string[],
					options,
				)
			}
			// Called with (ref, options?) - persist just this field
			const meta = getRefMeta(refOrEntityType)
			return batchPersister.persistFields(
				meta.entityType,
				meta.entityId,
				[meta.fieldName],
				entityIdOrOptions as BatchPersistOptions | undefined,
			)
		},
		[batchPersister],
	)

	const persistScope = useCallback(
		(scope: PersistScope, options?: BatchPersistOptions) =>
			batchPersister.persistScope(scope, options),
		[batchPersister],
	)

	return useMemo(
		() => ({
			persistAll,
			persist,
			persistFields,
			persistScope,
			isPersisting,
			dirtyEntities,
			isDirty: dirtyEntities.length > 0,
		}),
		[persistAll, persist, persistFields, persistScope, isPersisting, dirtyEntities],
	)
}

/**
 * API returned by usePersistEntity hook
 */
export interface EntityPersistApi {
	/** Persist this entity */
	persist(options?: BatchPersistOptions): Promise<EntityPersistResult>

	/** Persist specific fields of this entity */
	persistFields(fields: readonly string[], options?: BatchPersistOptions): Promise<EntityPersistResult>

	/** Check if this entity is currently being persisted */
	isPersisting: boolean

	/** Check if this entity has any dirty changes */
	isDirty: boolean

	/** Get dirty fields for this entity */
	dirtyFields: readonly string[]

	/** Get dirty relations for this entity */
	dirtyRelations: readonly string[]
}

/**
 * Hook for accessing persistence API for a specific entity.
 * Provides convenience methods scoped to a single entity.
 *
 * @example
 * ```tsx
 * function ArticleEditor({ id }: { id: string }) {
 *   const article = useEntity('Article', { id })
 *   const { persist, persistFields, isPersisting, isDirty } = usePersistEntity('Article', id)
 *
 *   return (
 *     <div>
 *       <input {...article.fields.title.inputProps} />
 *       <button onClick={() => persistFields(['title'])} disabled={isPersisting}>
 *         Save Title
 *       </button>
 *       <button onClick={() => persist()} disabled={isPersisting || !isDirty}>
 *         Save All
 *       </button>
 *     </div>
 *   )
 * }
 * ```
 */
export function usePersistEntity(entityType: string, entityId: string): EntityPersistApi {
	const { batchPersister, store } = useBindxContext()

	if (!batchPersister) {
		throw new Error('usePersistEntity requires BatchPersister to be configured in the context')
	}

	const changeRegistry = batchPersister.getChangeRegistry()

	// Subscribe to store changes for this entity
	const entityKey = `${entityType}:${entityId}`

	const dirtyFields = useSyncExternalStore(
		useCallback(
			(callback) => store.subscribeToEntity(entityType, entityId, callback),
			[store, entityType, entityId],
		),
		useCallback(() => store.getDirtyFields(entityType, entityId), [store, entityType, entityId]),
		useCallback(() => store.getDirtyFields(entityType, entityId), [store, entityType, entityId]),
	)

	const dirtyRelations = useSyncExternalStore(
		useCallback(
			(callback) => store.subscribeToEntity(entityType, entityId, callback),
			[store, entityType, entityId],
		),
		useCallback(() => store.getDirtyRelations(entityType, entityId), [store, entityType, entityId]),
		useCallback(() => store.getDirtyRelations(entityType, entityId), [store, entityType, entityId]),
	)

	const isPersisting = useSyncExternalStore(
		useCallback(
			(callback) => {
				const unsubStore = store.subscribeToEntity(entityType, entityId, callback)
				const unsubRegistry = changeRegistry.subscribe(callback)
				return () => {
					unsubStore()
					unsubRegistry()
				}
			},
			[store, changeRegistry, entityType, entityId],
		),
		useCallback(
			() => changeRegistry.isInFlight(entityType, entityId),
			[changeRegistry, entityType, entityId],
		),
		useCallback(
			() => changeRegistry.isInFlight(entityType, entityId),
			[changeRegistry, entityType, entityId],
		),
	)

	const persist = useCallback(
		(options?: BatchPersistOptions) => batchPersister.persist(entityType, entityId, options),
		[batchPersister, entityType, entityId],
	)

	const persistFields = useCallback(
		(fields: readonly string[], options?: BatchPersistOptions) =>
			batchPersister.persistFields(entityType, entityId, fields, options),
		[batchPersister, entityType, entityId],
	)

	const isDirty = dirtyFields.length > 0 || dirtyRelations.length > 0

	return useMemo(
		() => ({
			persist,
			persistFields,
			isPersisting,
			isDirty,
			dirtyFields,
			dirtyRelations,
		}),
		[persist, persistFields, isPersisting, isDirty, dirtyFields, dirtyRelations],
	)
}
