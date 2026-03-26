import { type ReactNode } from 'react'
import { FormContainerUI, FormDescriptionUI, FormErrorUI, FormLabelUI, FormLabelWrapperUI } from '#bindx-ui/form/ui'
import { useErrorFormatter } from '#bindx-ui/errors/useErrorFormatter'
import { FormError, FormFieldStateProvider, FormLabel, useFormFieldState } from '@contember/bindx-form'
import { FormFieldLabel } from '#bindx-ui/form/label'
import type { FieldError } from '@contember/bindx'

export interface FormContainerProps {
	readonly label?: ReactNode
	readonly description?: ReactNode
	readonly children: ReactNode
	readonly errors?: readonly FieldError[] | ReactNode
	readonly required?: boolean
}

function isErrorArray(errors: FormContainerProps['errors']): errors is readonly FieldError[] {
	return Array.isArray(errors)
}

export const FormContainer = ({
	children,
	description,
	label,
	required,
	errors,
}: FormContainerProps): ReactNode => {
	const errorsNode = isErrorArray(errors) ? undefined : errors
	const errorsList = isErrorArray(errors) ? errors : []
	const state = useFormFieldState()
	const labelToShow = label ?? <FormFieldLabel />
	const errorFormatter = useErrorFormatter()

	const inner = (
		<FormContainerUI>
			<FormLabelWrapperUI>
				{labelToShow && (
					<FormLabel>
						<FormLabelUI required={required}>
							{labelToShow}
						</FormLabelUI>
					</FormLabel>
				)}
			</FormLabelWrapperUI>
			<div>
				{children}
			</div>
			{(description || errorsNode || (state?.errors?.length ?? 0) > 0 || errorsList.length > 0) ? (
				<div>
					{description && <FormDescriptionUI>{description}</FormDescriptionUI>}
					<FormError formatter={errorFormatter}>
						<FormErrorUI />
					</FormError>
					{errorsNode}
				</div>
			) : null}
		</FormContainerUI>
	)

	return state !== undefined
		? inner
		: (
			<FormFieldStateProvider required={required} errors={errorsList as FieldError[]} dirty={false}>
				{inner}
			</FormFieldStateProvider>
		)
}
