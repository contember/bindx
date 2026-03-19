import { type ReactNode, useMemo, useState } from 'react'
import type { FieldRef } from '@contember/bindx'
import { FormFieldScope, FormInput, useFormFieldState } from '@contember/bindx-form'
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { FormContainer, type FormContainerProps } from './container.js'
import { useEnumOptionsFormatter } from '../labels/enumLabels.js'
import { Popover, PopoverTrigger } from '../ui/popover.js'
import {
	SelectDefaultPlaceholderUI,
	SelectInputActionsUI,
	SelectInputUI,
	SelectInputWrapperUI,
	SelectListItemUI,
	SelectPopoverContent,
} from '../select/ui.js'

export interface SelectEnumFieldProps<T> extends Omit<FormContainerProps, 'children'> {
	readonly field: FieldRef<T>
	readonly required?: boolean
	readonly options?: Record<string, ReactNode> | Array<{ value: T | null; label: ReactNode }>
	readonly placeholder?: ReactNode
}

export function SelectEnumField<T>({
	field,
	label,
	description,
	options,
	placeholder,
	required,
}: SelectEnumFieldProps<T>): ReactNode {
	return (
		<FormFieldScope field={field}>
			<FormContainer description={description} label={label} required={required}>
				<SelectEnumFieldInner field={field} options={options} placeholder={placeholder} required={required} />
			</FormContainer>
		</FormFieldScope>
	)
}

interface SelectEnumFieldInnerProps<T> {
	readonly field: FieldRef<T>
	readonly options?: Record<string, ReactNode> | Array<{ value: T | null; label: ReactNode }>
	readonly placeholder?: ReactNode
	readonly required?: boolean
}

function SelectEnumFieldInner<T>({
	field,
	options,
	placeholder,
}: SelectEnumFieldInnerProps<T>): ReactNode {
	const [open, setOpen] = useState(false)
	const enumLabelsFormatter = useEnumOptionsFormatter()
	const fieldState = useFormFieldState()
	const enumName = fieldState?.field?.enumName
	const id = fieldState?.htmlId

	const resolvedOptions = options ?? (enumName ? enumLabelsFormatter(enumName) : undefined)
	if (!resolvedOptions) {
		throw new Error('SelectEnumField: options are required')
	}

	const normalizedOptions = useMemo(() => {
		return Array.isArray(resolvedOptions)
			? resolvedOptions
			: Object.entries(resolvedOptions).map(([value, label]) => ({ value: value as T, label }))
	}, [resolvedOptions])

	const selectedOption = useMemo(
		() => normalizedOptions.find(it => it.value === field.value),
		[field.value, normalizedOptions],
	)

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<SelectInputWrapperUI>
				<PopoverTrigger asChild>
					<SelectInputUI id={id ? `${id}-input` : undefined}>
						{selectedOption?.label ?? placeholder ?? <SelectDefaultPlaceholderUI />}
						<SelectInputActionsUI>
							{open ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
						</SelectInputActionsUI>
					</SelectInputUI>
				</PopoverTrigger>
			</SelectInputWrapperUI>
			<SelectPopoverContent>
				{normalizedOptions.map(({ value, label }) => (
					<SelectListItemUI
						key={String(value)}
						onClick={() => {
							field.setValue(value)
							setOpen(false)
						}}
					>
						{label}
					</SelectListItemUI>
				))}
			</SelectPopoverContent>
		</Popover>
	)
}
