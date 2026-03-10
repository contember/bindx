import type { EntityDef, SelectionInput } from '@contember/bindx'
import { useSchemaRegistry } from './BackendAdapterContext.js'
import { useEntityImpl, type UseEntityOptions, type EntityAccessorResult } from './useEntityImpl.js'
import { useStableSelectionMeta } from './useStableSelectionMeta.js'

/**
 * Hook to fetch and manage a single entity with full type inference.
 *
 * Accepts an EntityDef reference instead of a string entity name,
 * providing full type safety without needing createBindx().
 *
 * The `definer` declares which fields will be fetched from the backend.
 * Only fields included in the definer are available — fields accessed
 * conditionally must still be declared upfront:
 *
 * @example
 * ```tsx
 * import { useEntity } from '@contember/bindx-react'
 * import { schema } from './generated'
 *
 * function ArticleEditor({ id }: { id: string }) {
 *   const article = useEntity(schema.Article, { by: { id } }, e => e.title().content())
 *   if (article.status !== 'ready') return <Loading />
 *   return <input value={article.title.value} onChange={...} />
 * }
 * ```
 */
export function useEntity<TEntity extends object, TResult extends object>(
	entity: EntityDef<TEntity>,
	options: UseEntityOptions,
	definer: SelectionInput<TEntity, TResult>,
): EntityAccessorResult<TEntity, TResult> {
	const schemaRegistry = useSchemaRegistry()
	const selectionMeta = useStableSelectionMeta(definer)

	return useEntityImpl<TEntity, TResult>(
		entity.$name,
		options,
		selectionMeta,
		schemaRegistry,
	)
}
