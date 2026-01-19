import { useCallback, type ChangeEventHandler, type ReactElement } from 'react'
import { SlotInput } from './SlotInput.js'
import { useFormFieldState } from '../contexts.js'
import type { FormRadioInputProps } from '../types.js'

/**
 * Helper to set data attribute only when true
 */
function dataAttribute(value: boolean): '' | undefined {
	return value ? '' : undefined
}

/**
 * Binds a field handle to a radio input using Radix Slot pattern.
 *
 * @example
 * ```tsx
 * <FormFieldScope field={entity.fields.status}>
 *   <FormRadioInput field={entity.fields.status} value="draft">
 *     <input type="radio" /> Draft
 *   </FormRadioInput>
 *   <FormRadioInput field={entity.fields.status} value="published">
 *     <input type="radio" /> Published
 *   </FormRadioInput>
 * </FormFieldScope>
 * ```
 *
 * Features:
 * - Binds radio to specific value
 * - Sets data-invalid, data-dirty attributes
 * - Uses same name across radio group via htmlId
 */
export function FormRadioInput<T>({
	field,
	value,
	children,
}: FormRadioInputProps<T>): ReactElement {
	const formState = useFormFieldState()
	const id = formState?.htmlId

	// Compute derived state
	const hasErrors = (formState?.errors.length ?? field.errors.length) > 0
	const dirty = formState?.dirty ?? field.isDirty
	const isChecked = field.value === value

	// Handle radio change
	const handleChange = useCallback<ChangeEventHandler<HTMLInputElement>>(
		() => {
			field.setValue(value)
		},
		[field, value],
	)

	return (
		<SlotInput
			type="radio"
			checked={isChecked}
			value={typeof value === 'string' ? value : undefined}
			data-invalid={dataAttribute(hasErrors)}
			data-dirty={dataAttribute(dirty)}
			name={id ? `${id}-input` : undefined}
			id={id ? `${id}-input-${String(value)}` : undefined}
			onChange={handleChange}
		>
			{children}
		</SlotInput>
	)
}
