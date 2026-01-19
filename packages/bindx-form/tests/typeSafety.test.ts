/**
 * Type Safety Tests for bindx-form Components
 *
 * These tests verify compile-time type safety for the form components.
 * They ensure that:
 *
 * 1. FormInput generic type T is correctly inferred from field
 * 2. FormRadioInput generic type T is correctly inferred from field
 * 3. FormFieldScope works with correctly typed FieldRef
 * 4. Type errors are raised for mismatched field/value types
 */

import { describe, test } from 'bun:test'
import type { FieldRef } from '@contember/bindx'
import type {
	FormInputProps,
	FormRadioInputProps,
	FormFieldScopeProps,
	FormCheckboxProps,
} from '../src/types.js'

// ============================================================================
// Type Assertion Helpers
// ============================================================================

/**
 * Asserts that two types are exactly equal.
 * Compilation fails if types don't match.
 */
type AssertEqual<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false

/**
 * Asserts that T extends U (T is assignable to U)
 */
type AssertExtends<T, U> = [T] extends [U] ? true : false

/**
 * Helper to verify a type equals true
 */
function assertTrue<T extends true>(): void {}

/**
 * Helper to verify a type equals false
 */
function assertFalse<T extends false>(): void {}

// ============================================================================
// Test Types
// ============================================================================

// Mock FieldRef types for testing
declare const stringField: FieldRef<string>
declare const numberField: FieldRef<number>
declare const booleanField: FieldRef<boolean>
declare const dateField: FieldRef<Date>
declare const nullableStringField: FieldRef<string | null>
declare const enumField: FieldRef<'draft' | 'published' | 'archived'>

// ============================================================================
// FormInputProps Type Tests
// ============================================================================

describe('Type Safety - FormInputProps', () => {
	test('field type T is propagated to formatValue and parseValue', () => {
		// formatValue should receive T | null
		type StringFormatValue = FormInputProps<string>['formatValue']
		type ExpectedFormat = ((value: string | null) => string) | undefined
		assertTrue<AssertExtends<StringFormatValue, ExpectedFormat>>()

		// parseValue should return T | null
		type StringParseValue = FormInputProps<string>['parseValue']
		type ExpectedParse = ((value: string) => string | null) | undefined
		assertTrue<AssertExtends<StringParseValue, ExpectedParse>>()
	})

	test('FormInputProps field accepts correctly typed FieldRef', () => {
		type StringInputProps = FormInputProps<string>
		type StringFieldProp = StringInputProps['field']

		// FieldRef<string> should be assignable to field prop
		assertTrue<AssertExtends<typeof stringField, StringFieldProp>>()

		// FieldRef<number> should NOT be assignable to field prop of FormInputProps<string>
		assertFalse<AssertExtends<typeof numberField, StringFieldProp>>()
	})

	test('formatValue receives correct nullable type', () => {
		type NumberInputProps = FormInputProps<number>
		type FormatFn = NonNullable<NumberInputProps['formatValue']>

		// formatValue parameter should be number | null, not just number
		type FormatParam = Parameters<FormatFn>[0]
		assertTrue<AssertExtends<null, FormatParam>>()
		assertTrue<AssertExtends<number, FormatParam>>()
	})

	test('parseValue returns correct nullable type', () => {
		type NumberInputProps = FormInputProps<number>
		type ParseFn = NonNullable<NumberInputProps['parseValue']>

		// parseValue return should be number | null
		type ParseReturn = ReturnType<ParseFn>
		assertTrue<AssertExtends<null, ParseReturn>>()
		assertTrue<AssertExtends<number, ParseReturn>>()
	})

	test('enum field type is preserved in FormInputProps', () => {
		type EnumInputProps = FormInputProps<'draft' | 'published' | 'archived'>
		type FieldProp = EnumInputProps['field']

		// Enum field should be assignable
		assertTrue<AssertExtends<typeof enumField, FieldProp>>()

		// String field should NOT be assignable to enum field
		assertFalse<AssertExtends<typeof stringField, FieldProp>>()
	})
})

// ============================================================================
// FormRadioInputProps Type Tests
// ============================================================================

describe('Type Safety - FormRadioInputProps', () => {
	test('value prop type matches field type', () => {
		type StringRadioProps = FormRadioInputProps<string>
		type ValueProp = StringRadioProps['value']

		// value should be string | null
		assertTrue<AssertExtends<string, ValueProp>>()
		assertTrue<AssertExtends<null, ValueProp>>()
	})

	test('enum value must match enum field type', () => {
		type EnumRadioProps = FormRadioInputProps<'draft' | 'published' | 'archived'>
		type ValueProp = EnumRadioProps['value']

		// Specific enum values should be assignable
		type Draft = 'draft'
		assertTrue<AssertExtends<Draft, ValueProp>>()

		// But other strings should NOT be assignable
		type InvalidValue = 'invalid'
		assertFalse<AssertExtends<InvalidValue, ValueProp>>()
	})

	test('field type must match value type', () => {
		type StringRadioProps = FormRadioInputProps<string>
		type FieldProp = StringRadioProps['field']

		// String field should be assignable
		assertTrue<AssertExtends<typeof stringField, FieldProp>>()

		// Number field should NOT be assignable
		assertFalse<AssertExtends<typeof numberField, FieldProp>>()
	})
})

// ============================================================================
// FormCheckboxProps Type Tests
// ============================================================================

describe('Type Safety - FormCheckboxProps', () => {
	test('field must be FieldRef<boolean>', () => {
		type CheckboxFieldProp = FormCheckboxProps['field']

		// Boolean field should be assignable
		assertTrue<AssertExtends<typeof booleanField, CheckboxFieldProp>>()

		// String field should NOT be assignable
		assertFalse<AssertExtends<typeof stringField, CheckboxFieldProp>>()

		// Number field should NOT be assignable
		assertFalse<AssertExtends<typeof numberField, CheckboxFieldProp>>()
	})
})

// ============================================================================
// FormFieldScopeProps Type Tests
// ============================================================================

describe('Type Safety - FormFieldScopeProps', () => {
	test('field accepts any FieldRef type', () => {
		// FormFieldScopeProps should accept any field type
		type StringScopeProps = FormFieldScopeProps<string>
		type NumberScopeProps = FormFieldScopeProps<number>
		type BooleanScopeProps = FormFieldScopeProps<boolean>

		assertTrue<AssertExtends<typeof stringField, StringScopeProps['field']>>()
		assertTrue<AssertExtends<typeof numberField, NumberScopeProps['field']>>()
		assertTrue<AssertExtends<typeof booleanField, BooleanScopeProps['field']>>()
	})

	test('field type mismatch is caught', () => {
		type StringScopeProps = FormFieldScopeProps<string>

		// Number field should NOT be assignable to string scope
		assertFalse<AssertExtends<typeof numberField, StringScopeProps['field']>>()
	})
})

// ============================================================================
// Type Error Tests (Compile-Time with @ts-expect-error)
// ============================================================================

describe('Type Safety - Expected Errors', () => {
	test('FormInputProps with wrong field type is error (type-level check)', () => {
		// Verify that FieldRef<number> is NOT assignable to FormInputProps<string>['field']
		type Props = FormInputProps<string>
		type NumberFieldRef = FieldRef<number>

		// This should be false - number field should not be assignable to string props
		assertFalse<AssertExtends<NumberFieldRef, Props['field']>>()
	})

	test('FormRadioInputProps with mismatched value is error (type-level check)', () => {
		type EnumProps = FormRadioInputProps<'draft' | 'published'>

		// 'invalid' should NOT be assignable to 'draft' | 'published' | null
		assertFalse<AssertExtends<'invalid', EnumProps['value']>>()
	})

	test('FormCheckboxProps with non-boolean field is error (type-level check)', () => {
		type CheckboxField = FormCheckboxProps['field']
		type StringFieldRef = FieldRef<string>

		// FieldRef<string> should NOT be assignable to FieldRef<boolean>
		assertFalse<AssertExtends<StringFieldRef, CheckboxField>>()
	})

	test('formatValue parameter type is correctly constrained', () => {
		type StringFormat = NonNullable<FormInputProps<string>['formatValue']>

		// The formatValue function parameter should be string | null
		type FormatParam = Parameters<StringFormat>[0]

		assertTrue<AssertExtends<string, FormatParam>>()
		assertTrue<AssertExtends<null, FormatParam>>()

		// number should NOT be assignable to string | null
		assertFalse<AssertExtends<number, FormatParam>>()
	})

	test('parseValue return type is correctly constrained', () => {
		type StringParse = NonNullable<FormInputProps<string>['parseValue']>

		// The parseValue function return should be string | null
		type ParseReturn = ReturnType<StringParse>

		assertTrue<AssertExtends<string, ParseReturn>>()
		assertTrue<AssertExtends<null, ParseReturn>>()

		// number return should NOT be valid for string parseValue
		assertFalse<AssertExtends<number, ParseReturn>>()
	})
})

// ============================================================================
// Inference Tests
// ============================================================================

describe('Type Safety - Type Inference', () => {
	test('FormInputProps T can be inferred from FieldRef', () => {
		// When using the component, T should be inferred from field
		function testInference<T>(props: FormInputProps<T>): T | null {
			return props.field.value
		}

		// Type of result should be inferred as string | null
		type Result = ReturnType<typeof testInference<string>>
		assertTrue<AssertEqual<Result, string | null>>()
	})

	test('FormRadioInputProps T aligns field and value', () => {
		// Both field and value should have the same type T
		function testRadioInference<T>(props: FormRadioInputProps<T>): boolean {
			// This comparison should be valid - both are T | null
			return props.field.value === props.value
		}

		// Function should compile without errors
		void testRadioInference
	})

	test('nullable types work correctly', () => {
		type NullableProps = FormInputProps<string | null>
		type NullableFieldProp = NullableProps['field']

		// FieldRef<string | null> should work
		assertTrue<AssertExtends<typeof nullableStringField, NullableFieldProp>>()
	})
})

// ============================================================================
// Complex Type Tests
// ============================================================================

describe('Type Safety - Complex Types', () => {
	test('Date field type works with FormInput', () => {
		type DateInputProps = FormInputProps<Date>
		type DateFieldProp = DateInputProps['field']

		assertTrue<AssertExtends<typeof dateField, DateFieldProp>>()
	})

	test('union types work correctly', () => {
		type UnionProps = FormInputProps<string | number>
		type FormatFn = NonNullable<UnionProps['formatValue']>
		type FormatParam = Parameters<FormatFn>[0]

		// formatValue should accept string | number | null
		assertTrue<AssertExtends<string, FormatParam>>()
		assertTrue<AssertExtends<number, FormatParam>>()
		assertTrue<AssertExtends<null, FormatParam>>()
	})
})
