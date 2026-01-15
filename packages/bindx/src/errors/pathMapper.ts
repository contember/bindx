/**
 * Maps Contember error paths to field/relation names.
 *
 * Contember errors include a path array that indicates where the error occurred.
 * This module converts those paths to bindx field/relation names.
 */

import type { SchemaRegistry } from '../schema/SchemaRegistry.js'
import { createServerError, type ExecutionErrorType, type ServerError } from './types.js'

/**
 * Contember path element - either a field name or an array index.
 */
export type PathElement =
	| { field: string }
	| { index: number; alias: string | null }

/**
 * Contember mutation error structure.
 */
export interface ContemberMutationError {
	readonly paths: PathElement[][]
	readonly message: string
	readonly type: ExecutionErrorType
}

/**
 * Contember validation error structure.
 */
export interface ContemberValidationError {
	readonly path: PathElement[]
	readonly message: { text: string }
}

/**
 * Segment of a parsed error path.
 */
export interface PathSegment {
	readonly field: string
	readonly index?: number
	readonly alias?: string | null
}

/**
 * Full parsed path information.
 */
export interface ParsedPath {
	/** The root field/relation name on the entity */
	readonly rootField: string
	/** Whether the root is a relation (vs scalar field) */
	readonly isRelation: boolean
	/** The target entity type of the relation (if isRelation) */
	readonly targetEntityType?: string
	/** Full path segments for nested errors */
	readonly segments: PathSegment[]
	/** Human-readable path string like "articles[0].author.name" */
	readonly pathString: string
	/** The final field name in the path (innermost) */
	readonly leafField?: string
}

/**
 * Result of mapping an error to a field/relation.
 */
export interface MappedError {
	readonly type: 'field' | 'relation' | 'entity'
	readonly name?: string
	readonly error: ServerError
	/** Parsed path information for nested errors */
	readonly path?: ParsedPath
}

/**
 * Maps a Contember mutation error to field/relation targets.
 */
export function mapMutationError(
	error: ContemberMutationError,
	entityType: string,
	schema: SchemaRegistry,
): MappedError[] {
	const results: MappedError[] = []

	// Mutation errors can have multiple paths
	for (const path of error.paths) {
		const mapped = mapPath(path, entityType, schema, error.message, error.type)
		if (mapped) {
			results.push(mapped)
		}
	}

	// If no paths could be mapped, create an entity-level error
	if (results.length === 0) {
		results.push({
			type: 'entity',
			error: createServerError(error.message, error.type, getErrorCode(error.type)),
		})
	}

	return results
}

/**
 * Maps a Contember validation error to a field/relation target.
 */
export function mapValidationError(
	error: ContemberValidationError,
	entityType: string,
	schema: SchemaRegistry,
): MappedError {
	const mapped = mapPath(error.path, entityType, schema, error.message.text)

	if (mapped) {
		return mapped
	}

	// If path couldn't be mapped, create an entity-level error
	return {
		type: 'entity',
		error: createServerError(error.message.text, undefined, 'VALIDATION_ERROR'),
	}
}

/**
 * Parses a path array into structured segments.
 */
function parsePath(path: PathElement[]): PathSegment[] {
	const segments: PathSegment[] = []
	let currentSegment: PathSegment | null = null

	for (const element of path) {
		if ('field' in element) {
			// Start a new segment
			if (currentSegment) {
				segments.push(currentSegment)
			}
			currentSegment = { field: element.field }
		} else if ('index' in element && currentSegment) {
			// Add index to current segment
			currentSegment = {
				field: currentSegment.field,
				index: element.index,
				alias: element.alias,
			}
		}
	}

	// Push the last segment
	if (currentSegment) {
		segments.push(currentSegment)
	}

	return segments
}

/**
 * Converts path segments to a human-readable string.
 */
function pathToString(segments: PathSegment[]): string {
	return segments.map((seg, i) => {
		let str = i === 0 ? seg.field : `.${seg.field}`
		if (seg.index !== undefined) {
			str += `[${seg.index}]`
		}
		return str
	}).join('')
}

/**
 * Maps a path array to a field/relation name with full path information.
 */
function mapPath(
	path: PathElement[],
	entityType: string,
	schema: SchemaRegistry,
	message: string,
	errorType?: ExecutionErrorType,
): MappedError | null {
	if (path.length === 0) {
		return null
	}

	// Parse the path into segments
	const segments = parsePath(path)
	if (segments.length === 0) {
		return null
	}

	const rootSegment = segments[0]!
	const rootField = rootSegment.field
	const pathString = pathToString(segments)
	const leafField = segments.length > 1 ? segments[segments.length - 1]?.field : undefined

	// Enhance error message with path info for nested errors
	const enhancedMessage = segments.length > 1
		? `${message} (at ${pathString})`
		: message

	// Determine if this is a field or a relation
	const fieldDef = schema.getFieldDef(entityType, rootField)

	// Build parsed path info
	const parsedPath: ParsedPath = {
		rootField,
		isRelation: fieldDef?.type !== 'scalar',
		targetEntityType: fieldDef?.type === 'hasOne' || fieldDef?.type === 'hasMany'
			? fieldDef.target
			: undefined,
		segments,
		pathString,
		leafField,
	}

	if (!fieldDef) {
		// Unknown field - return as field error anyway
		return {
			type: 'field',
			name: rootField,
			error: createServerError(enhancedMessage, errorType, getErrorCode(errorType)),
			path: parsedPath,
		}
	}

	if (fieldDef.type === 'scalar') {
		return {
			type: 'field',
			name: rootField,
			error: createServerError(message, errorType, getErrorCode(errorType)),
			path: parsedPath,
		}
	}

	// It's a relation (hasOne or hasMany)
	// For nested errors, try to get more specific info about where the error occurred
	return {
		type: 'relation',
		name: rootField,
		error: createServerError(enhancedMessage, errorType, getErrorCode(errorType)),
		path: parsedPath,
	}
}

/**
 * Converts Contember ExecutionErrorType to a user-friendly error code.
 */
function getErrorCode(errorType?: ExecutionErrorType): string | undefined {
	if (!errorType) return undefined

	switch (errorType) {
		case 'UniqueConstraintViolation':
			return 'UNIQUE_CONSTRAINT'
		case 'NotNullConstraintViolation':
			return 'NOT_NULL'
		case 'ForeignKeyConstraintViolation':
			return 'FOREIGN_KEY'
		case 'NotFoundOrDenied':
			return 'NOT_FOUND'
		case 'NonUniqueWhereInput':
			return 'NON_UNIQUE_WHERE'
		case 'InvalidDataInput':
			return 'INVALID_DATA'
		case 'SqlError':
			return 'SQL_ERROR'
		default:
			return undefined
	}
}

/**
 * Processes a Contember mutation result and extracts errors.
 */
export interface ContemberMutationResult {
	readonly ok: boolean
	readonly errorMessage: string | null
	readonly errors: ContemberMutationError[]
	readonly validation: {
		readonly valid: boolean
		readonly errors: ContemberValidationError[]
	}
}

/**
 * Extracts all mapped errors from a Contember mutation result.
 */
export function extractMappedErrors(
	result: ContemberMutationResult,
	entityType: string,
	schema: SchemaRegistry,
): MappedError[] {
	const mappedErrors: MappedError[] = []

	// Process mutation errors
	for (const error of result.errors) {
		const mapped = mapMutationError(error, entityType, schema)
		mappedErrors.push(...mapped)
	}

	// Process validation errors
	for (const error of result.validation.errors) {
		const mapped = mapValidationError(error, entityType, schema)
		mappedErrors.push(mapped)
	}

	return mappedErrors
}

/**
 * Utility to check if an error is from a nested path (more than one segment).
 */
export function isNestedError(mappedError: MappedError): boolean {
	return (mappedError.path?.segments.length ?? 0) > 1
}

/**
 * Gets the full path string from a mapped error.
 */
export function getErrorPathString(mappedError: MappedError): string | undefined {
	return mappedError.path?.pathString
}
