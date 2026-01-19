import { useId, useMemo, type ReactNode } from 'react'
import { FormFieldStateContext } from '../contexts.js'
import type { FormFieldState, FormFieldStateProviderProps } from '../types.js'

const emptyErrors: readonly import('@contember/bindx').FieldError[] = Object.freeze([])

/**
 * Low-level provider for form field state.
 * Use FormFieldScope for automatic state extraction from field handles.
 */
export function FormFieldStateProvider({
	children,
	required = false,
	errors = emptyErrors,
	dirty = false,
	htmlId: htmlIdProp,
	field,
}: FormFieldStateProviderProps): ReactNode {
	const generatedId = useId()
	const htmlId = htmlIdProp ?? generatedId

	const value = useMemo<FormFieldState>(
		() => ({
			htmlId,
			required,
			errors,
			dirty,
			field,
		}),
		[htmlId, required, errors, dirty, field],
	)

	return (
		<FormFieldStateContext.Provider value={value}>
			{children}
		</FormFieldStateContext.Provider>
	)
}
