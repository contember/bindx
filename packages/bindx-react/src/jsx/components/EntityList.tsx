import React, { memo, type ReactElement } from 'react'
import { type EntityDef, type EntityWhere, type EntityOrderBy, type FieldError } from '@contember/bindx'
import { useEntityList } from '../../hooks/useEntityList.js'
import { useSelectionCollectionForList } from '../../hooks/useSelectionCollectionForList.js'
import type { EntityAccessor } from '../types.js'

/**
 * Props for EntityList component
 */
export interface EntityListProps<TEntity extends object = object> {
	/** Entity definition reference */
	entity: EntityDef<TEntity>
	/** Optional filter criteria - type-safe based on entity schema */
	filter?: EntityWhere<TEntity>
	/** Optional ordering - type-safe based on entity schema */
	orderBy?: readonly EntityOrderBy<TEntity>[]
	/** Optional limit */
	limit?: number
	/** Optional offset */
	offset?: number
	/** Render function receiving typed entity accessor with direct field access */
	children: (entity: EntityAccessor<TEntity>, index: number) => React.ReactNode
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
function EntityListComponent<TEntity extends object>({
	entity,
	filter,
	orderBy,
	limit,
	offset,
	children,
	loading,
	error: errorFallback,
	empty,
}: EntityListProps<TEntity>): ReactElement | null {
	const entityType = entity.$name

	// Phase 1: Collect JSX selection
	const { selection, queryKey } = useSelectionCollectionForList({
		entityType,
		filter,
		orderBy,
		limit,
		offset,
		children,
	})

	// Phase 2: Load data using unified hook
	const result = useEntityList(entity, {
		filter,
		orderBy,
		limit,
		offset,
		selection,
		queryKey,
	})

	// Render based on status
	if (result.status === 'loading') {
		return <>{loading ?? <DefaultLoading />}</>
	}

	if (result.status === 'error') {
		if (errorFallback) {
			return <>{errorFallback(result.error)}</>
		}
		return <DefaultError error={result.error} />
	}

	// Empty state
	if (result.items.length === 0) {
		return <>{empty ?? <DefaultEmpty entityType={entityType} />}</>
	}

	// Phase 3: Runtime render — items are already EntityAccessors from the hook
	const items = result.items.map((item, index) => {
		return (
			<React.Fragment key={item.id}>
				{children(item as unknown as EntityAccessor<TEntity>, index)}
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
