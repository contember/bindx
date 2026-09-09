import { useMemo, type ComponentProps, type ReactNode } from 'react'
import { TextareaAutosize } from '#bindx-ui/ui/textarea'
import {
	FormFieldScope,
	FormInput,
	createJsonHandler,
	type JSONValue,
} from '@contember/bindx-form'
import type { FieldRef } from '@contember/bindx'
import { FormContainer, type FormContainerProps } from '#bindx-ui/form/container'

export interface JsonFieldProps extends Omit<FormContainerProps, 'children'> {
	readonly field: FieldRef<JSONValue | null>
	readonly required?: boolean
	readonly inputProps?: ComponentProps<typeof TextareaAutosize>
	/** Value written when the textarea is empty. Default `null`. */
	readonly emptyValue?: JSONValue | null
	/** Shape validation beyond JSON syntax. Returns an error message or null. */
	readonly validate?: (value: JSONValue) => string | null
	/** Pretty-print the input when the textarea loses focus. Default false. */
	readonly formatOnBlur?: boolean
}

export const JsonField = ({
	field,
	label,
	description,
	inputProps,
	required,
	emptyValue = null,
	validate,
	formatOnBlur,
}: JsonFieldProps): ReactNode => {
	const handler = useMemo(
		() => createJsonHandler({ emptyValue, validate, formatOnBlur }),
		[emptyValue, validate, formatOnBlur],
	)

	return (
		<FormFieldScope field={field}>
			<FormContainer description={description} label={label} required={required}>
				<FormInput field={field} handler={handler}>
					<TextareaAutosize required={required} {...(inputProps ?? {})} />
				</FormInput>
			</FormContainer>
		</FormFieldScope>
	)
}
