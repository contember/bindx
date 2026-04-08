import { type ComponentProps, type ReactNode } from 'react'
import { TextareaAutosize } from '#bindx-ui/ui/textarea'
import {
	FormFieldScope,
	FormInput,
} from '@contember/bindx-form'
import type { FieldRef } from '@contember/bindx'
import { FormContainer, type FormContainerProps } from '#bindx-ui/form/container'

export interface TextareaFieldProps<T> extends Omit<FormContainerProps, 'children'> {
	readonly field: FieldRef<T>
	readonly required?: boolean
	readonly inputProps?: ComponentProps<typeof TextareaAutosize>
}

export const TextareaField = <T,>({
	field,
	label,
	description,
	inputProps,
	required,
}: TextareaFieldProps<T>): ReactNode => (
	<FormFieldScope field={field}>
		<FormContainer description={description} label={label} required={required}>
			<FormInput field={field}>
				<TextareaAutosize required={required} {...(inputProps ?? {})} />
			</FormInput>
		</FormContainer>
	</FormFieldScope>
)
