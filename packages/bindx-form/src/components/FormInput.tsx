import { useState, useCallback, type ChangeEventHandler, type ReactElement } from 'react'
import { SlotInput } from './SlotInput.js'
import { useFormFieldState } from '../contexts.js'
import { useFormInputHandler } from '../hooks/useFormInputHandler.js'
import type { FormInputProps } from '../types.js'

/**
 * Helper to set data attribute only when true
 */
function dataAttribute(value: boolean): '' | undefined {
	return value ? '' : undefined
}

/**
 * Binds a field handle to an input element using Radix Slot pattern.
 *
 * @example
 * ```tsx
 * <FormFieldScope field={entity.fields.title}>
 *   <FormInput field={entity.fields.title}>
 *     <input className="my-input" placeholder="Enter title" />
 *   </FormInput>
 * </FormFieldScope>
 * ```
 *
 * Features:
 * - Auto-formats and parses values based on field type
 * - Sets data-invalid, data-dirty, data-required attributes
 * - Integrates with FormFieldState context for htmlId
 */
export function FormInput<T = string>({
	field,
	children,
	formatValue: formatValueProp,
	parseValue: parseValueProp,
}: FormInputProps<T>): ReactElement {
	const formState = useFormFieldState()
	const id = formState?.htmlId

	// Handler state for type-specific formatting
	const [handlerState, setHandlerState] = useState<unknown>(undefined)

	// Get handler with optional overrides (cast to any for internal use)
	const handler = useFormInputHandler({
		formatValue: formatValueProp as ((value: unknown) => string) | undefined,
		parseValue: parseValueProp as ((value: string) => unknown) | undefined,
	})

	const handlerContext = { state: handlerState, setState: setHandlerState }

	// Compute derived state
	const hasErrors = (formState?.errors.length ?? field.errors.length) > 0
	const dirty = formState?.dirty ?? field.isDirty
	const required = formState?.required ?? false

	// Format current value for display
	const displayValue = handler.formatValue(field.value, handlerContext)

	// Handle input changes
	const handleChange = useCallback<ChangeEventHandler<HTMLInputElement>>(
		(e) => {
			const parsedValue = handler.parseValue(e.target.value, handlerContext)
			field.setValue(parsedValue as T | null)
		},
		[field, handler, handlerContext],
	)

	return (
		<SlotInput
			value={displayValue}
			onChange={handleChange}
			data-invalid={dataAttribute(hasErrors)}
			data-dirty={dataAttribute(dirty)}
			data-required={dataAttribute(required)}
			id={id ? `${id}-input` : undefined}
			required={required}
			{...handler.defaultInputProps}
		>
			{children}
		</SlotInput>
	)
}
