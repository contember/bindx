import { useEffect, useRef, useCallback, type ChangeEventHandler, type ReactElement } from 'react'
import { SlotInput } from './SlotInput.js'
import { useFormFieldState } from '../contexts.js'
import type { FormCheckboxProps } from '../types.js'

/**
 * Helper to set data attribute only when true
 */
function dataAttribute(value: boolean): '' | undefined {
	return value ? '' : undefined
}

/**
 * Binds a boolean field handle to a checkbox input using Radix Slot pattern.
 *
 * @example
 * ```tsx
 * <FormFieldScope field={entity.fields.published}>
 *   <FormCheckbox field={entity.fields.published}>
 *     <input type="checkbox" />
 *   </FormCheckbox>
 * </FormFieldScope>
 * ```
 *
 * Features:
 * - Supports indeterminate state when value is null
 * - Sets data-state attribute: 'checked' | 'unchecked' | 'indeterminate'
 * - Sets data-invalid, data-dirty attributes
 */
export function FormCheckbox({
	field,
	children,
}: FormCheckboxProps): ReactElement {
	const formState = useFormFieldState()
	const id = formState?.htmlId

	// Track the checkbox element ref for indeterminate state
	const checkboxRef = useRef<HTMLInputElement>(null)

	// Compute derived state
	const hasErrors = (formState?.errors.length ?? field.errors.length) > 0
	const dirty = formState?.dirty ?? field.isDirty
	const value = field.value

	// Set indeterminate state on the DOM element
	useEffect(() => {
		if (checkboxRef.current) {
			checkboxRef.current.indeterminate = value === null
		}
	}, [value])

	// Compute data-state
	const dataState = value === null ? 'indeterminate' : value ? 'checked' : 'unchecked'

	// Handle checkbox changes
	const handleChange = useCallback<ChangeEventHandler<HTMLInputElement>>(
		(e) => {
			field.setValue(e.target.checked)
		},
		[field],
	)

	return (
		<SlotInput
			ref={checkboxRef}
			type="checkbox"
			checked={value === true}
			data-state={dataState}
			data-invalid={dataAttribute(hasErrors)}
			data-dirty={dataAttribute(dirty)}
			id={id ? `${id}-input` : undefined}
			onChange={handleChange}
		>
			{children}
		</SlotInput>
	)
}
