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
 */

import { FIELD_REF_META } from './types.js'

/**
 * Shared base properties for entity-like handles (EntityHandle, HasOneHandle).
 * Extracting a common set prevents bugs from inconsistent maintenance (e.g. missing `id`).
 */
const BASE_ENTITY_PROPERTIES: (string | symbol)[] = [
	// Entity identity — id is always the entity ID, not a field handle
	'id',
	// Type brands (phantom types)
	'__entityType', '__entityName', '__brands', '__schema',
	// Symbol
	FIELD_REF_META,
	// Core internals shared by all entity-like handles
	'entityType', 'entityId', 'store', 'dispatcher', 'schema',
	'getEntityData', 'getServerData', 'assertNotDisposed', 'isDisposed',
	'dispose', 'subscribe',
]

/**
 * Known properties on EntityHandle that should NOT be treated as field access.
 * Properties like `fields`, `data`, `errors` are NOT included - use $ prefix for those.
 */
export const ENTITY_HANDLE_PROPERTIES = new Set<string | symbol>([
	...BASE_ENTITY_PROPERTIES,
	// Entity-specific internals
	'type', 'fieldHandleCache', 'relationHandleCache',
	// Internal methods (unlikely to be field names)
	'field', 'hasOne', 'hasMany', 'getSnapshot',
	'reset', 'commit',
	'getDirtyFields', 'getDirtyRelations',
	// State properties (unlikely to be field names)
	'serverData', 'isLoaded', 'isLoading', 'isError', 'error', 'isPersisting',
])

/**
 * Known properties on HasOneHandle that should NOT be treated as field access.
 * Properties like `fields`, `entity`, `errors`, `state` are NOT included - they require $ prefix.
 */
export const HAS_ONE_HANDLE_PROPERTIES = new Set<string | symbol>([
	...BASE_ENTITY_PROPERTIES,
	// HasOne-specific internals
	'fieldName', 'targetType',
	'entityHandleCache', 'placeholderCache', 'ensureRelatedEntitySnapshot', 'relatedId',
	// Methods that are unlikely to be field names
	'connect', 'disconnect', 'delete', 'reset',
])

/**
 * All properties on FieldHandle (no field access proxy needed, just $ aliasing).
 */
export const FIELD_HANDLE_PROPERTIES = new Set<string | symbol>([
	FIELD_REF_META,
	// Core properties
	'value', 'serverValue', 'isDirty', 'inputProps', 'errors', 'hasError',
	'path', 'fieldName',
	// Methods
	'setValue', 'addError', 'clearErrors', 'onChange', 'onChanging', 'nested',
	// Internal
	'entityType', 'entityId', 'fieldPath', 'store', 'dispatcher',
	'getEntityData', 'getServerData', 'assertNotDisposed', 'isDisposed',
	'subscribe', 'dispose',
])

/**
 * All properties on HasManyListHandle (no field access proxy needed, just $ aliasing).
 */
export const HAS_MANY_HANDLE_PROPERTIES = new Set<string | symbol>([
	FIELD_REF_META,
	// Type brands
	'__entityType', '__brands',
	// Core properties
	'items', 'length', 'isDirty', 'errors', 'hasError',
	// Methods
	'map', 'add', 'remove', 'move', 'connect', 'disconnect', 'reset',
	'getItemHandle', 'addError', 'clearErrors',
	'onItemConnected', 'onItemDisconnected', 'interceptItemConnecting', 'interceptItemDisconnecting',
	// Internal
	'entityType', 'entityId', 'fieldName', 'itemType', 'store', 'dispatcher', 'schema',
	'itemHandleCache', 'getEntityData', 'getServerData', 'assertNotDisposed', 'isDisposed',
	'subscribe', 'dispose', 'ensureItemSnapshots',
])

/**
 * All properties on PlaceholderHandle (no field access proxy needed, just $ aliasing).
 */
export const PLACEHOLDER_HANDLE_PROPERTIES = new Set<string | symbol>([
	// Core properties
	'id', 'data', 'isDirty', 'persistedId', 'isNew', 'fields', 'errors', 'hasError',
	// Type brands
	'__entityType', '__entityName', '__brands',
	// Methods
	'addError', 'clearErrors', 'clearAllErrors',
	'on', 'intercept', 'onPersisted', 'interceptPersisting',
	// Internal
	'parentEntityType', 'parentEntityId', 'fieldName', 'targetType', 'store', 'dispatcher',
	'placeholderId', 'createPlaceholderFieldHandle',
])

/**
 * Configuration for creating a handle proxy.
 */
export interface HandleProxyConfig<T extends object> {
	/** Set of property names that should pass through to the handle */
	knownProperties: Set<string | symbol>
	/** Function to get the fields proxy from the handle */
	getFields: (target: T) => object
}

/**
 * Creates a proxy around a handle that supports direct field access.
 *
 * - `handle.fieldName` is equivalent to `handle.$fields.fieldName`
 * - `handle.$propertyName` accesses handle properties with $ prefix stripped
 * - Known properties pass through directly to the handle
 *
 * @param handle - The handle instance to wrap
 * @param config - Configuration for the proxy
 * @returns Proxied handle with direct field access support
 */
export function createHandleProxy<T extends object>(
	handle: T,
	config: HandleProxyConfig<T>,
): T {
	return new Proxy(handle, {
		get(target, prop, _receiver) {
			// Symbols and non-string props - pass through
			if (typeof prop !== 'string') {
				return Reflect.get(target, prop, target)
			}

			// $ prefixed - strip $ and access handle property
			if (prop.startsWith('$')) {
				const realProp = prop.slice(1)
				// Use target as receiver so getters use target as `this`, not the Proxy
				const value = Reflect.get(target, realProp, target)
				// Bind methods to preserve `this`
				if (typeof value === 'function') {
					return value.bind(target)
				}
				return value
			}

			// Known handle properties - pass through for backwards compatibility
			if (config.knownProperties.has(prop)) {
				const value = Reflect.get(target, prop, target)
				if (typeof value === 'function') {
					return value.bind(target)
				}
				return value
			}

			// Otherwise, treat as field access
			const fields = config.getFields(target)
			return (fields as Record<string, unknown>)[prop]
		},

		has(target, prop) {
			if (typeof prop === 'string' && !config.knownProperties.has(prop) && !prop.startsWith('$')) {
				// Check if it's a field
				const fields = config.getFields(target)
				return prop in fields
			}
			return Reflect.has(target, prop)
		},
	})
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
export function createAliasProxy<T extends object>(handle: T): T {
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
				// Bind methods to preserve `this`
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
	})
}
