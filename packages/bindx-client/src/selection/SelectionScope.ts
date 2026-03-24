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
 * Relation metadata stored at parent level
 */
interface RelationMeta {
	isArray: boolean
	params?: HasManyParams
}

/**
 * Tree-based selection scope for collecting field selections.
 *
 * Unlike the flat path-based SelectionMetaCollector, SelectionScope
 * maintains a hierarchical tree structure that naturally represents
 * nested entity selections.
 *
 * Key benefits:
 * - Natural tree structure matches entity relationships
 * - No path string manipulation or collision risks
 * - Scope carries its context - no need for symbol passing
 * - Simple merge: just combine tree nodes
 */
export class SelectionScope {
	// Tree structure
	private parent: SelectionScope | null = null
	private children: Map<string, SelectionScope> = new Map()

	// Fields at this level
	private scalarFields: Set<string> = new Set()
	private relationMeta: Map<string, RelationMeta> = new Map()

	/**
	 * Create or get a child scope for a relation field.
	 * Automatically removes the field from scalars if it was there.
	 * New child scopes always include 'id' as a minimum selection.
	 */
	child(fieldName: string): SelectionScope {
		// Remove from scalars if it was added as scalar first
		this.scalarFields.delete(fieldName)

		let childScope = this.children.get(fieldName)
		if (!childScope) {
			childScope = new SelectionScope()
			childScope.parent = this
			childScope.addScalar('id')
			this.children.set(fieldName, childScope)
			this.relationMeta.set(fieldName, { isArray: false })
		}
		return childScope
	}

	/**
	 * Add a scalar field to this scope.
	 * If the field is already a relation, this is a no-op.
	 */
	addScalar(fieldName: string): void {
		if (!this.children.has(fieldName)) {
			this.scalarFields.add(fieldName)
		}
	}

	/**
	 * Mark a relation field as array (hasMany).
	 */
	markAsArray(fieldName: string): void {
		const meta = this.relationMeta.get(fieldName)
		if (meta) {
			meta.isArray = true
		}
	}

	/**
	 * Set hasMany parameters for a relation field.
	 */
	setHasManyParams(fieldName: string, params: HasManyParams): void {
		const meta = this.relationMeta.get(fieldName)
		if (meta) {
			meta.params = params
		}
	}

	/**
	 * Check if this scope has any fields (scalar or relation).
	 */
	hasFields(): boolean {
		return this.scalarFields.size > 0 || this.children.size > 0
	}

	/**
	 * Merge another scope into this one.
	 * Scalar fields are added, relation children are recursively merged.
	 */
	merge(other: SelectionScope): void {
		// Merge scalar fields
		for (const field of other.scalarFields) {
			this.addScalar(field)
		}

		// Merge relation children
		for (const [fieldName, otherChild] of other.children) {
			const thisChild = this.child(fieldName)
			thisChild.merge(otherChild)

			// Merge relation metadata
			const otherMeta = other.relationMeta.get(fieldName)
			if (otherMeta) {
				const thisMeta = this.relationMeta.get(fieldName)!
				if (otherMeta.isArray) {
					thisMeta.isArray = true
				}
				if (otherMeta.params && !thisMeta.params) {
					thisMeta.params = otherMeta.params
				}
			}
		}
	}

	/**
	 * Merge fields from a SelectionMeta into this scope.
	 * Useful for integrating with existing fluent builder selections.
	 */
	mergeFromSelectionMeta(meta: SelectionMeta): void {
		for (const [_key, field] of meta.fields) {
			// Only process root-level fields
			if (field.path.length !== 1) continue

			if (field.isRelation && field.nested) {
				const childScope = this.child(field.fieldName)
				if (field.isArray) {
					this.markAsArray(field.fieldName)
				}
				if (field.hasManyParams) {
					this.setHasManyParams(field.fieldName, field.hasManyParams)
				}
				childScope.mergeFromSelectionMeta(field.nested)
			} else {
				this.addScalar(field.fieldName)
			}
		}
	}

	/**
	 * Convert this scope to SelectionMeta format for backwards compatibility.
	 * This allows the new SelectionScope to be used with existing query builders.
	 *
	 * For has-many fields with params, generates auto-alias to allow multiple
	 * HasMany components for the same field with different parameters.
	 */
	toSelectionMeta(): SelectionMeta {
		const fields = new Map<string, SelectionFieldMeta>()

		// Add scalar fields
		for (const fieldName of this.scalarFields) {
			fields.set(fieldName, {
				fieldName,
				alias: fieldName,
				path: [fieldName],
				isRelation: false,
				isArray: false,
			})
		}

		// Add relation fields with nested selections
		for (const [fieldName, childScope] of this.children) {
			const meta = this.relationMeta.get(fieldName)!

			// Generate alias for has-many fields with params
			const alias = meta.isArray && meta.params
				? generateHasManyAlias(fieldName, meta.params)
				: fieldName

			fields.set(alias, {
				fieldName,
				alias,
				path: [fieldName],
				isRelation: true,
				isArray: meta.isArray,
				nested: childScope.toSelectionMeta(),
				hasManyParams: meta.params,
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
}
