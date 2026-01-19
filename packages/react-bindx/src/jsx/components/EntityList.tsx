import React, { memo, type ReactElement } from 'react'
import { type EntityWhere, type EntityOrderBy } from '@contember/bindx'
import { useBindxContext } from '../../hooks/BackendAdapterContext.js'
import { useEntityListCore } from '../../hooks/useEntityListCore.js'
import { useSelectionCollectionForList } from '../../hooks/useSelectionCollectionForList.js'
import { createRuntimeAccessor } from '../proxy.js'
import type { EntityAccessor } from '../types.js'
import { EntityContext, type EntityContextValue } from '../../roles/RoleContext.js'

/**
 * Props for EntityList component
 */
export interface EntityListProps<TSchema, K extends keyof TSchema> {
	/** Entity type name */
	name: K
	/** Optional roles for role-aware type narrowing. When omitted, uses all available roles. */
	roles?: readonly string[]
	/** Optional filter criteria - type-safe based on entity schema */
	filter?: EntityWhere<TSchema[K]>
	/** Optional ordering - type-safe based on entity schema */
	orderBy?: readonly EntityOrderBy<TSchema[K]>[]
	/** Optional limit */
	limit?: number
	/** Optional offset */
	offset?: number
	/** Render function receiving typed entity accessor with direct field access */
	children: (entity: EntityAccessor<TSchema[K]>, index: number) => React.ReactNode
	/** Loading fallback */
	loading?: React.ReactNode
	/** Error fallback */
	error?: (error: Error) => React.ReactNode
	/** Empty state fallback (when list has no items) */
	empty?: React.ReactNode
}

/**
 * EntityList component - orchestrates the two-pass rendering approach for lists.
 *
 * Phase 1 (Collection): Renders children once with collector proxy to determine which fields are needed
 * Phase 2 (Loading): Fetches data based on collected selection
 * Phase 3 (Runtime): Renders children for each item with real data accessors
 *
 * @example
 * ```tsx
 * <EntityList name="Article" filter={{ published: true }} orderBy={[{ createdAt: 'desc' }]} limit={10}>
 *   {(article, index) => (
 *     <div key={article.id}>
 *       <Field field={article.fields.title} />
 *     </div>
 *   )}
 * </EntityList>
 * ```
 */
function EntityListImpl<TSchema, K extends keyof TSchema>({
	name,
	roles,
	filter,
	orderBy,
	limit,
	offset,
	children,
	loading,
	error: errorFallback,
	empty,
}: EntityListProps<TSchema, K>): ReactElement | null {
	const { store } = useBindxContext()
	const entityType = name as string

	// Phase 1: Collect JSX selection
	const { selection, queryKey } = useSelectionCollectionForList({
		entityType,
		filter,
		orderBy,
		limit,
		offset,
		children,
	})

	// Phase 2: Load data using core hook
	const result = useEntityListCore({
		entityType,
		filter,
		orderBy,
		limit,
		offset,
		selectionMeta: selection,
		queryKey,
	})

	// Render based on status
	if (result.status === 'loading') {
		return <>{loading ?? <DefaultLoading />}</>
	}

	if (result.status === 'error') {
		if (errorFallback) {
			return <>{errorFallback(result.error!)}</>
		}
		return <DefaultError error={result.error!} />
	}

	// Empty state
	if (result.items.length === 0) {
		return <>{empty ?? <DefaultEmpty entityType={entityType} />}</>
	}

	// Phase 3: Runtime render with real data
	const items = result.items.map((item, index) => {
		const accessor = createRuntimeAccessor<TSchema[K]>(
			entityType,
			item.id,
			store,
			() => {}, // Changes are automatically handled by useSyncExternalStore
		)

		// Wrap accessor in Proxy to inject __availableRoles for role-aware components
		const roleAwareAccessor = new Proxy(accessor, {
			get(target, prop) {
				if (prop === '__availableRoles') {
					return roles ?? []
				}
				return Reflect.get(target, prop)
			},
		})

		// Provide entity context for HasRole component
		const entityContext: EntityContextValue = {
			entityType,
			entityId: item.id,
			storeKey: `${entityType}:${item.id}`,
		}

		return (
			<EntityContext.Provider key={item.id} value={entityContext}>
				{children(roleAwareAccessor, index)}
			</EntityContext.Provider>
		)
	})

	return <>{items}</>
}

// Note: Using type assertion for generic memo component
export const EntityList = memo(EntityListImpl) as unknown as typeof EntityListImpl

/**
 * Default loading component
 */
function DefaultLoading(): ReactElement {
	return <div className="bindx-loading">Loading...</div>
}

/**
 * Default error component
 */
function DefaultError({ error }: { error: Error }): ReactElement {
	return (
		<div className="bindx-error">
			<strong>Error:</strong> {error.message}
		</div>
	)
}

/**
 * Default empty component
 */
function DefaultEmpty({ entityType }: { entityType: string }): ReactElement {
	return (
		<div className="bindx-empty">
			No {entityType} items found
		</div>
	)
}
