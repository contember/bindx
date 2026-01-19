import { useMemo, type ReactNode } from 'react'
import { FIELD_REF_META, type FieldRefMeta } from '@contember/bindx'
import { FormFieldStateProvider } from './FormFieldStateProvider.js'
import type { FormFieldScopeProps } from '../types.js'

/**
 * Wraps a field with FormFieldState context.
 *
 * @example
 * ```tsx
 * <Entity name="Article" by={{ id }}>
 *   {entity => (
 *     <FormFieldScope field={entity.fields.title}>
 *       <FormLabel><label>Title</label></FormLabel>
 *       <FormInput field={entity.fields.title}>
 *         <input />
 *       </FormInput>
 *       <FormError formatter={e => e.map(err => err.message)}>
 *         <span className="error" />
 *       </FormError>
 *     </FormFieldScope>
 *   )}
 * </Entity>
 * ```
 */
export function FormFieldScope<T>({
	field,
	children,
	required,
}: FormFieldScopeProps<T>): ReactNode {
	// Get metadata from the field handle
	const meta = field[FIELD_REF_META] as FieldRefMeta | undefined

	const entityName = meta?.entityType ?? 'unknown'
	const fieldName = meta?.fieldName ?? 'unknown'

	const fieldInfo = useMemo(
		() => ({
			entityName,
			fieldName,
			enumName: undefined, // TODO: get from schema if needed
		}),
		[entityName, fieldName],
	)

	// Determine required from props or default to false
	// TODO: Could get nullable from SchemaRegistry if needed
	const isRequired = required ?? false

	return (
		<FormFieldStateProvider
			errors={field.errors}
			required={isRequired}
			dirty={field.isDirty}
			field={fieldInfo}
		>
			{children}
		</FormFieldStateProvider>
	)
}
