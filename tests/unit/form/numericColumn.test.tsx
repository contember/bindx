import { describe, expect, test } from 'bun:test'
import { renderHook } from '@testing-library/react'
import { type FormInputHandlerContext, type TypeHandlerMap, useFormInputHandler } from '@contember/bindx-form'

const ctx: FormInputHandlerContext = { setState: () => {}, currentValue: null, setError: () => {} }

describe('a Numeric column in a form', () => {
	test('keeps every digit of an exact decimal', () => {
		const { result } = renderHook(() => useFormInputHandler({ columnType: 'Numeric' }))

		expect(result.current.parseValue('12345678901234567890.10', ctx)).toBe('12345678901234567890.10')
		expect(result.current.formatValue('0.10', ctx)).toBe('0.10')
	})

	test('takes a handler of its own', () => {
		const handler = { parseValue: (value: string) => value.trim(), formatValue: (value: unknown) => String(value) }
		const handlers: TypeHandlerMap = { Numeric: () => handler }

		expect(handlers.Numeric?.()).toBe(handler)
	})
})
