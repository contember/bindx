import React, { type ReactElement } from 'react'
import {
	type SchemaDefinition,
	SchemaRegistry,
	type SelectionInput,
	type AnyBrand,
	ContemberSchema,
} from '@contember/bindx'
import { useEntityImpl, type UseEntityOptions, type EntityAccessorResult } from './useEntityImpl.js'
import { useEntityListImpl, type UseEntityListOptions, type EntityListAccessorResult } from './useEntityListImpl.js'
import { useStableSelectionMeta } from './useStableSelectionMeta.js'
import {
	createComponentBuilder,
	COMPONENT_MARKER,
	COMPONENT_SELECTIONS,
	type SelectionPropMeta,
} from '../jsx/componentBuilder.js'
import type {
	ComponentBuilder,
	ComponentBuilderState,
	CreateComponentOptions,
} from '../jsx/componentBuilder.types.js'
import { Entity, type EntityProps } from '../jsx/components/Entity.js'
import { EntityList, type EntityListProps } from '../jsx/components/EntityList.js'

// Re-export symbols needed for declaration files
export { COMPONENT_MARKER, COMPONENT_SELECTIONS, type SelectionPropMeta } from '../jsx/componentBuilder.js'

// Re-export types for convenience
export type { EntityFields } from '@contember/bindx'
export type { UseEntityOptions, EntityAccessorResult, LoadingEntityAccessor, ErrorEntityAccessor, NotFoundEntityAccessor, ReadyEntityAccessor } from './useEntityImpl.js'
export type { UseEntityListOptions, EntityListAccessorResult, LoadingEntityListAccessor, ErrorEntityListAccessor, ReadyEntityListAccessor } from './useEntityListImpl.js'

// ============================================================================
// createBindx Implementation
// ============================================================================

/**
 * Creates type-safe bindx hooks and components for a specific schema.
 *
 * @example
 * ```ts
 * const schema = defineSchema<{
 *   Article: Article
 *   Author: Author
 * }>({...})
 *
 * export const { useEntity, useEntityList, Entity, createComponent } = createBindx(schema)
 * ```
 */
export function createBindx<TModels extends { [K in keyof TModels]: object }>(
	schemaDefinition: SchemaDefinition<TModels>,
) {
	const schemaRegistry = new SchemaRegistry(schemaDefinition)

	/**
	 * Hook to fetch and manage a single entity with full type inference.
	 *
	 * The `definer` declares which fields will be fetched from the backend.
	 * Only fields included in the definer are available — fields accessed
	 * conditionally in JSX must still be declared upfront in the definer:
	 *
	 * @example
	 * ```tsx
	 * // Wrong: internalNotes not in definer, will be undefined
	 * const article = useEntity('Article', { by: { id } }, e => e.title())
	 * return <>{isAdmin && article.internalNotes.value}</>
	 *
	 * // Correct: declare all fields you may access
	 * const article = useEntity('Article', { by: { id } }, e => e.title().internalNotes())
	 * ```
	 */
	function useEntity<TEntityName extends keyof TModels & string, TResult extends object>(
		entityType: TEntityName,
		options: UseEntityOptions,
		definer: SelectionInput<TModels[TEntityName], TResult>,
	): EntityAccessorResult<TModels[TEntityName], TResult> {
		const selectionMeta = useStableSelectionMeta(definer)

		return useEntityImpl<TModels[TEntityName], TResult>(
			entityType,
			options,
			selectionMeta,
			schemaRegistry,
		)
	}

	/**
	 * Hook to fetch and manage a list of entities with full type inference.
	 *
	 * The `definer` declares which fields will be fetched. Include all fields
	 * you may access, even conditionally — see {@link useEntity} for details.
	 */
	function useEntityList<TEntityName extends keyof TModels & string, TResult extends object>(
		entityType: TEntityName,
		options: UseEntityListOptions,
		definer: SelectionInput<TModels[TEntityName], TResult>,
	): EntityListAccessorResult<TResult> {
		const selectionMeta = useStableSelectionMeta(definer)

		return useEntityListImpl<TResult>(
			entityType,
			options,
			selectionMeta,
			schemaRegistry,
		)
	}

	// Typed wrapper components that restrict entity names to TModels keys
	function TypedEntity<K extends keyof TModels & string>(props: EntityProps<TModels, K>): ReactElement | null {
		return <Entity {...props} />
	}

	function TypedEntityList<K extends keyof TModels & string>(props: EntityListProps<TModels, K>): ReactElement | null {
		return <EntityList {...props} />
	}

	/**
	 * Creates a component builder for defining bindx components.
	 */
	// eslint-disable-next-line @typescript-eslint/ban-types
	function createComponent(): ComponentBuilder<TModels, ComponentBuilderState<TModels, {}, object, readonly string[]>>
	function createComponent<TRoles extends readonly string[]>(
		options: CreateComponentOptions<TRoles>,
	// eslint-disable-next-line @typescript-eslint/ban-types
	): ComponentBuilder<TModels, ComponentBuilderState<TModels, {}, object, TRoles>>
	function createComponent(options?: CreateComponentOptions<readonly string[]>): ComponentBuilder<TModels, ComponentBuilderState<TModels>> {
		const roles = options?.roles ?? []
		return createComponentBuilder<TModels>(
			schemaRegistry,
			roles,
		)
	}

	return {
		useEntity,
		useEntityList,
		Entity: TypedEntity,
		EntityList: TypedEntityList,
		createComponent,
		schemaRegistry,
		schema: schemaRegistry, // Backwards compatibility
	}
}
