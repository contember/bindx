import React, { memo, type ReactElement } from 'react'
import { type EntityDef, type EntityWhere, type EntityOrderBy, type FieldError, type CommonEntity } from '@contember/bindx'
import { useEntityList } from '../../hooks/useEntityList.js'
import { useSelectionCollection } from '../../hooks/useSelectionCollection.js'
import type { EntityAccessor } from '../types.js'
import { annotateElement } from '../devAnnotations.js'

/**
 * Props for EntityList component
 */
export interface EntityListProps<TRoleMap extends Record<string, object> = Record<string, object>> {
	/** Entity definition reference */
	entity: EntityDef<TRoleMap>
	/** Optional filter criteria - type-safe based on entity schema */
	filter?: EntityWhere<CommonEntity<TRoleMap>>
	/** Optional ordering - type-safe based on entity schema */
	orderBy?: readonly EntityOrderBy<CommonEntity<TRoleMap>>[]
	/** Optional limit */
	limit?: number
	/** Optional offset */
	offset?: number
	/**
	 * Cache-invalidation key. Changing this value re-fetches the list without
	 * unmounting the subtree (stale-while-revalidate). Use this when external
	 * mutations need the bindx view refreshed but UI state must survive.
	 */
	queryKey?: string
	/** Render function receiving typed entity accessor with direct field access */
	children: (entity: EntityAccessor<CommonEntity<TRoleMap>>, index: number) => React.ReactNode
	/** Loading fallback */
	loading?: React.ReactNode
	/** Error fallback */
	error?: (error: FieldError) => React.ReactNode
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
 * <EntityList entity={schema.Article} filter={{ published: true }} orderBy={[{ createdAt: 'desc' }]} limit={10}>
 *   {(article, index) => (
 *     <div key={article.id}>
 *       <Field field={article.fields.title} />
 *     </div>
 *   )}
 * </EntityList>
 * ```
 */
function EntityListComponent<TRoleMap extends Record<string, object>>({
	entity,
	filter,
	orderBy,
	limit,
	offset,
	queryKey: userQueryKey,
	children,
	loading,
	error: errorFallback,
	empty,
}: EntityListProps<TRoleMap>): ReactElement | null {
	const entityType = entity.$name

	// Stable options key for dependency tracking
	const optionsKey = JSON.stringify({
		filter: filter ?? {},
		orderBy: orderBy ?? [],
		limit,
		offset,
	})

	// Phase 1: Collect JSX selection
	const { selection, queryKey: selectionQueryKey } = useSelectionCollection({
		entityType,
		depsKey: optionsKey,
		collect: collector => children(collector as unknown as EntityAccessor<CommonEntity<TRoleMap>>, 0),
		queryKeyExtra: { filter, orderBy, limit, offset },
	})

	// Combine internal selection key with user-supplied invalidation key
	const effectiveQueryKey = userQueryKey !== undefined
		? `${selectionQueryKey}::${userQueryKey}`
		: selectionQueryKey

	// Phase 2: Load data using unified hook
	const result = useEntityList(entity, {
		filter,
		orderBy,
		limit,
		offset,
		selection,
		queryKey: effectiveQueryKey,
	})

	// Render based on status
	if (result.$status === 'loading') {
		return <>{loading ?? <DefaultLoading />}</>
	}

	if (result.$status === 'error') {
		if (errorFallback) {
			return <>{errorFallback(result.$error)}</>
		}
		return <DefaultError error={result.$error} />
	}

	// Empty state
	if (result.items.length === 0) {
		return <>{empty ?? <DefaultEmpty entityType={entityType} />}</>
	}

	// Phase 3: Runtime render — items are already EntityAccessors from the hook
	const items = result.items.map((item: (typeof result.items)[number], index: number) => {
		const result = children(item as unknown as EntityAccessor<CommonEntity<TRoleMap>>, index)
		return (
			<React.Fragment key={item.id}>
				{annotateElement(result, { 'data-entity': entityType, 'data-entity-id': item.id })}
			</React.Fragment>
		)
	})

	return <>{items}</>
}

// Note: Using type assertion for generic memo component
export const EntityList = memo(EntityListComponent) as unknown as typeof EntityListComponent

/**
 * Default loading component
 */
function DefaultLoading(): ReactElement {
	return <div className="bindx-loading">Loading...</div>
}

/**
 * Default error component
 */
function DefaultError({ error }: { error: FieldError }): ReactElement {
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
