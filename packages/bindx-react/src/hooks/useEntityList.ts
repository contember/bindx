import type { EntityDef, SelectionInput } from '@contember/bindx'
import { useSchemaRegistry } from './BackendAdapterContext.js'
import { useEntityListImpl, type UseEntityListOptions, type EntityListAccessorResult } from './useEntityListImpl.js'
import { useStableSelectionMeta } from './useStableSelectionMeta.js'

/**
 * Hook to fetch and manage a list of entities with full type inference.
 *
 * Accepts an EntityDef reference instead of a string entity name,
 * providing full type safety without needing createBindx().
 *
 * The `definer` declares which fields will be fetched. Include all fields
 * you may access, even conditionally — see {@link useEntity} for details.
 *
 * @example
 * ```tsx
 * import { useEntityList } from '@contember/bindx-react'
 * import { schema } from './generated'
 *
 * function AuthorList() {
 *   const authors = useEntityList(schema.Author, {}, e => e.name().email())
 *   if (authors.status !== 'ready') return <Loading />
 *   return authors.items.map(a => <div key={a.id}>{a.name.value}</div>)
 * }
 * ```
 */
export function useEntityList<TEntity extends object, TResult extends object>(
	entity: EntityDef<TEntity>,
	options: UseEntityListOptions,
	definer: SelectionInput<TEntity, TResult>,
): EntityListAccessorResult<TResult> {
	const schemaRegistry = useSchemaRegistry()
	const selectionMeta = useStableSelectionMeta(definer)

	return useEntityListImpl<TResult>(
		entity.$name,
		options,
		selectionMeta,
		schemaRegistry,
	)
}
