import { useMemo } from 'react'
import type { FormInputHandler, FormInputHandlerContext, ColumnType } from '../types.js'

/**
 * Default handler for string fields
 */
function createStringHandler(): FormInputHandler {
	return {
		parseValue: (value: string) => value || null,
		formatValue: (value: unknown) => (value as string) ?? '',
	}
}

/**
 * Handler for integer fields with number input type
 */
function createIntegerHandler(): FormInputHandler {
	return {
		parseValue: (value: string) => {
			if (value === '') return null
			const parsed = parseInt(value, 10)
			return isNaN(parsed) ? null : parsed
		},
		formatValue: (value: unknown) => {
			if (value === null || value === undefined) return ''
			return String(value)
		},
		defaultInputProps: { type: 'number', step: '1' },
	}
}

/**
 * Handler for double/float fields.
 * Tracks raw input to preserve user's decimal formatting.
 */
interface DoubleState {
	rawValue: string
	parsedValue: number | null
}

function createDoubleHandler(): FormInputHandler {
	return {
		parseValue: (value: string, ctx: FormInputHandlerContext) => {
			if (value === '') {
				ctx.setState({ rawValue: '', parsedValue: null })
				return null
			}
			const parsed = parseFloat(value)
			const parsedValue = isNaN(parsed) ? null : parsed
			ctx.setState({ rawValue: value, parsedValue })
			return parsedValue
		},
		formatValue: (value: unknown, ctx: FormInputHandlerContext) => {
			const state = ctx.state as DoubleState | undefined
			// If the parsed value matches, return the raw input to preserve formatting
			if (value === state?.parsedValue && state?.rawValue !== undefined) {
				return state.rawValue
			}
			if (value === null || value === undefined) return ''
			return String(value)
		},
		defaultInputProps: { type: 'number', step: 'any' },
	}
}

/**
 * Handler for date fields (YYYY-MM-DD format)
 */
function createDateHandler(): FormInputHandler {
	return {
		parseValue: (value: string) => {
			if (!value) return null
			// Input type="date" gives us YYYY-MM-DD format
			return value
		},
		formatValue: (value: unknown) => {
			if (!value) return ''
			// Expecting ISO date string or Date object
			if (value instanceof Date) {
				return value.toISOString().split('T')[0] ?? ''
			}
			// If it's already a string in YYYY-MM-DD format
			if (typeof value === 'string') {
				return value.split('T')[0] ?? ''
			}
			return ''
		},
		defaultInputProps: { type: 'date' },
	}
}

/**
 * Handler for datetime fields (local datetime format)
 */
function createDateTimeHandler(): FormInputHandler {
	return {
		parseValue: (value: string) => {
			if (!value) return null
			// Input type="datetime-local" gives us YYYY-MM-DDTHH:MM format
			// Convert to ISO string
			const date = new Date(value)
			if (isNaN(date.getTime())) return null
			return date.toISOString()
		},
		formatValue: (value: unknown) => {
			if (!value) return ''
			let date: Date
			if (value instanceof Date) {
				date = value
			} else if (typeof value === 'string') {
				date = new Date(value)
			} else {
				return ''
			}
			if (isNaN(date.getTime())) return ''
			// Format for datetime-local: YYYY-MM-DDTHH:MM
			const pad = (n: number): string => n.toString().padStart(2, '0')
			return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
		},
		defaultInputProps: { type: 'datetime-local' },
	}
}

/**
 * Handler for time fields (HH:MM format)
 */
function createTimeHandler(): FormInputHandler {
	return {
		parseValue: (value: string) => value || null,
		formatValue: (value: unknown) => (value as string) ?? '',
		defaultInputProps: { type: 'time' },
	}
}

type HandlerFactory = () => FormInputHandler

/**
 * Default handlers by column type
 */
const defaultTypeHandlers: Partial<Record<ColumnType, HandlerFactory>> = {
	String: createStringHandler,
	Integer: createIntegerHandler,
	Double: createDoubleHandler,
	Date: createDateHandler,
	DateTime: createDateTimeHandler,
	Time: createTimeHandler,
	Uuid: createStringHandler,
	Enum: createStringHandler,
}

function resolveColumnType(columnType: string | undefined): ColumnType | undefined {
	if (!columnType) return undefined
	return columnType as ColumnType
}

/**
 * Options for useFormInputHandler hook
 */
export interface UseFormInputHandlerOptions {
	/** Override parse function */
	parseValue?: FormInputHandler['parseValue']
	/** Override format function */
	formatValue?: FormInputHandler['formatValue']
	/** Column type for auto-detection */
	columnType?: ColumnType
}

/**
 * Hook that returns a FormInputHandler based on column type.
 * Can be overridden with custom parse/format functions.
 */
export function useFormInputHandler(options: UseFormInputHandlerOptions = {}): FormInputHandler {
	const { parseValue, formatValue, columnType } = options

	return useMemo(() => {
		// Get base handler from column type or default to string
		const resolved = resolveColumnType(columnType)
		const factory = (resolved && defaultTypeHandlers[resolved]) || createStringHandler
		const baseHandler = factory()

		return {
			parseValue: parseValue ?? baseHandler.parseValue,
			formatValue: formatValue ?? baseHandler.formatValue,
			defaultInputProps: baseHandler.defaultInputProps,
		}
	}, [parseValue, formatValue, columnType])
}

/**
 * Get default input props for a column type
 */
export function getDefaultInputProps(columnType?: ColumnType): React.InputHTMLAttributes<HTMLInputElement> | undefined {
	if (!columnType) return undefined
	const factory = defaultTypeHandlers[columnType]
	if (!factory) return undefined
	return factory().defaultInputProps
}
