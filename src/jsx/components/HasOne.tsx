import React, { type ReactElement, type ReactNode } from 'react'
import type { HasOneProps, EntityRef, JsxSelectionFieldMeta, JsxSelectionMeta, SelectionProvider } from '../types.js'
import { FIELD_REF_META, BINDX_COMPONENT } from '../types.js'
import { createCollectorProxy } from '../proxy.js'
import { SelectionMetaCollector, mergeSelections } from '../SelectionMeta.js'

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
		data: null,
		isDirty: field.isDirty,
	}

	return <>{children(entityRef)}</>
}

// Static method for selection extraction
const hasOneWithSelection = HasOne as typeof HasOne & SelectionProvider & { [BINDX_COMPONENT]: true }

hasOneWithSelection.getSelection = (
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

hasOneWithSelection[BINDX_COMPONENT] = true

export { hasOneWithSelection as HasOneWithMeta }
