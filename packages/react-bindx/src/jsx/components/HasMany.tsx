import React, { memo, type ReactElement, type ReactNode } from 'react'
import type { HasManyProps, SelectionFieldMeta, SelectionMeta, SelectionProvider, EntityRef, AnyBrand } from '../types.js'
import { FIELD_REF_META, BINDX_COMPONENT } from '../types.js'
import { createCollectorProxy } from '../proxy.js'
import { mergeSelections } from '../SelectionMeta.js'
import { SelectionScope } from '@contember/bindx'

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
	TAvailableRoles extends readonly string[] = readonly string[],
	TSchema extends Record<string, object> = Record<string, object>,
>({ field, children }: HasManyProps<TEntity, TSelected, TBrand, TEntityName, TAvailableRoles, TSchema>): ReactElement {
	const items = field.map((item, index) => {
		return <React.Fragment key={item.id}>{children(item, index)}</React.Fragment>
	})

	return <>{items}</>
}

export const HasMany = memo(HasManyImpl) as typeof HasManyImpl

// Static method for selection extraction
const hasManyWithSelection = HasMany as typeof HasMany & SelectionProvider & { [BINDX_COMPONENT]: true }

hasManyWithSelection.getSelection = (
	props: HasManyProps<unknown>,
	collectNested: (children: ReactNode) => SelectionMeta,
): SelectionFieldMeta => {
	const meta = props.field[FIELD_REF_META]

	// Create nested selection by calling children with collector using SelectionScope
	const scope = new SelectionScope()
	const nestedCollector = createCollectorProxy<unknown>(scope)

	// Call children once to gather nested field access
	const syntheticChildren = props.children(nestedCollector, 0)

	// Also analyze the JSX structure
	const jsxSelection = collectNested(syntheticChildren)

	// Convert scope to SelectionMeta and merge with JSX selection
	const nestedSelection = scope.toSelectionMeta()
	mergeSelections(nestedSelection, jsxSelection)

	return {
		fieldName: meta.fieldName,
		alias: meta.fieldName,
		path: meta.path,
		isArray: true,
		isRelation: true,
		nested: nestedSelection,
		hasManyParams: {
			filter: props.filter,
			orderBy: props.orderBy,
			limit: props.limit,
			offset: props.offset,
		},
	}
}

hasManyWithSelection[BINDX_COMPONENT] = true

export { hasManyWithSelection as HasManyWithMeta }
