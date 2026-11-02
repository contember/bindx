/**
 * Converts a precompiled static field map into runtime `SelectionMeta`.
 *
 * The compiler emits these plain, serializable maps inside a `CompiledSelection`
 * (2nd argument of `.render()`); the runtime consumes them in place of the proxy
 * collection pass. Output is indistinguishable from `SelectionScope.toSelectionMeta()`
 * for the equivalent access pattern — this file drives a `SelectionScope` and applies
 * the collector proxy's schema rules, so both paths share the same field typing.
 */
import type { SelectionMeta } from './types.js'
import { SelectionScope, type HasManyParams } from './SelectionScope.js'
import type { SchemaRegistry } from '../schema/SchemaRegistry.js'

/** Selection for one implicit entity prop. Key = field name. */
export type StaticFieldMap = Record<string, StaticFieldNode>

/**
 * `true` = the field was read; an object node = `fields` read on its target (⇒ a relation), plus
 * `hasOneFields` read through ref API names (`.value`, `.length`) — fields of the target only when
 * the schema says the field is a has-one, collector passthrough otherwise.
 */
export type StaticFieldNode =
	| true
	| {
		fields?: StaticFieldMap
		hasOneFields?: StaticFieldMap
		many?: true // has-many (known from <HasMany> usage or collection params)
		params?: { // has-many params; only statically-literal values
			filter?: unknown
			orderBy?: unknown
			limit?: number
			offset?: number
			totalCount?: boolean
		}
	}

/** The entity a field map is read on, for schema lookups (both null ⇒ no schema, like the collector). */
export interface StaticSelectionSchema {
	readonly entityName: string | null
	readonly schemaRegistry: SchemaRegistry<Record<string, object>> | null
}

const NO_SCHEMA: StaticSelectionSchema = { entityName: null, schemaRegistry: null }

interface FieldTyping {
	readonly isHasOne: boolean
	readonly isHasMany: boolean
	readonly target: StaticSelectionSchema
}

function typeField(schema: StaticSelectionSchema, fieldName: string): FieldTyping {
	const fieldDef = schema.entityName && schema.schemaRegistry
		? schema.schemaRegistry.getFieldDef(schema.entityName, fieldName)
		: undefined
	const isHasOne = fieldDef?.type === 'hasOne'
	const isHasMany = fieldDef?.type === 'hasMany'
	const targetName = fieldDef?.type === 'hasOne' || fieldDef?.type === 'hasMany' ? fieldDef.target : null
	return { isHasOne, isHasMany, target: { entityName: targetName, schemaRegistry: schema.schemaRegistry } }
}

/**
 * Drives a caller-provided (open) scope from a static field map, mirroring the runtime
 * collector: a schema relation is selected as a relation even when only touched, nested
 * access ⇒ relation (and `child()` seeds `id`). Keeping the scope open lets callers (e.g.
 * hole resolution) merge additional selection into the same scope before snapshotting.
 */
export function driveSelectionScope(scope: SelectionScope, map: StaticFieldMap, schema: StaticSelectionSchema = NO_SCHEMA): void {
	for (const [fieldName, node] of Object.entries(map)) {
		const typing = typeField(schema, fieldName)
		const nested = node === true ? undefined : node.fields
		const hasOneFields = node !== true && typing.isHasOne ? node.hasOneFields : undefined
		if (!nested && !hasOneFields && !typing.isHasOne && !typing.isHasMany) {
			scope.addScalar(fieldName)
			continue
		}
		// child() seeds `id` and registers the relation, exactly like the collector
		const childScope = scope.child(fieldName)
		if (typing.isHasMany || (node !== true && node.many)) {
			scope.markAsArray(fieldName)
		}
		if (node !== true && node.params) {
			const params: HasManyParams = node.params
			scope.setHasManyParams(fieldName, params)
		}
		driveSelectionScope(childScope, nested ?? {}, typing.target)
		driveSelectionScope(childScope, hasOneFields ?? {}, typing.target)
	}
}

/**
 * Converts a static field map for a single entity prop into `SelectionMeta`.
 * Thin wrapper over {@link driveSelectionScope}: new scope → drive → snapshot.
 */
export function staticSelectionToMeta(map: StaticFieldMap, schema: StaticSelectionSchema = NO_SCHEMA): SelectionMeta {
	const scope = new SelectionScope()
	driveSelectionScope(scope, map, schema)
	return scope.toSelectionMeta()
}
