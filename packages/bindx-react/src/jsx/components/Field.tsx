import { memo, type ReactElement } from 'react'
import type { FieldProps, SelectionFieldMeta, SelectionProvider } from '../types.js'
import { FIELD_REF_META, BINDX_COMPONENT } from '../types.js'
import { useField } from '../../hooks/useField.js'
import { annotateElement, isDevAnnotationsEnabled } from '../devAnnotations.js'

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
function FieldImpl<T>({ field, children, format }: FieldProps<T>): ReactElement | null {
	const accessor = useField(field ?? null)
	if (accessor === null) {
		return null
	}

	const fieldName = field[FIELD_REF_META]?.fieldName

	if (children) {
		const result = children(accessor)
		return <>{annotateElement(result, { 'data-field': fieldName })}</>
	}

	if (format) {
		const content = format(accessor.value)
		return isDevAnnotationsEnabled() && fieldName
			? <span data-field={fieldName}>{content}</span>
			: <>{content}</>
	}

	// Default: render value as string
	if (accessor.value === null || accessor.value === undefined) {
		return null
	}

	return isDevAnnotationsEnabled() && fieldName
		? <span data-field={fieldName}>{String(accessor.value)}</span>
		: <>{String(accessor.value)}</>
}

export const Field = memo(FieldImpl) as typeof FieldImpl

// Static method for selection extraction
const fieldWithSelection = Field as typeof Field & SelectionProvider & { [BINDX_COMPONENT]: true }

fieldWithSelection.getSelection = (props: FieldProps<unknown>): SelectionFieldMeta | null => {
	// Handle undefined field (e.g., when accessing field on disconnected has-one relation)
	if (props.field === undefined || props.field === null) {
		return null
	}
	const meta = props.field[FIELD_REF_META]
	if (!meta) {
		return null
	}
	// During collection phase, field accesses are already tracked in the scope tree via proxy.
	// Field.getSelection should not duplicate them as flat entries which causes incorrect queries.
	// Collection-phase refs have empty entityId.
	if (meta.entityId === '') {
		return null
	}
	return {
		fieldName: meta.fieldName,
		alias: meta.fieldName,
		path: meta.path,
		isArray: false,
		isRelation: false,
	}
}

fieldWithSelection[BINDX_COMPONENT] = true

export { fieldWithSelection as FieldWithMeta }
