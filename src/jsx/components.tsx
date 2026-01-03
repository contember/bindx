import React, { type ReactNode, type ReactElement } from 'react'
import type {
	FieldProps,
	HasManyProps,
	HasOneProps,
	IfProps,
	FieldRef,
	HasManyRef,
	HasOneRef,
	EntityRef,
	JsxSelectionFieldMeta,
	JsxSelectionMeta,
	SelectionProvider,
} from './types.js'
import { FIELD_REF_META, BINDX_COMPONENT } from './types.js'
import { createCollectorProxy } from './proxy.js'
import { SelectionMetaCollector, mergeSelections, createEmptySelection } from './SelectionMeta.js'

// ==================== Field Component ====================

/**
 * Field component - renders a scalar field value
 *
 * @example
 * ```tsx
 * <Field field={entity.fields.name} />
 * <Field field={entity.fields.email}>
 *   {field => <a href={`mailto:${field.value}`}>{field.value}</a>}
 * </Field>
 * <Field field={entity.fields.date} format={d => d?.toLocaleDateString()} />
 * ```
 */
export function Field<T>({ field, children, format }: FieldProps<T>): ReactElement | null {
	if (children) {
		return <>{children(field)}</>
	}

	if (format) {
		return <>{format(field.value)}</>
	}

	// Default: render value as string
	if (field.value === null || field.value === undefined) {
		return null
	}

	return <>{String(field.value)}</>
}

// Static method for selection extraction
;(Field as unknown as SelectionProvider).getSelection = (
	props: FieldProps<unknown>,
): JsxSelectionFieldMeta => {
	const meta = props.field[FIELD_REF_META]
	return {
		fieldName: meta.fieldName,
		path: meta.path,
		isArray: false,
		isRelation: false,
	}
}

// Mark as bindx component
;(Field as unknown as { [BINDX_COMPONENT]: true })[BINDX_COMPONENT] = true

// ==================== HasMany Component ====================

/**
 * HasMany component - renders a has-many relation
 *
 * @example
 * ```tsx
 * <HasMany field={author.fields.articles}>
 *   {article => (
 *     <div>
 *       <Field field={article.fields.title} />
 *     </div>
 *   )}
 * </HasMany>
 *
 * <HasMany field={author.fields.articles} limit={5} orderBy={{ publishedAt: 'desc' }}>
 *   {(article, index) => (
 *     <div key={article.id}>
 *       {index + 1}. <Field field={article.fields.title} />
 *     </div>
 *   )}
 * </HasMany>
 * ```
 */
export function HasMany<T>({
	field,
	children,
}: HasManyProps<T>): ReactElement {
	// Runtime: iterate over real data using map
	const items = field.map((item, index) => {
		return <React.Fragment key={item.id}>{children(item, index)}</React.Fragment>
	})

	return <>{items}</>
}

// Static method for selection extraction
;(HasMany as unknown as SelectionProvider).getSelection = (
	props: HasManyProps<unknown>,
	collectNested: (children: ReactNode) => JsxSelectionMeta,
): JsxSelectionFieldMeta => {
	const meta = props.field[FIELD_REF_META]

	// Create nested selection by calling children with collector
	const nestedSelection = new SelectionMetaCollector()
	const nestedCollector = createCollectorProxy<unknown>(nestedSelection)

	// Call children once to gather nested field access
	const syntheticChildren = props.children(nestedCollector, 0)

	// Also analyze the JSX structure
	const jsxSelection = collectNested(syntheticChildren)
	mergeSelections(nestedSelection, jsxSelection)

	return {
		fieldName: meta.fieldName,
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

// Mark as bindx component
;(HasMany as unknown as { [BINDX_COMPONENT]: true })[BINDX_COMPONENT] = true

// ==================== HasOne Component ====================

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
export function HasOne<T>({ field, children }: HasOneProps<T>): ReactElement | null {
	// If disconnected, don't render
	if (field.id === null) {
		return null
	}

	// Create entity ref from has-one ref
	const entityRef: EntityRef<T> = {
		id: field.id,
		fields: field.fields,
		data: null, // Data access through fields
		isDirty: field.isDirty,
	}

	return <>{children(entityRef)}</>
}

// Static method for selection extraction
;(HasOne as unknown as SelectionProvider).getSelection = (
	props: HasOneProps<unknown>,
	collectNested: (children: ReactNode) => JsxSelectionMeta,
): JsxSelectionFieldMeta => {
	const meta = props.field[FIELD_REF_META]

	// Create nested selection by calling children with collector
	const nestedSelection = new SelectionMetaCollector()
	const nestedCollector = createCollectorProxy<unknown>(nestedSelection)

	// Call children once to gather nested field access
	const entityRef: EntityRef<unknown> = {
		id: '__collector__',
		fields: nestedCollector.fields,
		data: null,
		isDirty: false,
	}
	const syntheticChildren = props.children(entityRef)

	// Also analyze the JSX structure
	const jsxSelection = collectNested(syntheticChildren)
	mergeSelections(nestedSelection, jsxSelection)

	return {
		fieldName: meta.fieldName,
		path: meta.path,
		isArray: false,
		isRelation: true,
		nested: nestedSelection,
	}
}

// Mark as bindx component
;(HasOne as unknown as { [BINDX_COMPONENT]: true })[BINDX_COMPONENT] = true

// ==================== If Component ====================

/**
 * If component - conditional rendering that ensures both branches are analyzed
 *
 * @example
 * ```tsx
 * <If condition={showBio} then={
 *   <Field field={author.fields.bio} />
 * } />
 *
 * <If
 *   condition={author.fields.isPublished}
 *   then={<Field field={author.fields.publishedAt} />}
 *   else={<span>Draft</span>}
 * />
 * ```
 */
export function If({ condition, then: thenBranch, else: elseBranch }: IfProps): ReactElement | null {
	// Resolve condition value
	const conditionValue = typeof condition === 'boolean'
		? condition
		: condition.value

	return conditionValue ? <>{thenBranch}</> : <>{elseBranch ?? null}</>
}

// Static method for selection extraction - analyzes BOTH branches
;(If as unknown as SelectionProvider).getSelection = (
	props: IfProps,
	collectNested: (children: ReactNode) => JsxSelectionMeta,
): JsxSelectionFieldMeta[] | null => {
	const thenSelection = collectNested(props.then)
	const elseSelection = props.else ? collectNested(props.else) : createEmptySelection()

	// Merge both selections - we need fields from both branches
	mergeSelections(thenSelection, elseSelection)

	// Return all fields from merged selection
	const result: JsxSelectionFieldMeta[] = []
	for (const field of thenSelection.fields.values()) {
		result.push(field)
	}

	// If condition is a FieldRef, also add that field
	if (typeof props.condition !== 'boolean') {
		const meta = props.condition[FIELD_REF_META]
		result.push({
			fieldName: meta.fieldName,
			path: meta.path,
			isArray: false,
			isRelation: false,
		})
	}

	return result.length > 0 ? result : null
}

// Mark as bindx component
;(If as unknown as { [BINDX_COMPONENT]: true })[BINDX_COMPONENT] = true

// ==================== Show Component ====================

/**
 * Show component - renders content only if field has a value
 * Useful for nullable fields
 *
 * @example
 * ```tsx
 * <Show field={article.fields.publishedAt}>
 *   {value => <time>{value.toISOString()}</time>}
 * </Show>
 * ```
 */
export interface ShowProps<T> {
	field: FieldRef<T>
	children: (value: NonNullable<T>) => ReactNode
	fallback?: ReactNode
}

export function Show<T>({ field, children, fallback }: ShowProps<T>): ReactElement | null {
	if (field.value === null || field.value === undefined) {
		return fallback ? <>{fallback}</> : null
	}

	return <>{children(field.value as NonNullable<T>)}</>
}

// Static method for selection extraction
;(Show as unknown as SelectionProvider).getSelection = (
	props: ShowProps<unknown>,
	collectNested: (children: ReactNode) => JsxSelectionMeta,
): JsxSelectionFieldMeta | null => {
	const meta = props.field[FIELD_REF_META]

	return {
		fieldName: meta.fieldName,
		path: meta.path,
		isArray: false,
		isRelation: false,
	}
}

// Mark as bindx component
;(Show as unknown as { [BINDX_COMPONENT]: true })[BINDX_COMPONENT] = true
