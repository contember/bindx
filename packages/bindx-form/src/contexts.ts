import { createContext, useContext } from 'react'
import type { FormFieldState } from './types.js'

/**
 * Context for form field state.
 * Provides htmlId, errors, required, dirty, and field metadata.
 */
export const FormFieldStateContext = createContext<FormFieldState | undefined>(undefined)

/**
 * Hook to consume FormFieldStateContext.
 * Returns undefined if used outside a FormFieldScope.
 */
export function useFormFieldState(): FormFieldState | undefined {
	return useContext(FormFieldStateContext)
}

/**
 * Hook to consume FormFieldStateContext with required check.
 * Throws if used outside a FormFieldScope.
 */
export function useRequiredFormFieldState(): FormFieldState {
	const state = useFormFieldState()
	if (!state) {
		throw new Error('useRequiredFormFieldState must be used within a FormFieldScope or FormFieldStateProvider')
	}
	return state
}

/**
 * @deprecated Use useFormFieldState().htmlId instead
 */
export function useFormFieldId(): string | undefined {
	return useFormFieldState()?.htmlId
}

/**
 * @deprecated Use useFormFieldState().errors instead
 */
export function useFormErrors(): readonly import('@contember/bindx').FieldError[] | undefined {
	return useFormFieldState()?.errors
}
