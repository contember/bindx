import React, { memo, type ReactElement, type ReactNode } from 'react'
import type { HasManyProps, SelectionFieldMeta, SelectionMeta, SelectionProvider, EntityRef, AnyBrand, HasManyRef } from '../types.js'
import { FIELD_REF_META, BINDX_COMPONENT, SCOPE_REF } from '../types.js'
import { mergeSelections } from '../SelectionMeta.js'
import { SelectionScope, generateHasManyAlias } from '@contember/bindx'

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
>({ field, children }: HasManyProps<TEntity, TSelected, TBrand, TEntityName, TSchema>): ReactElement {
	// At runtime, field is always a full HasManyRef (proxy provides all properties)
	// Props accept HasManyRefBase for type compatibility with both implicit and explicit modes
	const fullField = field as HasManyRef<TEntity, TSelected, TBrand, TEntityName, TSchema>
	const items = fullField.map((item, index) => {
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
	// At runtime, field is always a full HasManyRef (proxy provides all properties)
	const fullField = props.field as HasManyRef<unknown>

	// Use field's map function to get a properly configured collector with schema info
	// The map() creates a collector that knows about entity types and relations
	const result: { syntheticChildren: ReactNode; childScope: SelectionScope | null } = {
		syntheticChildren: null,
		childScope: null,
	}

	fullField.map((item, index) => {
		// Get the scope from the collector entity (it has SCOPE_REF)
		const scopeRef = (item as unknown as Record<symbol, unknown>)[SCOPE_REF]
		if (scopeRef instanceof SelectionScope) {
			result.childScope = scopeRef
		}
		result.syntheticChildren = props.children(item, index)
		return null
	})

	// Also analyze the JSX structure
	const jsxSelection = result.syntheticChildren ? collectNested(result.syntheticChildren) : { fields: new Map() }

	// Convert scope to SelectionMeta and merge with JSX selection
	const nestedSelection = result.childScope ? result.childScope.toSelectionMeta() : { fields: new Map() }
	mergeSelections(nestedSelection, jsxSelection)

	// Build hasManyParams object
	const hasManyParams = {
		filter: props.filter,
		orderBy: props.orderBy,
		limit: props.limit,
		offset: props.offset,
	}

	// Generate alias based on params if any are provided
	const alias = generateHasManyAlias(meta.fieldName, hasManyParams)

	return {
		fieldName: meta.fieldName,
		alias,
		path: meta.path,
		isArray: true,
		isRelation: true,
		nested: nestedSelection,
		hasManyParams,
	}
}

hasManyWithSelection[BINDX_COMPONENT] = true

export { hasManyWithSelection as HasManyWithMeta }
