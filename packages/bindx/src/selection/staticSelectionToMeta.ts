/**
 * Converts a precompiled static selection into runtime `SelectionMeta`.
 *
 * The compiler emits this plain, serializable shape as the 2nd argument of
 * `.render()`; the runtime consumes it in place of the proxy collection pass.
 * Output is indistinguishable from `SelectionScope.toSelectionMeta()` for the
 * equivalent access pattern — this file drives a `SelectionScope` so both paths
 * share the exact same alias/path/`id`-seeding semantics.
 */
import type { SelectionMeta } from './types.js'
import { SelectionScope, type HasManyParams } from './SelectionScope.js'

/** Selection for one implicit entity prop. Key = field name. */
export type StaticFieldMap = Record<string, StaticFieldNode>

export type StaticFieldNode =
	| true // scalar leaf (or relation touched without nested access)
	| {
		fields: StaticFieldMap // nested selection → this field is a relation
		many?: true // has-many (known from <HasMany> usage or collection params)
		params?: { // has-many params; only statically-literal values
			filter?: unknown
			orderBy?: unknown
			limit?: number
			offset?: number
			totalCount?: boolean
		}
	}

/** Emitted as the 2nd argument of .render(): key = implicit entity prop name. */
export type StaticSelection = Record<string, StaticFieldMap>

/**
 * Populates a scope from a static field map, mirroring the runtime collector's
 * scope operations: nested access ⇒ relation (and `child()` seeds `id`).
 */
function populateScope(scope: SelectionScope, map: StaticFieldMap): void {
	for (const [fieldName, node] of Object.entries(map)) {
		if (node === true) {
			scope.addScalar(fieldName)
			continue
		}
		// child() seeds `id` and registers the relation, exactly like the collector
		const childScope = scope.child(fieldName)
		if (node.many) {
			scope.markAsArray(fieldName)
		}
		if (node.params) {
			const params: HasManyParams = node.params
			scope.setHasManyParams(fieldName, params)
		}
		populateScope(childScope, node.fields)
	}
}

/**
 * Converts a static field map for a single entity prop into `SelectionMeta`.
 */
export function staticSelectionToMeta(map: StaticFieldMap): SelectionMeta {
	const scope = new SelectionScope()
	populateScope(scope, map)
	return scope.toSelectionMeta()
}
