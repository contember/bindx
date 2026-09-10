import { useState, useCallback, type ChangeEventHandler, type ReactElement, type FocusEventHandler } from 'react'
import { SlotInput } from './SlotInput.js'
import { useFormFieldState } from '../contexts.js'
import { useFormInputHandler } from '../hooks/useFormInputHandler.js'
import { useFormInputValidationHandler } from '../hooks/useFormInputValidationHandler.js'
import type { FormInputHandlerContext, FormInputProps } from '../types.js'
import { useField } from '@contember/bindx-react'

/**
 * Helper to set data attribute only when true
 */
function dataAttribute(value: boolean): '' | undefined {
	return value ? '' : undefined
}

/**
 * Collects the error a handler reports for the current input.
 */
interface HandlerErrorReport {
	message: string | null
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
export function FormInput<T>({
	field,
	children,
	formatValue: formatValueProp,
	parseValue: parseValueProp,
	handler: handlerProp,
}: FormInputProps<T>): ReactElement {
	const formState = useFormFieldState()
	const id = formState?.htmlId

	// Handler state for type-specific formatting
	const [handlerState, setHandlerState] = useState<unknown>(undefined)

	// Get handler with optional overrides (cast to any for internal use)
	const handler = useFormInputHandler({
		formatValue: formatValueProp as ((value: unknown) => string) | undefined,
		parseValue: parseValueProp as ((value: string) => unknown) | undefined,
		columnType: formState?.field?.columnType as import('../types.js').ColumnType | undefined,
		handler: handlerProp,
	})

	// Get validation handler for HTML5 validation + touch tracking
	const validation = useFormInputValidationHandler(field)

	const accessor = useField(field)

	const createHandlerContext = useCallback(
		(report: HandlerErrorReport): FormInputHandlerContext => ({
			state: handlerState,
			setState: setHandlerState,
			currentValue: accessor.value,
			setError: message => {
				report.message = message
			},
		}),
		[handlerState, accessor.value],
	)

	// Compute derived state
	const hasErrors = (formState?.errors.length ?? field.errors.length) > 0
	const dirty = formState?.dirty ?? accessor.isDirty
	const required = formState?.required ?? false
	const touched = field.isTouched

	// Format current value for display
	const displayValue = handler.formatValue(accessor.value, createHandlerContext({ message: null }))

	// Handle input changes
	const handleChange = useCallback<ChangeEventHandler<HTMLInputElement>>(
		(e) => {
			const report: HandlerErrorReport = { message: null }
			const parsedValue = handler.parseValue(e.target.value, createHandlerContext(report))
			field.setValue(parsedValue as T | null)
			if (report.message !== null) {
				field.addError(report.message)
			}
		},
		[field, handler, createHandlerContext],
	)

	// Combine focus handler with validation
	const handleFocus = useCallback<FocusEventHandler<HTMLInputElement>>(
		(e) => {
			validation.onFocus(e)
		},
		[validation],
	)

	// Combine blur handler with validation
	const handleBlur = useCallback<FocusEventHandler<HTMLInputElement>>(
		(e) => {
			validation.onBlur(e)
			const report: HandlerErrorReport = { message: null }
			handler.onBlur?.(createHandlerContext(report))
			if (report.message !== null) {
				field.addError(report.message)
			}
		},
		[field, handler, createHandlerContext, validation],
	)

	return (
		<SlotInput
			ref={validation.ref}
			value={displayValue}
			onChange={handleChange}
			onFocus={handleFocus}
			onBlur={handleBlur}
			data-invalid={dataAttribute(hasErrors)}
			data-dirty={dataAttribute(dirty)}
			data-required={dataAttribute(required)}
			data-touched={dataAttribute(touched)}
			id={id ? `${id}-input` : undefined}
			required={required}
			{...handler.defaultInputProps}
		>
			{children}
		</SlotInput>
	)
}
