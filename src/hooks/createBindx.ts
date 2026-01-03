import { useRef } from 'react'
import type { SelectionMeta, FluentFragment, SelectionBuilder } from '../selection/types.js'
import { EntityAccessorImpl } from '../accessors/EntityAccessor.js'
import type { EntityAccessor, EntityListAccessor } from '../accessors/types.js'
import { EntityListAccessorImpl } from '../accessors/EntityListAccessor.js'
import { useEntityData, useEntityListData } from './useEntityData.js'
import { resolveSelectionMeta, type SelectionInput } from '../core/SelectionResolver.js'

/**
 * Options for useEntity hook
 */
export interface UseEntityOptions {
	/** Entity ID to fetch */
	id: string
	/** If true, use cached data from IdentityMap if available (default: false) */
	cache?: boolean
}

/**
 * Options for useEntityList hook
 */
export interface UseEntityListOptions {
	/** Optional filter criteria */
	filter?: Record<string, unknown>
}

/**
 * Result type for useEntity when loading
 */
export interface LoadingEntityAccessor<TData> {
	readonly isLoading: true
	readonly isPersisting: false
	readonly isDirty: false
	readonly id: string
	readonly fields: never
	readonly data: never
	persist(): Promise<void>
	reset(): void
}

/**
 * Creates a placeholder accessor for loading state
 */
function createLoadingAccessor<TData>(id: string): LoadingEntityAccessor<TData> {
	return {
		isLoading: true,
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
 * Result type for useEntityList when loading
 */
export interface LoadingEntityListAccessor<TData> {
	readonly isLoading: true
	readonly isDirty: false
	readonly items: never
	readonly length: 0
	add(data: Partial<TData>): void
	remove(key: string): void
	move(fromIndex: number, toIndex: number): void
}

/**
 * Creates a placeholder accessor for entity list loading state
 */
function createLoadingListAccessor<TData>(): LoadingEntityListAccessor<TData> {
	return {
		isLoading: true,
		isDirty: false,
		get items(): never {
			throw new Error('Cannot access items while loading')
		},
		length: 0,
		add() {
			// No-op while loading
		},
		remove() {
			// No-op while loading
		},
		move() {
			// No-op while loading
		},
	}
}

/**
 * Schema type constraint - maps entity names to their model types.
 */
export interface EntitySchema {
	[entityName: string]: object
}

/**
 * Type for fluent definer function
 */
type FluentDefiner<TModel, TResult extends object> = (
	builder: SelectionBuilder<TModel>,
) => SelectionBuilder<TModel, TResult, object>

/**
 * Creates type-safe bindx hooks for a specific schema.
 *
 * @example
 * ```ts
 * // Define your schema
 * interface Schema {
 *   Article: Article
 *   Author: Author
 *   Tag: Tag
 * }
 *
 * // Create typed hooks
 * export const { useEntity, useEntityList } = createBindx<Schema>()
 *
 * // Usage with fluent builder
 * const article = useEntity('Article', { id }, e =>
 *   e.id().title().content()
 *    .author(a => a.name().email())
 *    .tags(t => t.id().name())
 * )
 * ```
 */
export function createBindx<TSchema extends { [K in keyof TSchema]: object }>() {
	/**
	 * Hook to fetch and manage a single entity with full type inference.
	 *
	 * @param entityType - Name of the entity (autocompleted from schema)
	 * @param options - Options including the entity ID and cache behavior
	 * @param definer - Fluent builder function or fragment defining which fields to fetch
	 */
	function useEntity<TEntityName extends keyof TSchema & string, TResult extends object>(
		entityType: TEntityName,
		options: UseEntityOptions,
		definer: SelectionInput<TSchema[TEntityName], TResult>,
	): EntityAccessor<TResult> | LoadingEntityAccessor<TResult> {
		// Track accessor for cleanup
		const accessorRef = useRef<EntityAccessorImpl<TResult> | null>(null)

		// Use shared data loading hook
		const { state, notifyChange, selectionMeta, identityMap, adapter } = useEntityData(
			{ entityType, id: options.id, useCache: options.cache },
			definer,
		)

		// Return loading state
		if (state.status === 'loading' || state.status === 'not_found') {
			return createLoadingAccessor<TResult>(options.id)
		}

		if (state.status === 'error') {
			console.error(`Failed to fetch ${entityType}:${options.id}:`, state.error)
			return createLoadingAccessor<TResult>(options.id)
		}

		// Create or update accessor
		if (!accessorRef.current) {
			accessorRef.current = new EntityAccessorImpl<TResult>(
				options.id,
				entityType,
				selectionMeta,
				adapter,
				identityMap,
				state.data,
				notifyChange,
			)
		}

		return accessorRef.current as EntityAccessor<TResult>
	}

	/**
	 * Hook to fetch and manage a list of entities with full type inference.
	 *
	 * @param entityType - Name of the entity (autocompleted from schema)
	 * @param options - Options including filter criteria
	 * @param definer - Fluent builder function or fragment defining which fields to fetch
	 */
	function useEntityList<TEntityName extends keyof TSchema & string, TResult extends object>(
		entityType: TEntityName,
		options: UseEntityListOptions,
		definer: SelectionInput<TSchema[TEntityName], TResult>,
	): EntityListAccessor<TResult> | LoadingEntityListAccessor<TResult> {
		// Track accessor for cleanup
		const accessorRef = useRef<EntityListAccessorImpl<TResult> | null>(null)

		// Use shared data loading hook
		const { state, notifyChange, selectionMeta, identityMap, adapter } = useEntityListData(
			{ entityType, filter: options.filter },
			definer,
		)

		// Return loading state
		if (state.status === 'loading') {
			return createLoadingListAccessor<TResult>()
		}

		if (state.status === 'error') {
			console.error(`Failed to fetch ${entityType} list:`, state.error)
			return createLoadingListAccessor<TResult>()
		}

		// Create or update accessor
		if (!accessorRef.current) {
			accessorRef.current = new EntityListAccessorImpl<TResult>(
				entityType,
				selectionMeta,
				adapter,
				identityMap,
				state.data,
				notifyChange,
			)
		}

		return accessorRef.current as EntityListAccessor<TResult>
	}

	return {
		useEntity,
		useEntityList,
	}
}
