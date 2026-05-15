import { type ReactNode, useCallback } from 'react'
import { type FieldError, isServerError } from '@contember/bindx'
import { dict } from '../dict.js'

export const useErrorFormatter = (): (errors: readonly FieldError[]) => ReactNode[] => {
	return useCallback((errors: readonly FieldError[]): ReactNode[] => {
		return errors.map((error) => {
			if (isServerError(error)) {
				if (error.type === 'UniqueConstraintViolation') {
					return dict.errors.unique
				}
				return error.message || dict.errors.unknown
			}
			// Client error
			return error.message
		})
	}, [])
}
