import type { ReactElement } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { useRequiredFormFieldState } from '../contexts.js'
import type { FormLabelProps } from '../types.js'

/**
 * Helper to set data attribute only when true
 */
function dataAttribute(value: boolean): '' | undefined {
	return value ? '' : undefined
}

/**
 * Auto-links a label to the field input via htmlFor.
 *
 * @example
 * ```tsx
 * <FormFieldScope field={entity.fields.title}>
 *   <FormLabel>
 *     <label>Title</label>
 *   </FormLabel>
 *   <FormInput field={entity.fields.title}>
 *     <input />
 *   </FormInput>
 * </FormFieldScope>
 * ```
 *
 * Features:
 * - Automatically sets htmlFor to match input id
 * - Sets data-invalid, data-dirty, data-required attributes
 *
 * @throws Error if used outside FormFieldScope
 */
export function FormLabel({ children }: FormLabelProps): ReactElement {
	const { errors, htmlId, dirty, required } = useRequiredFormFieldState()

	return (
		<Slot
			data-invalid={dataAttribute(errors.length > 0)}
			data-dirty={dataAttribute(dirty)}
			data-required={dataAttribute(required)}
			{...(htmlId ? { htmlFor: `${htmlId}-input` } : {})}
		>
			{children}
		</Slot>
	)
}
