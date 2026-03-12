/**
 * Deep error path resolution for Contember mutation errors.
 *
 * Walks error paths through the schema and store to resolve
 * the exact target entity and field where the error occurred,
 * instead of mapping everything to the root entity.
 */

import type { SchemaRegistry } from '../schema/SchemaRegistry.js'
import type { SnapshotStore } from '../store/SnapshotStore.js'
import type { PathElement, ContemberMutationResult } from './pathMapper.js'
import { createServerError, type ServerError } from './types.js'

/**
 * The resolved target of an error path.
 */
export interface ResolvedErrorTarget {
	readonly entityType: string
	readonly entityId: string
	readonly fieldName?: string
	readonly type: 'field' | 'relation' | 'entity'
}

/**
 * A fully resolved error with its target and error object.
 */
export interface ResolvedError {
	readonly target: ResolvedErrorTarget
	readonly error: ServerError
}

/**
 * Context needed for resolving error paths.
 */
export interface ErrorPathContext {
	readonly schema: SchemaRegistry
	readonly store: SnapshotStore
}

/**
 * Resolves an error path to the specific entity and field where the error occurred.
 *
 * Walks path elements through schema relations and store state:
 * - `{field: name}` on scalar + last element → field error on current entity
 * - `{field: name}` on has-one → traverse into related entity via store
 * - `{field: name}` on has-many → consume next `{index, alias}` element
 * - `{index, alias}` → resolve entity ID from alias or index-based lookup
 *
 * Falls back to last successfully resolved entity on failure.
 */
export function resolveErrorPath(
	path: PathElement[],
	rootEntityType: string,
	rootEntityId: string,
	context: ErrorPathContext,
): ResolvedErrorTarget {
	if (path.length === 0) {
		return { entityType: rootEntityType, entityId: rootEntityId, type: 'entity' }
	}

	let currentType = rootEntityType
	let currentId = rootEntityId
	let lastField: string | undefined

	for (let i = 0; i < path.length; i++) {
		const element = path[i]!

		if ('field' in element) {
			const fieldName = element.field
			const fieldDef = context.schema.getFieldDef(currentType, fieldName)

			if (!fieldDef) {
				// Unknown field — return as field error on current entity (best effort)
				return { entityType: currentType, entityId: currentId, fieldName, type: 'field' }
			}

			if (fieldDef.type === 'scalar') {
				// Scalar field — this is the leaf target
				return { entityType: currentType, entityId: currentId, fieldName, type: 'field' }
			}

			if (fieldDef.type === 'hasOne') {
				const targetType = context.schema.getRelationTarget(currentType, fieldName)
				if (!targetType) {
					return { entityType: currentType, entityId: currentId, fieldName, type: 'relation' }
				}

				// Check if there are more path elements to traverse into
				if (i === path.length - 1) {
					// Last element — error is on the relation itself
					return { entityType: currentType, entityId: currentId, fieldName, type: 'relation' }
				}

				// Traverse into the related entity
				const relationState = context.store.getRelation(currentType, currentId, fieldName)
				if (!relationState || !relationState.currentId) {
					// Can't resolve further — return relation error on current entity
					return { entityType: currentType, entityId: currentId, fieldName, type: 'relation' }
				}

				currentType = targetType
				currentId = relationState.currentId
				lastField = fieldName
				continue
			}

			if (fieldDef.type === 'hasMany') {
				const targetType = context.schema.getRelationTarget(currentType, fieldName)
				if (!targetType) {
					return { entityType: currentType, entityId: currentId, fieldName, type: 'relation' }
				}

				// Next element should be {index, alias}
				const nextElement = path[i + 1]
				if (!nextElement || !('index' in nextElement)) {
					// No index element — error is on the relation itself
					return { entityType: currentType, entityId: currentId, fieldName, type: 'relation' }
				}

				// Consume the index element
				i++

				// Resolve entity ID from alias or index
				const resolvedId = resolveHasManyItemId(
					nextElement as { index: number; alias: string | null },
					currentType,
					currentId,
					fieldName,
					context.store,
				)

				if (!resolvedId) {
					// Can't resolve — return relation error on current entity
					return { entityType: currentType, entityId: currentId, fieldName, type: 'relation' }
				}

				currentType = targetType
				currentId = resolvedId
				lastField = fieldName
				continue
			}
		} else if ('index' in element) {
			// Bare index element without preceding has-many field — shouldn't happen
			// but handle gracefully by returning entity-level error
			continue
		}
	}

	// Ended traversal without hitting a leaf — return entity-level error on current entity
	return { entityType: currentType, entityId: currentId, type: 'entity' }
}

/**
 * Resolves a has-many item ID from an index/alias path element.
 * Prefers alias (which is the entity ID) over index-based lookup.
 */
function resolveHasManyItemId(
	element: { index: number; alias: string | null },
	parentType: string,
	parentId: string,
	fieldName: string,
	store: SnapshotStore,
): string | undefined {
	// Alias is the entity ID — use directly
	if (element.alias) {
		return element.alias
	}

	// Fall back to index-based lookup from ordered list
	const orderedIds = store.getHasManyOrderedIds(parentType, parentId, fieldName)
	return orderedIds[element.index]
}

/**
 * Converts error type string to a user-friendly error code.
 */
function getErrorCode(errorType?: string): string | undefined {
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
 * Resolves all errors from a Contember mutation result to specific entity targets.
 * Processes both execution errors and validation errors.
 */
export function resolveAllErrors(
	result: ContemberMutationResult,
	rootEntityType: string,
	rootEntityId: string,
	context: ErrorPathContext,
): ResolvedError[] {
	const resolved: ResolvedError[] = []

	for (const error of result.errors) {
		if (error.paths.length === 0) {
			resolved.push({
				target: { entityType: rootEntityType, entityId: rootEntityId, type: 'entity' },
				error: createServerError(error.message, error.type, getErrorCode(error.type)),
			})
			continue
		}

		for (const path of error.paths) {
			const target = resolveErrorPath(path, rootEntityType, rootEntityId, context)
			resolved.push({
				target,
				error: createServerError(error.message, error.type, getErrorCode(error.type)),
			})
		}
	}

	for (const error of result.validation.errors) {
		const target = resolveErrorPath(error.path, rootEntityType, rootEntityId, context)
		resolved.push({
			target,
			error: createServerError(error.message.text, undefined, 'VALIDATION_ERROR'),
		})
	}

	return resolved
}
