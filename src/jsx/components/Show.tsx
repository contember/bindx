import React, { type ReactElement, type ReactNode } from 'react'
import type { FieldRef, JsxSelectionFieldMeta, JsxSelectionMeta, SelectionProvider } from '../types.js'
import { FIELD_REF_META, BINDX_COMPONENT } from '../types.js'

/**
 * Props for Show component
 */
export interface ShowProps<T> {
	field: FieldRef<T>
	children: (value: NonNullable<T>) => ReactNode
	fallback?: ReactNode
}

/**
 * Show component - renders content only if field has a value
 * Useful for nullable fields.
 *
 * @example
 * ```tsx
 * <Show field={article.fields.publishedAt}>
 *   {value => <time>{value.toISOString()}</time>}
 * </Show>
 *
 * <Show field={author.fields.bio} fallback={<span>No bio</span>}>
 *   {bio => <p>{bio}</p>}
 * </Show>
 * ```
 */
export function Show<T>({ field, children, fallback }: ShowProps<T>): ReactElement | null {
	if (field.value === null || field.value === undefined) {
		return fallback ? <>{fallback}</> : null
	}

	return <>{children(field.value as NonNullable<T>)}</>
}

// Static method for selection extraction
const showWithSelection = Show as typeof Show & SelectionProvider & { [BINDX_COMPONENT]: true }

showWithSelection.getSelection = (props: ShowProps<unknown>): JsxSelectionFieldMeta | null => {
	const meta = props.field[FIELD_REF_META]

	return {
		fieldName: meta.fieldName,
		path: meta.path,
		isArray: false,
		isRelation: false,
	}
}

showWithSelection[BINDX_COMPONENT] = true

export { showWithSelection as ShowWithMeta }
