import type { SchemaRegistry } from '@contember/bindx'
import { SelectionScope, generatePlaceholderId } from '@contember/bindx'
import {
	type EntityAccessor,
	type EntityFields,
	type FieldRef,
	type FieldAccessor,
	type HasManyRef,
	type HasManyAccessor,
	type HasOneRef,
	type HasOneAccessor,
	FIELD_REF_META,
	SCOPE_REF,
} from './types.js'
import { wrapEntityRefWithFieldAccessProxy } from './proxyShared.js'

/**
 * Combined ref type for collector that satisfies all accessor interfaces.
 * The collector needs to provide .value, .items, .length, .map, .$state, etc.
 */
type CollectorRef = FieldAccessor<unknown> & HasManyAccessor<unknown> & HasOneAccessor<unknown>

/**
 * Creates a collector proxy for the collection phase.
 * This proxy captures field access and builds selection metadata using SelectionScope.
 * Supports direct field access: `entity.fieldName` is equivalent to `entity.$fields.fieldName`.
 *
 * @param scope - The SelectionScope to collect fields into
 * @param entityName - The entity type name (e.g., 'Task'), used for schema lookups
 * @param schemaRegistry - The schema registry for field type information
 */
export function createCollectorProxy<T>(
	scope: SelectionScope,
	entityName: string | null = null,
	schemaRegistry: SchemaRegistry<Record<string, object>> | null = null,
): EntityAccessor<T> {
	const fieldsProxy = new Proxy({} as EntityFields<T>, {
		get(_, fieldName: string): FieldAccessor<unknown> | HasManyAccessor<unknown> | HasOneAccessor<unknown> {
			// Return a collector ref that works for all field types
			// The actual type (scalar/hasMany/hasOne) will be determined
			// by how it's used in components or by schema lookup
			return createCollectorFieldRef(scope, fieldName, entityName, schemaRegistry)
		},
	})

	const noop = () => () => {}

	const ref = {
		id: '__collector__',
		$fields: fieldsProxy,
		$data: null,
		$isDirty: false,
		$isPersisting: false,
		$persistedId: null,
		$isNew: true,
		__entityType: undefined as unknown as T,
		__entityName: '__collector__',

		__schema: {} as Record<string, object>,
		// Error properties (stubs for collection phase)
		$errors: [] as readonly never[],
		$hasError: false,
		$addError: () => {},
		$clearErrors: () => {},
		$clearAllErrors: () => {},
		// Event methods (stubs for collection phase)
		$on: noop,
		$intercept: noop,
		$onPersisted: noop,
		$interceptPersisting: noop,
	}

	// Add scope reference for nested component merging
	// This is an internal implementation detail, not part of public EntityRef interface
	;(ref as unknown as Record<symbol, unknown>)[SCOPE_REF] = scope

	// Wrap in Proxy to support direct field access
	return wrapEntityRefWithFieldAccessProxy(ref)
}

/**
 * Creates a field reference for collection phase using SelectionScope.
 *
 * Key design:
 * - Initially marks field as scalar
 * - Lazily creates child scope when relation access happens (.fields, .entity, .map)
 * - Child scope creation automatically upgrades from scalar to relation
 * - Uses schema to determine field type and enable direct field access for hasOne relations
 *
 * @param parentScope - The parent SelectionScope
 * @param fieldName - The field being accessed
 * @param entityName - The parent entity type name (e.g., 'Task')
 * @param schemaRegistry - The schema registry for field type lookups
 */
function createCollectorFieldRef(
	parentScope: SelectionScope,
	fieldName: string,
	entityName: string | null,
	schemaRegistry: SchemaRegistry<Record<string, object>> | null,
): CollectorRef {
	// Look up field type from schema if available
	const fieldDef = entityName && schemaRegistry
		? schemaRegistry.getFieldDef(entityName, fieldName)
		: null
	const isHasOneRelation = fieldDef?.type === 'hasOne'
	const isHasManyRelation = fieldDef?.type === 'hasMany'
	const isEnum = fieldDef?.type === 'enum'
	const targetEntityName = (fieldDef?.type === 'hasOne' || fieldDef?.type === 'hasMany')
		? fieldDef.target
		: null
	const enumName = isEnum ? fieldDef.enumName : undefined

	// Initially add as scalar (will be upgraded to relation if .fields/.entity/.map is accessed)
	// Or immediately mark as relation if schema tells us it is one
	if (isHasOneRelation || isHasManyRelation) {
		parentScope.child(fieldName) // This upgrades to relation
		if (isHasManyRelation) {
			parentScope.markAsArray(fieldName)
		}
	} else {
		parentScope.addScalar(fieldName)
	}

	// Lazy child scope - created only when relation access happens
	let childScope: SelectionScope | null = null

	const getChildScope = (): SelectionScope => {
		if (!childScope) {
			// This automatically removes from scalars and creates relation
			childScope = parentScope.child(fieldName)
		}
		return childScope
	}

	const meta = {
		entityType: targetEntityName ?? '', // Collection phase - entity type from schema
		entityId: '', // Collection phase - no entity
		path: [fieldName],
		fieldName,
		isArray: isHasManyRelation,
		isRelation: isHasOneRelation || isHasManyRelation,
		enumName,
	}

	const noop = () => () => {}
	const placeholderId = generatePlaceholderId()

	const hasOneFieldsProxy = new Proxy({} as EntityFields<unknown>, {
		get(_, nestedFieldName: string) {
			// Get child scope (upgrades to relation)
			const scope = getChildScope()
			// Create nested field ref in the child scope, passing target entity info
			return createCollectorFieldRef(scope, nestedFieldName, targetEntityName, schemaRegistry)
		},
	})

	const mapFn = <R>(fn: (item: EntityAccessor<unknown>, index: number) => R): R[] => {
		// Get child scope and mark as array relation
		const scope = getChildScope()
		parentScope.markAsArray(fieldName)
		// Call fn once with collector to gather nested selection, passing target entity info
		fn(createCollectorProxy<unknown>(scope, targetEntityName, schemaRegistry), 0)
		return []
	}

	// Base object that satisfies all ref interfaces
	// Components will use only the parts they need
	const refObject = {
		[FIELD_REF_META]: meta,
		// SCOPE_REF allows nested components to merge their selection into this field's scope
		// This is accessed lazily to create the child scope only when needed
		get [SCOPE_REF](): SelectionScope {
			return getChildScope()
		},

		// FieldRef properties (non-$ versions)
		value: null,
		serverValue: null,
		isDirty: false,
		isTouched: false,
		touch: () => {},
		setValue: () => {},
		inputProps: { value: null, setValue: () => {}, onChange: () => {} },
		errors: [],
		hasError: false,
		addError: () => {},
		clearErrors: () => {},
		onChange: noop,
		onChanging: noop,

		// HasManyRef properties (non-$ versions)
		length: 0,
		items: [],
		map: mapFn,
		add: () => '',
		getById: () => createCollectorProxy<unknown>(getChildScope(), targetEntityName, schemaRegistry),
		remove: () => {},
		move: () => {},
		connect: () => {},
		disconnect: () => {},
		delete: () => {},
		reset: () => {},
		onItemConnected: noop,
		onItemDisconnected: noop,
		interceptItemConnecting: noop,
		interceptItemDisconnecting: noop,

		// HasOneRef properties ($ prefix only - for collision safety)
		$state: 'disconnected' as const,
		$id: placeholderId,
		$isDirty: false,
		$fields: hasOneFieldsProxy,
		get $entity(): EntityAccessor<unknown> {
			// Get child scope (upgrades to relation) and return proxy with scope
			const scope = getChildScope()
			return createCollectorProxy<unknown>(scope, targetEntityName, schemaRegistry)
		},
		$delete: () => {},
		$remove: () => {},
		$errors: [],
		$hasError: false,
		$addError: () => {},
		$clearErrors: () => {},
		$connect: () => {},
		$disconnect: () => {},
		$isConnected: false,
		$reset: () => {},
		$onConnect: noop,
		$onDisconnect: noop,
		$interceptConnect: noop,
		$interceptDisconnect: noop,

		// EntityRef-compatible properties (for HasOneAccessor = EntityAccessor compatibility)
		id: placeholderId,
		$data: null,
		$isPersisting: false,
		$isNew: false,
		$persistedId: null,
		__entityName: targetEntityName ?? '',

		__schema: {} as Record<string, object>,
		$clearAllErrors: () => {},
		$on: noop,
		$intercept: noop,
		$onPersisted: noop,
		$interceptPersisting: noop,

		// paginateRelation total count
		totalCount: undefined,

		// Type brand (phantom property - only exists in type system)
		__entityType: undefined as unknown,
	}

	// Always wrap in proxy to support direct field access (e.g., task.project.name).
	// This works for all field types:
	// - Scalar fields: Accessing ref.value works (exists on target, passes through)
	// - Has-many fields: Accessing ref.items/length works (exists on target, passes through)
	// - Has-one with schema: Direct field access proxies to $fields (isHasOneRelation=true)
	// - Has-one without schema: Same - direct field access proxies to $fields
	// The hasOneFieldsProxy creates nested collector refs which properly track selection.
	return wrapCollectorRefWithFieldAccessProxy(refObject, hasOneFieldsProxy, isHasOneRelation)
}

/**
 * Wraps a collector ref in a Proxy that supports direct field access for hasOne relations.
 * - `ref.fieldName` is equivalent to `ref.$fields.fieldName`
 * - Known ref properties pass through to the target
 *
 * When `isHasOneRelation` is true, matches runtime EntityHandle proxy behavior:
 * only `id`, `$`-prefixed, and `__`-prefixed properties pass through;
 * everything else is delegated to `fieldsProxy` as field access on the related entity.
 * This prevents built-in ref properties (like `items`, `value`, `map`) from
 * shadowing entity field names on the has-one target.
 */
function wrapCollectorRefWithFieldAccessProxy(
	ref: CollectorRef,
	fieldsProxy: EntityFields<unknown>,
	isHasOneRelation: boolean,
): CollectorRef {
	return new Proxy(ref, {
		get(target, prop) {
			// Symbols - pass through
			if (typeof prop !== 'string') {
				return Reflect.get(target, prop)
			}

			if (isHasOneRelation) {
				// For has-one relations, match runtime EntityHandle proxy behavior:
				// Only pass through id, $-prefixed, and __-prefixed properties.
				// Everything else is field access on the related entity.
				if (prop === 'id' || prop.startsWith('$') || prop.startsWith('__')) {
					return Reflect.get(target, prop)
				}
				return fieldsProxy[prop as keyof EntityFields<unknown>]
			}

			// For has-many/scalar/unknown: existing behavior
			if (prop in target) {
				return Reflect.get(target, prop)
			}

			// Otherwise, treat as field access
			return fieldsProxy[prop as keyof EntityFields<unknown>]
		},
	}) as CollectorRef
}
