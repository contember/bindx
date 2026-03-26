import { type ComponentProps, type ReactNode } from 'react'
import { Input } from '#bindx-ui/ui/input'
import {
	FormFieldScope,
	FormInput,
} from '@contember/bindx-form'
import type { FieldRef } from '@contember/bindx'
import { FormContainer, type FormContainerProps } from '#bindx-ui/form/container'

export interface InputFieldProps<T> extends Omit<FormContainerProps, 'children'> {
	readonly field: FieldRef<T>
	readonly required?: boolean
	readonly inputProps?: ComponentProps<typeof Input>
	readonly formatValue?: (value: T | null) => string
	readonly parseValue?: (value: string) => T | null
}

export const InputField = <T,>({
	field,
	label,
	description,
	inputProps,
	required,
	parseValue,
	formatValue,
}: InputFieldProps<T>): ReactNode => (
	<FormFieldScope field={field}>
		<FormContainer description={description} label={label} required={required}>
			<FormInput field={field} parseValue={parseValue} formatValue={formatValue}>
				<Input required={required} {...(inputProps ?? {})} />
			</FormInput>
		</FormContainer>
	</FormFieldScope>
)
