import React, { memo, type ReactElement, type ReactNode } from 'react'
import type { HasOneProps, SelectionFieldMeta, SelectionMeta, SelectionProvider, AnyBrand, HasOneRef } from '../types.js'
import { FIELD_REF_META, BINDX_COMPONENT, SCOPE_REF } from '../types.js'
import { mergeSelections } from '../SelectionMeta.js'
import { SelectionScope } from '@contember/bindx'

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
	// At runtime, field is always a full HasOneRef (proxy provides all properties)
	// Props accept HasOneRefBase for type compatibility with both implicit and explicit modes
	const fullField = field as HasOneRef<TEntity, TSelected, TBrand, TEntityName, TSchema>
	// Get the related entity reference (always available, may be placeholder with id=null)
	return <>{children(fullField.$entity)}</>
}

export const HasOne = memo(HasOneImpl) as typeof HasOneImpl

// Static method for selection extraction
const hasOneWithSelection = HasOne as typeof HasOne & SelectionProvider & { [BINDX_COMPONENT]: true }

hasOneWithSelection.getSelection = (
	props: HasOneProps<unknown>,
	collectNested: (children: ReactNode) => SelectionMeta,
): SelectionFieldMeta => {
	const meta = props.field[FIELD_REF_META]
	// At runtime, field is always a full HasOneRef (proxy provides all properties)
	const fullField = props.field as HasOneRef<unknown>

	// Use field's $entity which has a properly configured scope with schema info
	const nestedCollector = fullField.$entity

	// Get the scope from the collector entity (it has SCOPE_REF)
	const scopeRef = (nestedCollector as unknown as Record<symbol, unknown>)[SCOPE_REF]
	const childScope = scopeRef instanceof SelectionScope ? scopeRef : null

	// Call children once to gather nested field access
	const syntheticChildren = props.children(nestedCollector)

	// Also analyze the JSX structure
	const jsxSelection = collectNested(syntheticChildren)

	// Convert scope to SelectionMeta and merge with JSX selection
	const nestedSelection = childScope ? childScope.toSelectionMeta() : { fields: new Map() }
	mergeSelections(nestedSelection, jsxSelection)

	return {
		fieldName: meta.fieldName,
		alias: meta.fieldName,
		path: meta.path,
		isArray: false,
		isRelation: true,
		nested: nestedSelection,
	}
}

hasOneWithSelection[BINDX_COMPONENT] = true

export { hasOneWithSelection as HasOneWithMeta }
