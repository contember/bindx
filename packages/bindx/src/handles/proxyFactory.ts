/**
 * Shared proxy factory for creating handle proxies with direct field access and $ aliasing.
 *
 * This module provides:
 * 1. createHandleProxy - for EntityHandle/HasOneHandle with field access via proxy
 * 2. createAliasProxy - for FieldHandle/HasManyListHandle/PlaceholderHandle with $ aliasing only
 *
 * The $ prefix convention allows handle properties to avoid collision with entity field names:
 * - `entity.title` → field access (returns FieldHandle)
 * - `entity.$isDirty` → handle property
 * - `entity.id` → entity ID (special case, always passes through)
 */

import { FIELD_REF_META } from './types.js'

/**
 * Properties that always pass through to the handle, never treated as field access.
 * Kept minimal to avoid collisions with entity field names.
 */
const HANDLE_PASSTHROUGH_PROPERTIES = new Set<string | symbol>([
	// Entity identity — `entity.id` must return the entity ID string, not a FieldHandle
	'id',
	// Symbol for field reference metadata
	FIELD_REF_META,
])

/**
 * Creates a proxy around a handle that supports direct field access.
 *
 * Resolution order:
 * 1. Symbols → pass through to handle
 * 2. `id` / FIELD_REF_META → pass through to handle
 * 3. `$xxx` → strip `$`, access handle property
 * 4. Everything else → field access (returns FieldHandle/HasOneHandle/HasManyListHandle)
 *
 * @param handle - The handle instance to wrap
 * @param getFields - Function to get the fields object from the handle
 * @returns Proxied handle with direct field access support
 */
export function createHandleProxy<T extends object, TResult = T>(
	handle: T,
	getFields: (target: T) => object,
): TResult {
	// The proxy adds $ alias support and field access, making the handle satisfy the public type TResult at runtime
	return new Proxy(handle, {
		get(target, prop, _receiver) {
			// Symbols and non-string props - pass through
			if (typeof prop !== 'string') {
				return Reflect.get(target, prop, target)
			}

			// Special properties that always pass through
			if (HANDLE_PASSTHROUGH_PROPERTIES.has(prop)) {
				return Reflect.get(target, prop, target)
			}

			// $ prefixed - strip $ and access handle property
			if (prop.startsWith('$')) {
				const realProp = prop.slice(1)
				const value = Reflect.get(target, realProp, target)
				if (typeof value === 'function') {
					return value.bind(target)
				}
				return value
			}

			// Everything else → field access
			const fields = getFields(target)
			return (fields as Record<string, unknown>)[prop]
		},

		has(target, prop) {
			if (typeof prop === 'string' && !HANDLE_PASSTHROUGH_PROPERTIES.has(prop) && !prop.startsWith('$')) {
				const fields = getFields(target)
				return prop in fields
			}
			return Reflect.has(target, prop)
		},
	}) as unknown as TResult
}

/**
 * Creates a simple proxy that only handles $ prefix aliasing.
 * Used for handles that don't need field access proxying (FieldHandle, HasManyListHandle, PlaceholderHandle).
 *
 * - `handle.$propertyName` accesses `handle.propertyName`
 * - All other accesses pass through to the handle
 *
 * @param handle - The handle instance to wrap
 * @returns Proxied handle with $ alias support
 */
export function createAliasProxy<T extends object, TResult = T>(handle: T): TResult {
	// The proxy adds $ alias support, making the handle satisfy the public type TResult at runtime
	return new Proxy(handle, {
		get(target, prop, _receiver) {
			// Symbols and non-string props - pass through
			if (typeof prop !== 'string') {
				return Reflect.get(target, prop, target)
			}

			// $ prefixed - strip $ and access handle property
			if (prop.startsWith('$')) {
				const realProp = prop.slice(1)
				const value = Reflect.get(target, realProp, target)
				if (typeof value === 'function') {
					return value.bind(target)
				}
				return value
			}

			// Pass through to handle
			const value = Reflect.get(target, prop, target)
			if (typeof value === 'function') {
				return value.bind(target)
			}
			return value
		},
	}) as unknown as TResult
}
