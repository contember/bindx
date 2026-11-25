import type { SelectionMeta, SelectionFieldMeta } from './types.js'
import { generateHasManyAlias } from '../utils/aliasGenerator.js'

/**
 * HasMany parameters for filtering, ordering, pagination
 */
export interface HasManyParams {
	filter?: unknown
	orderBy?: unknown
	limit?: number
	offset?: number
	totalCount?: boolean
}

/**
 * One selected relation of a scope, keyed by its alias in the parent.
 */
interface RelationNode {
	readonly fieldName: string
	readonly scope: SelectionScope
	isArray: boolean
	params?: HasManyParams
}

/**
 * Tree-based selection scope for collecting field selections.
 *
 * Each scope holds the scalar fields and relations selected on one entity. Relations are
 * keyed by alias: a has-many selected with params (filter, orderBy, limit, offset) is its
 * own relation next to the plain one, under an alias generated from the params.
 */
export class SelectionScope {
	private readonly relations: Map<string, RelationNode> = new Map()
	private readonly scalarFields: Set<string> = new Set()

	/**
	 * Create or get the scope of a relation field selected without params.
	 * Removes the field from scalars if it was there. New relation scopes select 'id'.
	 */
	child(fieldName: string): SelectionScope {
		return this.ensureRelation(fieldName, fieldName).scope
	}

	/**
	 * Create or get the scope of a has-many relation selected with {@link params}.
	 * The relation is keyed by the alias the params generate, so each distinct set of
	 * params is its own relation; without params this is the plain {@link child}.
	 */
	hasManyChild(fieldName: string, params: HasManyParams): SelectionScope {
		const alias = generateHasManyAlias(fieldName, params)
		const node = this.ensureRelation(fieldName, alias)
		node.isArray = true
		if (alias !== fieldName || params.totalCount) {
			node.params = mergeHasManyParams(node.params, params)
		}
		return node.scope
	}

	/**
	 * Add a scalar field to this scope.
	 * If the field is already a relation, this is a no-op.
	 */
	addScalar(fieldName: string): void {
		if (!this.isRelationField(fieldName)) {
			this.scalarFields.add(fieldName)
		}
	}

	/**
	 * Mark the plain relation of a field as array (hasMany).
	 */
	markAsArray(fieldName: string): void {
		const node = this.relations.get(fieldName)
		if (node) {
			node.isArray = true
		}
	}

	/**
	 * Check if this scope has any fields (scalar or relation).
	 */
	hasFields(): boolean {
		return this.scalarFields.size > 0 || this.relations.size > 0
	}

	/**
	 * Merge another scope into this one.
	 * Scalar fields are added, relations are recursively merged by alias.
	 */
	merge(other: SelectionScope): void {
		for (const field of other.scalarFields) {
			this.addScalar(field)
		}

		for (const [alias, otherNode] of other.relations) {
			const node = this.ensureRelation(otherNode.fieldName, alias)
			node.scope.merge(otherNode.scope)
			node.isArray = node.isArray || otherNode.isArray
			if (otherNode.params) {
				node.params = mergeHasManyParams(node.params, otherNode.params)
			}
		}
	}

	/**
	 * Merge fields from a SelectionMeta into this scope.
	 * Useful for integrating with existing fluent builder selections.
	 */
	mergeFromSelectionMeta(meta: SelectionMeta): void {
		for (const field of meta.fields.values()) {
			// Only process root-level fields
			if (field.path.length !== 1) continue

			if (field.isRelation && field.nested) {
				const childScope = field.hasManyParams
					? this.hasManyChild(field.fieldName, field.hasManyParams)
					: this.child(field.fieldName)
				if (field.isArray) {
					this.markAsArray(field.fieldName)
				}
				childScope.mergeFromSelectionMeta(field.nested)
			} else {
				this.addScalar(field.fieldName)
			}
		}
	}

	/**
	 * Convert this scope to SelectionMeta format used by the query builders.
	 * A has-many selected with params is emitted under its generated alias.
	 */
	toSelectionMeta(): SelectionMeta {
		const fields = new Map<string, SelectionFieldMeta>()

		for (const fieldName of this.scalarFields) {
			fields.set(fieldName, {
				fieldName,
				alias: fieldName,
				path: [fieldName],
				isRelation: false,
				isArray: false,
			})
		}

		for (const [alias, node] of this.relations) {
			fields.set(alias, {
				fieldName: node.fieldName,
				alias,
				path: [node.fieldName],
				isRelation: true,
				isArray: node.isArray,
				nested: node.scope.toSelectionMeta(),
				hasManyParams: node.params,
			})
		}

		return { fields }
	}

	/**
	 * Create a SelectionScope from an existing SelectionMeta.
	 * Useful for converting explicit selections to scope format.
	 */
	static fromSelectionMeta(meta: SelectionMeta): SelectionScope {
		const scope = new SelectionScope()
		scope.mergeFromSelectionMeta(meta)
		return scope
	}

	private isRelationField(fieldName: string): boolean {
		for (const node of this.relations.values()) {
			if (node.fieldName === fieldName) {
				return true
			}
		}
		return false
	}

	private ensureRelation(fieldName: string, alias: string): RelationNode {
		this.scalarFields.delete(fieldName)
		const existing = this.relations.get(alias)
		if (existing) {
			return existing
		}
		const scope = new SelectionScope()
		scope.addScalar('id')
		const node: RelationNode = { fieldName, scope, isArray: false }
		this.relations.set(alias, node)
		return node
	}
}

/** Params of one alias differ at most in `totalCount`, which is not part of the alias. */
function mergeHasManyParams(current: HasManyParams | undefined, added: HasManyParams): HasManyParams {
	if (!current) {
		return added
	}
	return added.totalCount && !current.totalCount ? { ...current, totalCount: true } : current
}
