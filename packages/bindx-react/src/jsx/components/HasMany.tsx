import React, { memo, type ReactElement, type ReactNode } from 'react'
import type { HasManyProps, SelectionFieldMeta, SelectionMeta, SelectionProvider, AnyBrand } from '../types.js'
import { FIELD_REF_META, BINDX_COMPONENT, SCOPE_REF, HAS_MANY_PARAMS_COLLECTOR, type HasManyParamsCollector } from '../types.js'
import { mergeSelections } from '../SelectionMeta.js'
import {
	SelectionScope,
	generateHasManyAlias,
	HAS_MANY_ALIAS_RESOLVER,
	type HasManyAccessor,
	type HasManyAliasResolver,
	type HasManyParams,
	type HasManyRef,
} from '@contember/bindx'
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
	// With parameters the data was fetched under the params alias (see getSelection); the
	// field the children received reads the plain relation, so switch to that alias.
	const fieldName = field[FIELD_REF_META].fieldName
	const alias = generateHasManyAlias(fieldName, { filter, orderBy, limit, offset })
	const resolveAlias = (field as unknown as { [HAS_MANY_ALIAS_RESOLVER]?: HasManyAliasResolver })[HAS_MANY_ALIAS_RESOLVER]
	const listRef = alias !== fieldName && resolveAlias
		? resolveAlias(alias) as unknown as HasManyRef<TEntity, TSelected, TBrand, TEntityName, TSchema>
		: field

	// useHasMany() subscribes to store and returns HasManyAccessor with .map()/.items/.length
	const accessor = useHasMany(listRef)
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
): SelectionFieldMeta => {
	const meta = props.field[FIELD_REF_META]
	// During collection, field is a collector proxy with all accessor properties
	const fullField = props.field as unknown as HasManyAccessor<unknown>

	const result: { syntheticChildren: ReactNode; childScope: SelectionScope | null } = {
		syntheticChildren: null,
		childScope: null,
	}

	// With parameters the children are collected into the parent scope's child for the
	// params alias. Collecting through `field.map()` would write them into the plain
	// relation, so a filtered or paginated list would fetch the whole relation as well.
	// Without parameters the plain relation is this field's own place, and `map()` uses it.
	const params = { filter: props.filter, orderBy: props.orderBy, limit: props.limit, offset: props.offset }
	const hasParams = params.filter !== undefined || params.orderBy !== undefined || params.limit !== undefined || params.offset !== undefined
	const collectWithParams = (props.field as unknown as { [HAS_MANY_PARAMS_COLLECTOR]?: (params: HasManyParams) => HasManyParamsCollector })[
		HAS_MANY_PARAMS_COLLECTOR
	]
	if (hasParams && collectWithParams) {
		const { item, scope } = collectWithParams(params)
		result.childScope = scope
		result.syntheticChildren = props.children(item, 0)
	} else {
		// A field without a detached collector (not a collector proxy): its map() still
		// yields a collector item that knows the target entity.
		fullField.map((item, index) => {
			const scopeRef = (item as unknown as Record<symbol, unknown>)[SCOPE_REF]
			if (scopeRef instanceof SelectionScope) {
				result.childScope = scopeRef
			}
			result.syntheticChildren = props.children(item, index)
			return null
		})
	}

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
