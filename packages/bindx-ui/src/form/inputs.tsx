import { type ComponentProps, type ReactNode, useMemo } from 'react'
import { CheckboxInput, Input, RadioInput } from '#bindx-ui/ui/input'
import { TextareaAutosize } from '#bindx-ui/ui/textarea'
import { FormLabelUI } from '#bindx-ui/form/ui'
import {
	FormCheckbox,
	FormFieldScope,
	FormInput,
	FormLabel,
	FormRadioInput,
	useFormFieldState,
} from '@contember/bindx-form'
import type { FieldRef } from '@contember/bindx'
import { FormContainer, type FormContainerProps } from '#bindx-ui/form/container'
import { useEnumOptionsFormatter } from '#bindx-ui/labels/enumLabels'
import { FormFieldLabel } from '#bindx-ui/form/labels'

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

export interface RadioEnumFieldProps<T> extends Omit<FormContainerProps, 'children'> {
	readonly field: FieldRef<T>
	readonly required?: boolean
	readonly options?: Record<string, ReactNode> | Array<{ value: T | null; label: React.ReactNode }>
	readonly orientation?: 'horizontal' | 'vertical'
	readonly inputProps?: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'defaultValue'>
}

export const RadioEnumField = <T,>({
	field,
	label,
	description,
	required,
	...rest
}: RadioEnumFieldProps<T>): ReactNode => {
	return (
		<FormFieldScope field={field}>
			<FormContainer description={description} label={label} required={required}>
				<RadioEnumFieldInner field={field} required={required} {...rest} />
			</FormContainer>
		</FormFieldScope>
	)
}

interface RadioEnumFieldInnerProps<T> {
	readonly field: FieldRef<T>
	readonly options?: Record<string, ReactNode> | Array<{ value: T | null; label: React.ReactNode }>
	readonly orientation?: 'horizontal' | 'vertical'
	readonly inputProps?: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'defaultValue'>
	readonly required?: boolean
}

const RadioEnumFieldInner = <T,>({
	field,
	inputProps,
	required,
	options,
	orientation,
}: RadioEnumFieldInnerProps<T>): ReactNode => {
	const enumLabelsFormatter = useEnumOptionsFormatter()
	const enumName = useFormFieldState()?.field?.enumName
	const resolvedOptions = options ?? (enumName ? enumLabelsFormatter(enumName) : undefined)

	if (!resolvedOptions) {
		throw new Error('RadioEnumField: options are required')
	}

	const normalizedOptions = useMemo(() => {
		return Array.isArray(resolvedOptions)
			? resolvedOptions
			: Object.entries(resolvedOptions).map(([value, label]) => ({ value: value as T, label }))
	}, [resolvedOptions])

	return (
		<div className={'flex flex-wrap gap-3 data-[orientation=vertical]:flex-col'} data-orientation={orientation ?? 'vertical'}>
			{normalizedOptions.map(({ value, label }) => (
				<FormLabelUI className="flex gap-2 items-center font-normal" key={String(value)}>
					<FormRadioInput field={field} value={value}>
						<RadioInput required={required} {...inputProps} />
					</FormRadioInput>
					{label}
				</FormLabelUI>
			))}
		</div>
	)
}
