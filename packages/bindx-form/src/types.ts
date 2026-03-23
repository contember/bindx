import type { InputHTMLAttributes, ReactNode } from 'react'
import type { FieldError, FieldRef } from '@contember/bindx'

/**
 * State provided by FormFieldScope for form components
 */
export interface FormFieldState {
	/** Generated HTML id for the field */
	readonly htmlId: string
	/** List of errors on this field */
	readonly errors: readonly FieldError[]
	/** Whether the field is required */
	readonly required: boolean
	/** Whether the field has unpersisted changes */
	readonly dirty: boolean
	/** Field metadata for debugging/styling */
	readonly field?: {
		readonly entityName: string
		readonly fieldName: string
		readonly enumName?: string
		readonly columnType?: string
	}
}

/**
 * Context for format/parse operations in form inputs
 */
export interface FormInputHandlerContext<State = unknown> {
	readonly state?: State
	readonly setState: (state: State) => void
}

/**
 * Handler for formatting and parsing input values
 */
export interface FormInputHandler<State = unknown> {
	/** Parse input string to field value */
	readonly parseValue: (value: string, ctx: FormInputHandlerContext<State>) => unknown
	/** Format field value to input string */
	readonly formatValue: (value: unknown, ctx: FormInputHandlerContext<State>) => string
	/** Default HTML input attributes for this type */
	readonly defaultInputProps?: InputHTMLAttributes<HTMLInputElement>
}

/**
 * Factory function that creates a FormInputHandler
 */
export type FormInputHandlerFactory<State = unknown> = () => FormInputHandler<State>

/**
 * Column types from Contember schema
 */
export type ColumnType =
	| 'String'
	| 'Integer'
	| 'Double'
	| 'Date'
	| 'DateTime'
	| 'Time'
	| 'Bool'
	| 'Enum'
	| 'Uuid'
	| 'Json'

/**
 * Map of column types to their handlers
 */
export type TypeHandlerMap = Partial<Record<ColumnType, FormInputHandlerFactory>>

/**
 * Props for FormFieldScope component
 */
export interface FormFieldScopeProps<T = unknown> {
	/** Field handle from entity */
	readonly field: FieldRef<T>
	/** Children to render */
	readonly children: ReactNode
	/** Override required detection */
	readonly required?: boolean
}

/**
 * Props for FormFieldStateProvider component
 */
export interface FormFieldStateProviderProps extends Partial<FormFieldState> {
	readonly children: ReactNode
}

/**
 * Props for FormInput component
 * @typeParam T - The field value type
 */
export interface FormInputProps<T> {
	/** Field handle from entity */
	readonly field: FieldRef<T>
	/** Child element (input) to enhance */
	readonly children: React.ReactElement
	/** Custom value formatter */
	readonly formatValue?: (value: T | null) => string
	/** Custom value parser */
	readonly parseValue?: (value: string) => T | null
}

/**
 * Props for FormCheckbox component
 */
export interface FormCheckboxProps {
	/** Boolean field handle from entity */
	readonly field: FieldRef<boolean>
	/** Child element (input type="checkbox") to enhance */
	readonly children: React.ReactElement
}

/**
 * Props for FormRadioInput component
 * @typeParam T - The field value type
 */
export interface FormRadioInputProps<T> {
	/** Field handle from entity */
	readonly field: FieldRef<T>
	/** Value this radio represents */
	readonly value: T | null
	/** Child element (input type="radio") to enhance */
	readonly children: React.ReactElement
}

/**
 * Props for FormLabel component
 */
export interface FormLabelProps {
	/** Child element (label) to enhance */
	readonly children: React.ReactElement
}

/**
 * Props for FormError component
 */
export interface FormErrorProps {
	/** Function to format errors to display nodes */
	readonly formatter: (errors: readonly FieldError[]) => ReactNode[]
	/** Child element to clone for each error */
	readonly children: React.ReactElement
}
