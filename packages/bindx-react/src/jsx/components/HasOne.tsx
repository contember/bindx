import React, { memo, type ReactElement, type ReactNode } from 'react'
import type { HasOneProps, SelectionFieldMeta, SelectionMeta, SelectionProvider, AnyBrand } from '../types.js'
import { FIELD_REF_META, BINDX_COMPONENT } from '../types.js'
import { collectionScopeOf } from '../collectorProxy.js'
import type { HasOneAccessor } from '@contember/bindx'
import { useHasOne } from '../../hooks/useHasOne.js'
import { annotateElement } from '../devAnnotations.js'

/**
 * HasOne component - renders a has-one relation
 *
 * @example
 * ```tsx
 * <HasOne field={article.fields.author}>
 *   {author => (
 *     <div>
 *       <Field field={author.fields.name} />
 *       <Field field={author.fields.email} />
 *     </div>
 *   )}
 * </HasOne>
 * ```
 */
function HasOneImpl<
	TEntity,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
>({ field, children }: HasOneProps<TEntity, TSelected, TBrand, TEntityName, TSchema>): ReactElement {
	// useHasOne() subscribes to store and returns HasOneAccessor with .$entity
	const accessor = useHasOne(field)
	const relationName = field[FIELD_REF_META]?.fieldName

	// Get the related entity reference (always available, may be placeholder with id=null)
	const result = children(accessor.$entity)
	return <>{annotateElement(result, { 'data-relation': relationName ?? '' })}</>
}

export const HasOne = memo(HasOneImpl) as typeof HasOneImpl

// Static method for selection extraction
const hasOneWithSelection = HasOne as typeof HasOne & SelectionProvider & { [BINDX_COMPONENT]: true }

hasOneWithSelection.getSelection = (
	props: HasOneProps<unknown>,
	collectNested: (children: ReactNode) => SelectionMeta,
): SelectionFieldMeta | null => {
	// During collection, field is a collector proxy with all accessor properties
	const fullField = props.field as unknown as HasOneAccessor<unknown>
	const relatedEntity = fullField.$entity
	const jsxSelection = collectNested(props.children(relatedEntity))

	// A collector ref's path is relative to its own entity: record into the relation's
	// scope on that entity, not as a field of the selection root.
	const relationScope = collectionScopeOf(relatedEntity)
	if (relationScope !== null) {
		relationScope.mergeFromSelectionMeta(jsxSelection)
		return null
	}

	const meta = props.field[FIELD_REF_META]
	return {
		fieldName: meta.fieldName,
		alias: meta.fieldName,
		path: meta.path,
		isArray: false,
		isRelation: true,
		nested: jsxSelection,
	}
}

hasOneWithSelection[BINDX_COMPONENT] = true

export { hasOneWithSelection as HasOneWithMeta }
