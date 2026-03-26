import { type ReactNode } from 'react'
import { CheckboxInput } from '#bindx-ui/ui/checkbox-input'
import { FormLabelUI } from '#bindx-ui/form/ui'
import {
	FormCheckbox,
	FormFieldScope,
	FormLabel,
} from '@contember/bindx-form'
import type { FieldRef } from '@contember/bindx'
import { FormContainer, type FormContainerProps } from '#bindx-ui/form/container'
import { FormFieldLabel } from '#bindx-ui/form/label'

export interface CheckboxFieldProps extends Omit<FormContainerProps, 'children'> {
	readonly field: FieldRef<boolean>
	readonly required?: boolean
	readonly inputProps?: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'defaultValue'>
}

export const CheckboxField = ({
	field,
	label,
	description,
	inputProps,
	required,
}: CheckboxFieldProps): ReactNode => (
	<FormFieldScope field={field}>
		<FormContainer description={description} label={false}>
			<div className="flex gap-2 items-center">
				<FormCheckbox field={field}>
					<CheckboxInput required={required} {...inputProps} />
				</FormCheckbox>
				<FormLabel>
					<FormLabelUI required={required}>{label ?? <FormFieldLabel />}</FormLabelUI>
				</FormLabel>
			</div>
		</FormContainer>
	</FormFieldScope>
)
