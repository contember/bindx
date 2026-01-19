import React, { memo, type ReactElement, type ReactNode } from 'react'
import type { FieldRef, SelectionFieldMeta, SelectionMeta, SelectionProvider } from '../types.js'
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
function ShowImpl<T>({ field, children, fallback }: ShowProps<T>): ReactElement | null {
	if (field.value === null || field.value === undefined) {
		return fallback ? <>{fallback}</> : null
	}

	return <>{children(field.value as NonNullable<T>)}</>
}

export const Show = memo(ShowImpl) as typeof ShowImpl

// Static method for selection extraction
const showWithSelection = Show as typeof Show & SelectionProvider & { [BINDX_COMPONENT]: true }

showWithSelection.getSelection = (props: ShowProps<unknown>): SelectionFieldMeta | null => {
	const meta = props.field[FIELD_REF_META]

	return {
		fieldName: meta.fieldName,
		alias: meta.fieldName,
		path: meta.path,
		isArray: false,
		isRelation: false,
	}
}

showWithSelection[BINDX_COMPONENT] = true

export { showWithSelection as ShowWithMeta }
