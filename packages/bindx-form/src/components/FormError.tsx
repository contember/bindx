import { cloneElement, useMemo, type ReactElement, type ReactNode } from 'react'
import { useRequiredFormFieldState } from '../contexts.js'
import type { FormErrorProps } from '../types.js'

/**
 * Renders formatted errors for the current field.
 *
 * @example
 * ```tsx
 * <FormFieldScope field={entity.fields.title}>
 *   <FormError formatter={errors => errors.map(e => e.message)}>
 *     <span className="error-message" />
 *   </FormError>
 * </FormFieldScope>
 * ```
 *
 * Features:
 * - Clones child element for each error
 * - Sets id attribute for accessibility
 * - Deduplicates formatted errors
 *
 * @throws Error if used outside FormFieldScope
 */
export function FormError({ formatter, children }: FormErrorProps): ReactElement | null {
	const { errors, htmlId } = useRequiredFormFieldState()

	// Format and deduplicate errors
	const formatted = useMemo(() => {
		const result = formatter(errors)
		// Deduplicate by converting to string and back
		const seen = new Set<string>()
		return result.filter((item) => {
			const key = String(item)
			if (seen.has(key)) return false
			seen.add(key)
			return true
		})
	}, [errors, formatter])

	if (formatted.length === 0) {
		return null
	}

	return (
		<>
			{formatted.map((content, index) =>
				cloneElement(children as ReactElement<{ key?: React.Key; id?: string; children?: ReactNode }>, {
					key: index,
					...(htmlId ? { id: `${htmlId}-error-${index}` } : {}),
					children: content,
				}),
			)}
		</>
	)
}
