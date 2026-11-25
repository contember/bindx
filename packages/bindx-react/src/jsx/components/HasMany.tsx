import React, { memo, type ReactElement, type ReactNode } from 'react'
import type { HasManyProps, SelectionFieldMeta, SelectionMeta, SelectionProvider, AnyBrand } from '../types.js'
import { FIELD_REF_META, BINDX_COMPONENT } from '../types.js'
import { collectionScopeOf } from '../collectorProxy.js'
import { generateHasManyAlias, type HasManyAccessor, type HasManyParams } from '@contember/bindx'
import { useHasMany } from '../../hooks/useHasMany.js'
import { annotateElement } from '../devAnnotations.js'

/**
 * HasMany component - renders a has-many relation
 *
 * @example
 * ```tsx
 * // Basic usage
 * <HasMany field={author.fields.articles}>
 *   {article => (
 *     <div>
 *       <Field field={article.fields.title} />
 *     </div>
 *   )}
 * </HasMany>
 *
 * // With query parameters
 * <HasMany field={author.fields.articles} limit={5} orderBy={{ publishedAt: 'desc' }}>
 *   {(article, index) => (
 *     <div key={article.id}>
 *       {index + 1}. <Field field={article.fields.title} />
 *     </div>
 *   )}
 * </HasMany>
 * ```
 */
function HasManyImpl<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
>({ field, children, filter, orderBy, limit, offset }: HasManyProps<TEntity, TSelected, TBrand, TEntityName, TSchema>): ReactElement {
	// useHasMany() subscribes to store and returns HasManyAccessor with .map()/.items/.length
	// The parent may select this field under several param aliases; render the one these params select.
	const accessor = useHasMany(field.withParams({ filter, orderBy, limit, offset }))
	const targetType = field[FIELD_REF_META]?.targetType

	const items = accessor.map((item, index) => {
		const result = children(item, index)
		return <React.Fragment key={item.id}>{
			annotateElement(result, {
				'data-entity': targetType ?? '',
				'data-entity-id': item.id,
			})
		}</React.Fragment>
	})

	return <>{items}</>
}

export const HasMany = memo(HasManyImpl) as typeof HasManyImpl

// Static method for selection extraction
const hasManyWithSelection = HasMany as typeof HasMany & SelectionProvider & { [BINDX_COMPONENT]: true }

hasManyWithSelection.getSelection = (
	props: HasManyProps<unknown>,
	collectNested: (children: ReactNode) => SelectionMeta,
): SelectionFieldMeta | null => {
	const hasManyParams: HasManyParams = {
		filter: props.filter,
		orderBy: props.orderBy,
		limit: props.limit,
		offset: props.offset,
	}
	// During collection, field is a collector proxy with all accessor properties
	const relation = props.field.withParams(hasManyParams) as unknown as HasManyAccessor<unknown>
	let nestedSelection: SelectionMeta = { fields: new Map() }
	relation.map((item, index) => {
		nestedSelection = collectNested(props.children(item, index))
		return null
	})

	// A collector ref's path is relative to its own entity: record into the relation's scope
	// on that entity (under the alias of the params), not as a field of the selection root.
	const relationScope = collectionScopeOf(relation)
	if (relationScope !== null) {
		relationScope.mergeFromSelectionMeta(nestedSelection)
		return null
	}

	const meta = props.field[FIELD_REF_META]
	return {
		fieldName: meta.fieldName,
		alias: generateHasManyAlias(meta.fieldName, hasManyParams),
		path: meta.path,
		isArray: true,
		isRelation: true,
		nested: nestedSelection,
		hasManyParams,
	}
}

hasManyWithSelection[BINDX_COMPONENT] = true

export { hasManyWithSelection as HasManyWithMeta }
