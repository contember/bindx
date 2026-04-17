import React, { memo, type ReactElement, type ReactNode } from 'react'
import type { FieldRef, FieldAccessor, SelectionFieldMeta, SelectionMeta, SelectionProvider } from '../types.js'
import { FIELD_REF_META, BINDX_COMPONENT } from '../types.js'
import { useField } from '../../hooks/useField.js'

/**
 * Props for Show component
 */
export interface ShowProps<T> {
	field: FieldRef<T>
	children: ReactNode | ((value: NonNullable<T>) => ReactNode)
	fallback?: ReactNode
}

/**
 * Show component - renders content only if field has a value
 * Useful for nullable fields.
 *
 * @example
 * ```tsx
 * // Plain children - use when field value isn't needed
 * <Show field={article.publishedAt}>
 *   <PublishedBadge />
 * </Show>
 *
 * // Callback children - receive non-null field value
 * <Show field={article.publishedAt}>
 *   {value => <time>{value.toISOString()}</time>}
 * </Show>
 *
 * <Show field={author.bio} fallback={<span>No bio</span>}>
 *   {bio => <p>{bio}</p>}
 * </Show>
 * ```
 */
function ShowImpl<T>({ field, children, fallback }: ShowProps<T>): ReactElement | null {
	// useField() subscribes to store and returns FieldAccessor with .value access
	const accessor = useField(field)

	if (accessor.value === null || accessor.value === undefined) {
		return fallback ? <>{fallback}</> : null
	}

	const rendered = typeof children === 'function'
		? children(accessor.value as NonNullable<T>)
		: children

	return <>{rendered}</>
}

export const Show = memo(ShowImpl) as typeof ShowImpl

// Static method for selection extraction
const showWithSelection = Show as typeof Show & SelectionProvider & { [BINDX_COMPONENT]: true }

showWithSelection.getSelection = (
	props: ShowProps<unknown>,
	collectNested: (children: ReactNode) => SelectionMeta,
): SelectionFieldMeta[] | null => {
	const meta = props.field[FIELD_REF_META]
	const result: SelectionFieldMeta[] = [{
		fieldName: meta.fieldName,
		alias: meta.fieldName,
		path: meta.path,
		isArray: false,
		isRelation: false,
	}]

	// Plain ReactNode children may contain nested <Field>/<HasOne>/etc.
	// Callback children can't be analyzed statically (skipped).
	if (typeof props.children !== 'function') {
		const nested = collectNested(props.children)
		for (const field of nested.fields.values()) {
			result.push(field)
		}
	}

	return result
}

showWithSelection[BINDX_COMPONENT] = true

export { showWithSelection as ShowWithMeta }
