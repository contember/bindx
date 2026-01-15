/**
 * Error types for bindx error handling system.
 *
 * Supports both client-side validation errors and server-side errors
 * from Contember mutations.
 */

import { Result } from '@contember/schema'

/**
 * Execution error types from Contember.
 * Re-exported from @contember/schema to ensure type compatibility.
 */
export type ExecutionErrorType = `${Result.ExecutionErrorType}`

/**
 * All possible execution error type values.
 * Used for runtime validation and error classification.
 */
export const ExecutionErrorTypes: Record<ExecutionErrorType, ExecutionErrorType> = {
	NotNullConstraintViolation: 'NotNullConstraintViolation',
	UniqueConstraintViolation: 'UniqueConstraintViolation',
	ForeignKeyConstraintViolation: 'ForeignKeyConstraintViolation',
	NotFoundOrDenied: 'NotFoundOrDenied',
	NonUniqueWhereInput: 'NonUniqueWhereInput',
	InvalidDataInput: 'InvalidDataInput',
	SqlError: 'SqlError',
}

/**
 * Checks if a string is a valid ExecutionErrorType.
 */
export function isExecutionErrorType(value: string): value is ExecutionErrorType {
	return value in ExecutionErrorTypes
}

/**
 * Error classification for retry logic.
 */
export type ErrorCategory = 'validation' | 'constraint' | 'not_found' | 'transient' | 'unknown'

/**
 * Classifies an execution error type into a category.
 * - 'validation': Data validation errors (not retryable)
 * - 'constraint': Database constraint violations (not retryable without data change)
 * - 'not_found': Entity not found or access denied (not retryable)
 * - 'transient': Temporary errors that may succeed on retry
 * - 'unknown': Unclassified errors
 */
export function classifyError(errorType?: ExecutionErrorType): ErrorCategory {
	if (!errorType) return 'unknown'

	switch (errorType) {
		case 'NotNullConstraintViolation':
		case 'UniqueConstraintViolation':
		case 'ForeignKeyConstraintViolation':
			return 'constraint'
		case 'InvalidDataInput':
		case 'NonUniqueWhereInput':
			return 'validation'
		case 'NotFoundOrDenied':
			return 'not_found'
		case 'SqlError':
			// SQL errors could be transient (deadlock, connection issues) or permanent
			return 'transient'
		default:
			return 'unknown'
	}
}

/**
 * Checks if an error category is potentially retryable.
 */
export function isRetryableCategory(category: ErrorCategory): boolean {
	return category === 'transient' || category === 'unknown'
}

/**
 * Base interface for all bindx errors.
 */
export interface BindxError {
	/** Human-readable error message */
	readonly message: string
	/** Optional error code for programmatic handling (e.g., 'REQUIRED', 'UNIQUE_CONSTRAINT') */
	readonly code?: string
	/** If true, error won't auto-clear when field value changes */
	readonly sticky?: boolean
}

/**
 * Client-side error - added by user code for validation.
 */
export interface ClientError extends BindxError {
	readonly source: 'client'
}

/**
 * Server-side error - from Contember mutation response.
 */
export interface ServerError extends BindxError {
	readonly source: 'server'
	/** Contember execution error type for database errors */
	readonly type?: ExecutionErrorType
	/** Error category for classification */
	readonly category: ErrorCategory
	/** Whether this error might succeed on retry */
	readonly retryable: boolean
}

/**
 * Union type for all error sources.
 */
export type FieldError = ClientError | ServerError

/**
 * Error state stored in the SnapshotStore.
 */
export interface ErrorState {
	readonly errors: readonly FieldError[]
	readonly version: number
}

/**
 * Input type for addError - allows string shorthand or full error object.
 */
export type ErrorInput = string | Omit<ClientError, 'source'>

/**
 * Creates a ClientError from ErrorInput.
 */
export function createClientError(input: ErrorInput): ClientError {
	if (typeof input === 'string') {
		return { source: 'client', message: input }
	}
	return { ...input, source: 'client' }
}

/**
 * Creates a ServerError from Contember error data.
 * Automatically computes error category and retryable flag.
 */
export function createServerError(
	message: string,
	type?: ExecutionErrorType,
	code?: string,
): ServerError {
	const category = classifyError(type)
	return {
		source: 'server',
		message,
		type,
		code,
		category,
		retryable: isRetryableCategory(category),
	}
}

/**
 * Checks if an error is a client error.
 */
export function isClientError(error: FieldError): error is ClientError {
	return error.source === 'client'
}

/**
 * Checks if an error is a server error.
 */
export function isServerError(error: FieldError): error is ServerError {
	return error.source === 'server'
}

/**
 * Filters errors by source.
 */
export function filterErrorsBySource(
	errors: readonly FieldError[],
	source: 'client' | 'server',
): FieldError[] {
	return errors.filter(e => e.source === source)
}

/**
 * Filters out non-sticky client errors.
 * Used when auto-clearing errors on value change.
 */
export function filterStickyErrors(errors: readonly FieldError[]): FieldError[] {
	return errors.filter(e => e.source === 'server' || e.sticky === true)
}
