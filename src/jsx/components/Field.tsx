import React, { type ReactElement } from 'react'
import type { FieldRef, FieldProps, JsxSelectionFieldMeta, SelectionProvider } from '../types.js'
import { FIELD_REF_META, BINDX_COMPONENT } from '../types.js'

/**
 * Field component - renders a scalar field value
 *
 * @example
 * ```tsx
 * // Basic usage - renders value as string
 * <Field field={entity.fields.name} />
 *
 * // With custom render function
 * <Field field={entity.fields.email}>
 *   {field => <a href={`mailto:${field.value}`}>{field.value}</a>}
 * </Field>
 *
 * // With format function
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
const fieldWithSelection = Field as typeof Field & SelectionProvider & { [BINDX_COMPONENT]: true }

fieldWithSelection.getSelection = (props: FieldProps<unknown>): JsxSelectionFieldMeta => {
	const meta = props.field[FIELD_REF_META]
	return {
		fieldName: meta.fieldName,
		path: meta.path,
		isArray: false,
		isRelation: false,
	}
}

fieldWithSelection[BINDX_COMPONENT] = true

export { fieldWithSelection as FieldWithMeta }
