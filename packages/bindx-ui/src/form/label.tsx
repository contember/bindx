import { useFormFieldState } from '@contember/bindx-form'
import { useFieldLabelFormatter } from '#bindx-ui/labels/fieldLabels'
import type { ReactNode } from 'react'

export const FormFieldLabel = (): ReactNode => {
	const state = useFormFieldState()
	const fieldLabelFormatter = useFieldLabelFormatter()
	return state?.field ? fieldLabelFormatter(state.field.entityName, state.field.fieldName) : undefined
}
