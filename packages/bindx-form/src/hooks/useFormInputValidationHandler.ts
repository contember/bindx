import { useRef, useState, useCallback, useEffect, type RefObject, type FocusEventHandler } from 'react'
import type { FieldErrorFilter, FieldRef } from '@contember/bindx'

/**
 * Code carried by the errors this hook adds, so they can be told apart from
 * server errors and from validation raised elsewhere.
 */
export const HTML5_VALIDATION_ERROR_CODE = 'html5-validity'

const ownErrors: FieldErrorFilter = { source: 'client', code: HTML5_VALIDATION_ERROR_CODE }

function syncValidationError<T>(field: FieldRef<T>, message: string | undefined): void {
	field.clearErrors(ownErrors)
	if (message) {
		field.addError({ message, code: HTML5_VALIDATION_ERROR_CODE })
	}
}

/**
 * Result from useFormInputValidationHandler hook.
 */
export interface ValidationHandlerResult {
	/** Ref to attach to the input element */
	readonly ref: RefObject<HTMLInputElement | null>
	/** Handler for focus event */
	readonly onFocus: FocusEventHandler<HTMLInputElement>
	/** Handler for blur event */
	readonly onBlur: FocusEventHandler<HTMLInputElement>
}

/**
 * Hook that provides HTML5 validation integration with touch tracking.
 *
 * Features:
 * - Marks field as touched on blur
 * - Reads HTML5 validation message on blur
 * - Syncs validation errors with field handle
 * - Only ever clears the error it added itself, so server errors and validation
 *   raised by other code survive a blur
 *
 * @example
 * ```tsx
 * function MyInput({ field }: { field: FieldRef<string> }) {
 *   const validation = useFormInputValidationHandler(field)
 *   return (
 *     <input
 *       ref={validation.ref}
 *       onFocus={validation.onFocus}
 *       onBlur={validation.onBlur}
 *       required
 *     />
 *   )
 * }
 * ```
 */
export function useFormInputValidationHandler<T>(
	field: FieldRef<T>,
): ValidationHandlerResult {
	const inputRef = useRef<HTMLInputElement>(null)
	const validationMessageRef = useRef<string | undefined>(undefined)
	const [focused, setFocused] = useState(false)

	const onFocus = useCallback<FocusEventHandler<HTMLInputElement>>(() => {
		setFocused(true)
	}, [])

	const onBlur = useCallback<FocusEventHandler<HTMLInputElement>>(() => {
		setFocused(false)
		field.touch()

		// Check HTML5 validity
		const input = inputRef.current
		if (!input) return

		const message = input.validity.valid ? undefined : input.validationMessage
		validationMessageRef.current = message

		syncValidationError(field, message)
	}, [field])

	// Effect to sync validation state when value changes
	useEffect(() => {
		const input = inputRef.current
		if (!input || !field.isTouched || focused) return

		const message = input.validity.valid ? undefined : input.validationMessage
		if (message !== validationMessageRef.current) {
			validationMessageRef.current = message
			syncValidationError(field, message)
		}
	})

	return {
		ref: inputRef,
		onFocus,
		onBlur,
	}
}
