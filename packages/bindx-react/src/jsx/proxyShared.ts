import type { SnapshotStore, FieldError } from '@contember/bindx'
import { generatePlaceholderId } from '@contember/bindx'
import {
	type EntityRef,
	type EntityAccessor,
	type EntityFields,
	type FieldRef,
	type HasManyRef,
	type HasOneRef,
	FIELD_REF_META,
} from './types.js'

/**
 * Notify change callback type
 */
export type NotifyChange = () => void

/**
 * Combined ref type for runtime and inline that satisfies all ref interfaces
 */
export type RuntimeRef = FieldRef<unknown> & HasManyRef<unknown> & HasOneRef<unknown>

/**
 * Known properties on entity accessor that should NOT be treated as field access.
 * Properties are accessed with $ prefix for consistency with EntityHandle.
 * Used by both collector and runtime proxies.
 */
export const ENTITY_ACCESSOR_PROPERTIES = new Set([
	'id',
	'$fields', '$data', '$isDirty', '$persistedId', '$isNew',
	'$errors', '$hasError', '$addError', '$clearErrors', '$clearAllErrors',
	'$on', '$intercept', '$onPersisted', '$interceptPersisting',
	'__entityType', '__entityName',
])

/**
 * Properties that should never be treated as field access.
 * These are checked by React, Promise-like detection, iterators, etc.
 */
export const NON_FIELD_PROPERTIES = new Set([
	'then', 'catch', 'finally', // Promise-like checks
	'toJSON', 'valueOf', 'toString', // Serialization
	'constructor', 'prototype', // Object internals
	'length', 'size', // Collection-like checks
	'$$typeof', '@@iterator', 'Symbol(Symbol.iterator)', // React/iterator internals
	'_reactFragment', '_owner', // React internals
	'nodeType', 'tagName', // DOM checks
])

/**
 * Wraps an EntityRef in a Proxy that supports direct field access.
 * - `entity.fieldName` is equivalent to `entity.$fields.fieldName`
 * - Known accessor properties pass through to the target
 */
export function wrapEntityRefWithFieldAccessProxy<T>(ref: EntityRef<T>): EntityAccessor<T> {
	return new Proxy(ref, {
		get(target, prop) {
			// Symbols - pass through
			if (typeof prop !== 'string') {
				return Reflect.get(target, prop)
			}

			// Known accessor properties - pass through
			if (ENTITY_ACCESSOR_PROPERTIES.has(prop)) {
				return Reflect.get(target, prop)
			}

			// Otherwise, treat as field access
			return target.$fields[prop as keyof EntityFields<T>]
		},
	}) as EntityAccessor<T>
}

/**
 * Gets a nested value from an object using a path array.
 */
export function getNestedValue(obj: unknown, path: string[]): unknown {
	if (path.length === 0) return obj
	if (obj === null || typeof obj !== 'object') return undefined

	let current: unknown = obj
	for (const key of path) {
		if (current === null || typeof current !== 'object') return undefined
		current = (current as Record<string, unknown>)[key]
	}
	return current
}

/**
 * Creates a null field ref for disconnected relations
 */
export function createNullFieldRef(path: string[], fieldName: string): FieldRef<unknown> {
	const noop = () => () => {}
	const noopFn = (): void => {}
	const setValueFn = (): void => {}
	const inputPropsValue = {
		value: null,
		setValue: setValueFn,
		onChange: setValueFn,
	}

	return {
		[FIELD_REF_META]: {
			entityType: '', // Null ref - no entity
			entityId: '', // Null ref - no entity
			path,
			fieldName,
			isArray: false,
			isRelation: false,
		},
		// FieldRef properties (non-$ versions)
		value: null,
		serverValue: null,
		isDirty: false,
		isTouched: false,
		touch: noopFn,
		setValue: setValueFn,
		inputProps: inputPropsValue,
		errors: [],
		hasError: false,
		addError: noopFn,
		clearErrors: noopFn,
		onChange: noop,
		onChanging: noop,
	}
}

/**
 * Creates a placeholder accessor for disconnected hasOne relations.
 * Returns an EntityAccessor with placeholder ID and empty fields.
 * Supports direct field access: entity.fieldName -> entity.$fields.fieldName
 */
export function createPlaceholderAccessor<T>(): EntityAccessor<T> {
	const noop = () => () => {}
	const inputProps = { value: null, setValue: () => {}, onChange: () => {} }

	const fieldsProxy = new Proxy({} as EntityFields<T>, {
		get(_, fieldName: string): FieldRef<unknown> {
			return {
				[FIELD_REF_META]: {
					entityType: '',
					entityId: '',
					path: [fieldName],
					fieldName,
					isArray: false,
					isRelation: false,
				},
				// FieldRef properties (non-$ versions)
				value: null,
				serverValue: null,
				isDirty: false,
				isTouched: false,
				touch: () => {},
				setValue: () => {},
				inputProps,
				errors: [] as FieldError[],
				hasError: false,
				addError: () => {},
				clearErrors: () => {},
				onChange: noop,
				onChanging: noop,
			}
		},
	})

	const ref: EntityRef<T> = {
		id: generatePlaceholderId(),
		$fields: fieldsProxy,
		$data: null,
		$isDirty: false,
		$persistedId: null,
		$isNew: true,
		__entityType: undefined as unknown as T,
		__entityName: '__placeholder__',
		__schema: {} as Record<string, object>,
		$errors: [] as FieldError[],
		$hasError: false,
		$addError: () => {},
		$clearErrors: () => {},
		$clearAllErrors: () => {},
		$on: noop,
		$intercept: noop,
		$onPersisted: noop,
		$interceptPersisting: noop,
	}

	// Wrap in Proxy to support direct field access
	return wrapEntityRefWithFieldAccessProxy(ref)
}
