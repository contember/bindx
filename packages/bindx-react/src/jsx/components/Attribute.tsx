import { cloneElement, isValidElement, memo, type ReactElement, type ReactNode } from 'react'
import type { FieldAccessor, FieldRef, SelectionFieldMeta, SelectionMeta, AnyBrand } from '../types.js'
import { FIELD_REF_META, BINDX_COMPONENT } from '../types.js'
import type { SelectionProvider } from '../types.js'
import { useField } from '../../hooks/useField.js'
import { isDevAnnotationsEnabled } from '../devAnnotations.js'
import { fieldRefSelection } from '../fieldRefSelection.js'

/**
 * Props for Attribute component.
 */
export interface AttributeProps<T> {
	/** The field to subscribe to */
	field: FieldRef<T>
	/** Maps the field accessor to props that get spread onto the child element */
	format: (accessor: FieldAccessor<T>) => Record<string, unknown>
	/** Single child element — receives the formatted props via cloneElement */
	children: ReactElement
}

/**
 * Attribute component — applies field-derived props to a child element.
 *
 * Like `<Field>` but for attributes (style, className, data-*) instead of text content.
 * Subscribes to the field, calls `format` to produce props, and clones the child with merged props.
 * During selection collection, both the field and children's fields are tracked.
 *
 * @example
 * ```tsx
 * <Attribute field={tag.color} format={color => ({ style: { backgroundColor: color.value ?? '#666' } })}>
 *   <span>
 *     <Field field={tag.name} />
 *   </span>
 * </Attribute>
 * ```
 */
function AttributeImpl<T>({ field, format, children }: AttributeProps<T>): ReactElement | null {
	const accessor = useField(field ?? null)
	if (accessor === null) {
		return children
	}

	const extraProps = {
		...format(accessor),
		...(isDevAnnotationsEnabled() ? { 'data-field': field[FIELD_REF_META]?.fieldName } : {}),
	}

	if (!isValidElement(children)) {
		return children
	}

	return cloneElement(children, extraProps)
}

export const Attribute = memo(AttributeImpl) as typeof AttributeImpl

// Static method for selection extraction
const attributeWithSelection = Attribute as typeof Attribute & SelectionProvider & { [BINDX_COMPONENT]: true }

attributeWithSelection.getSelection = (
	props: AttributeProps<unknown>,
	collectNested: (children: ReactNode) => SelectionMeta,
): SelectionFieldMeta | null => {
	const selection = fieldRefSelection(props.field)
	if (selection === null) {
		// Nested components still record their fields through the collector proxy.
		collectNested(props.children)
	}
	return selection
}

attributeWithSelection[BINDX_COMPONENT] = true

export { attributeWithSelection as AttributeWithMeta }
