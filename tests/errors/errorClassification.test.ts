import { describe, test, expect } from 'bun:test'
import {
	classifyError,
	isRetryableCategory,
	isExecutionErrorType,
	ExecutionErrorTypes,
	createServerError,
	type ExecutionErrorType,
	type ErrorCategory,
} from '@contember/bindx'

describe('error classification', () => {
	describe('classifyError', () => {
		test.each<[ExecutionErrorType, ErrorCategory]>([
			['NotNullConstraintViolation', 'constraint'],
			['UniqueConstraintViolation', 'constraint'],
			['ForeignKeyConstraintViolation', 'constraint'],
			['InvalidDataInput', 'validation'],
			['NonUniqueWhereInput', 'validation'],
			['NotFoundOrDenied', 'not_found'],
			['SqlError', 'transient'],
		])('should classify %s as %s', (errorType, expectedCategory) => {
			expect(classifyError(errorType)).toBe(expectedCategory)
		})

		test('should return unknown for undefined error type', () => {
			expect(classifyError(undefined)).toBe('unknown')
		})
	})

	describe('isRetryableCategory', () => {
		test.each<[ErrorCategory, boolean]>([
			['constraint', false],
			['validation', false],
			['not_found', false],
			['transient', true],
			['unknown', true],
		])('should return %s for category %s', (category, expectedRetryable) => {
			expect(isRetryableCategory(category)).toBe(expectedRetryable)
		})
	})

	describe('isExecutionErrorType', () => {
		test('should return true for valid error types', () => {
			expect(isExecutionErrorType('NotNullConstraintViolation')).toBe(true)
			expect(isExecutionErrorType('UniqueConstraintViolation')).toBe(true)
			expect(isExecutionErrorType('ForeignKeyConstraintViolation')).toBe(true)
			expect(isExecutionErrorType('NotFoundOrDenied')).toBe(true)
			expect(isExecutionErrorType('NonUniqueWhereInput')).toBe(true)
			expect(isExecutionErrorType('InvalidDataInput')).toBe(true)
			expect(isExecutionErrorType('SqlError')).toBe(true)
		})

		test('should return false for invalid error types', () => {
			expect(isExecutionErrorType('UnknownError')).toBe(false)
			expect(isExecutionErrorType('')).toBe(false)
			expect(isExecutionErrorType('notNullConstraintViolation')).toBe(false) // Wrong case
		})
	})

	describe('ExecutionErrorTypes', () => {
		test('should contain all error types', () => {
			expect(Object.keys(ExecutionErrorTypes)).toHaveLength(7)
			expect(ExecutionErrorTypes.NotNullConstraintViolation).toBe('NotNullConstraintViolation')
			expect(ExecutionErrorTypes.UniqueConstraintViolation).toBe('UniqueConstraintViolation')
			expect(ExecutionErrorTypes.ForeignKeyConstraintViolation).toBe('ForeignKeyConstraintViolation')
			expect(ExecutionErrorTypes.NotFoundOrDenied).toBe('NotFoundOrDenied')
			expect(ExecutionErrorTypes.NonUniqueWhereInput).toBe('NonUniqueWhereInput')
			expect(ExecutionErrorTypes.InvalidDataInput).toBe('InvalidDataInput')
			expect(ExecutionErrorTypes.SqlError).toBe('SqlError')
		})
	})

	describe('createServerError', () => {
		test('should create error with category and retryable flag', () => {
			const error = createServerError('Test error', 'UniqueConstraintViolation', 'UNIQUE')

			expect(error.source).toBe('server')
			expect(error.message).toBe('Test error')
			expect(error.type).toBe('UniqueConstraintViolation')
			expect(error.code).toBe('UNIQUE')
			expect(error.category).toBe('constraint')
			expect(error.retryable).toBe(false)
		})

		test('should mark SqlError as retryable', () => {
			const error = createServerError('Database error', 'SqlError')

			expect(error.category).toBe('transient')
			expect(error.retryable).toBe(true)
		})

		test('should handle undefined error type', () => {
			const error = createServerError('Unknown error')

			expect(error.type).toBeUndefined()
			expect(error.category).toBe('unknown')
			expect(error.retryable).toBe(true)
		})

		test('should mark validation errors as not retryable', () => {
			const error = createServerError('Invalid input', 'InvalidDataInput')

			expect(error.category).toBe('validation')
			expect(error.retryable).toBe(false)
		})

		test('should mark constraint errors as not retryable', () => {
			const error = createServerError('Duplicate email', 'UniqueConstraintViolation')

			expect(error.category).toBe('constraint')
			expect(error.retryable).toBe(false)
		})

		test('should mark not_found errors as not retryable', () => {
			const error = createServerError('Entity not found', 'NotFoundOrDenied')

			expect(error.category).toBe('not_found')
			expect(error.retryable).toBe(false)
		})
	})
})

describe('error handling integration', () => {
	test('full error handling workflow', () => {
		// Simulate receiving an error from Contember
		const errorType = 'UniqueConstraintViolation' as const

		// Check if it's a known error type
		expect(isExecutionErrorType(errorType)).toBe(true)

		// Classify the error
		const category = classifyError(errorType)
		expect(category).toBe('constraint')

		// Check if retryable
		const canRetry = isRetryableCategory(category)
		expect(canRetry).toBe(false)

		// Create server error
		const serverError = createServerError(
			'Email already exists',
			errorType,
			'UNIQUE_CONSTRAINT',
		)

		expect(serverError).toEqual({
			source: 'server',
			message: 'Email already exists',
			type: 'UniqueConstraintViolation',
			code: 'UNIQUE_CONSTRAINT',
			category: 'constraint',
			retryable: false,
		})
	})
})
