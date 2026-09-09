import type { FormInputHandler, FormInputHandlerContext, JSONValue } from '../types.js'

/**
 * Options for createJsonHandler
 */
export interface JsonHandlerOptions {
	/** Value written when the input is empty. Default `null`. */
	readonly emptyValue?: JSONValue | null
	/** Shape validation beyond JSON syntax. Returns an error message or null. */
	readonly validate?: (value: JSONValue) => string | null
	/** Pretty-print the raw input when the field loses focus. Default false. */
	readonly formatOnBlur?: boolean
}

/**
 * Raw input kept next to the pretty-printed form of the value it produced,
 * so half-typed JSON is not reformatted under the user's cursor.
 */
interface JsonHandlerState {
	readonly rawValue: string
	readonly formatted: string
	readonly error: string | null
}

function formatJson(value: unknown): string {
	if (value === null || value === undefined) return ''
	return JSON.stringify(value, null, 2)
}

function readState(state: unknown): JsonHandlerState | undefined {
	if (typeof state !== 'object' || state === null) return undefined
	if (!('rawValue' in state) || !('formatted' in state) || !('error' in state)) return undefined
	const { rawValue, formatted, error } = state
	if (typeof rawValue !== 'string' || typeof formatted !== 'string') return undefined
	if (error !== null && typeof error !== 'string') return undefined
	return { rawValue, formatted, error }
}

function describeParseError(error: unknown): string {
	return `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`
}

/**
 * Handler for Json columns.
 *
 * Parses the input into a JSON value, keeps the previous value when the input does
 * not parse, and reports the parse or validation failure as a field error, which
 * blocks persist until the input parses again.
 */
export function createJsonHandler(options: JsonHandlerOptions = {}): FormInputHandler {
	const { emptyValue = null, validate, formatOnBlur = false } = options

	return {
		parseValue: (value: string, ctx: FormInputHandlerContext): unknown => {
			if (value.trim() === '') {
				ctx.setState({ rawValue: value, formatted: formatJson(emptyValue), error: null })
				return emptyValue
			}
			let parsed: JSONValue
			try {
				parsed = JSON.parse(value)
			} catch (error) {
				const message = describeParseError(error)
				ctx.setState({ rawValue: value, formatted: formatJson(ctx.currentValue), error: message })
				ctx.setError(message)
				return ctx.currentValue
			}
			const validationError = validate?.(parsed) ?? null
			ctx.setState({ rawValue: value, formatted: formatJson(parsed), error: validationError })
			if (validationError !== null) {
				ctx.setError(validationError)
			}
			return parsed
		},
		formatValue: (value: unknown, ctx: FormInputHandlerContext): string => {
			const state = readState(ctx.state)
			const formatted = formatJson(value)
			return state !== undefined && state.formatted === formatted ? state.rawValue : formatted
		},
		onBlur: (ctx: FormInputHandlerContext): void => {
			const state = readState(ctx.state)
			if (state === undefined) return
			// Blur validation clears the field errors, so a broken input has to re-report itself.
			if (state.error !== null) {
				ctx.setError(state.error)
				return
			}
			if (formatOnBlur && state.rawValue !== state.formatted) {
				ctx.setState({ ...state, rawValue: state.formatted })
			}
		},
	}
}
