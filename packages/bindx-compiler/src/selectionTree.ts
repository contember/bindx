/**
 * Mutable selection tree mirroring the runtime SelectionScope semantics exactly:
 * - a field starts scalar and is upgraded to a relation the moment it is nested;
 * - every relation child implicitly includes `id` (SelectionScope.child adds it);
 * - `addScalar` is a no-op once the field is a relation.
 *
 * See packages/bindx-client/src/selection/SelectionScope.ts.
 */
import type { StaticFieldMap, StaticFieldNode, StaticHasManyParams, StaticSelection } from './types.js'

export class SelNode {
	private readonly scalars = new Set<string>()
	private readonly relations = new Map<string, SelNode>()
	private readonly manyFields = new Set<string>()
	private readonly params = new Map<string, StaticHasManyParams>()

	/** Add a scalar field (ignored if already a relation — matches SelectionScope). */
	addScalar(fieldName: string): void {
		if (!this.relations.has(fieldName)) {
			this.scalars.add(fieldName)
		}
	}

	/** Get/create a relation child; auto-includes `id`, drops any scalar of the same name. */
	child(fieldName: string): SelNode {
		this.scalars.delete(fieldName)
		let node = this.relations.get(fieldName)
		if (!node) {
			node = new SelNode()
			node.addScalar('id')
			this.relations.set(fieldName, node)
		}
		return node
	}

	markMany(fieldName: string): void {
		this.manyFields.add(fieldName)
	}

	setParams(fieldName: string, params: StaticHasManyParams): void {
		this.params.set(fieldName, params)
	}

	hasFields(): boolean {
		return this.scalars.size > 0 || this.relations.size > 0
	}

	toFieldMap(): StaticFieldMap {
		const map: StaticFieldMap = {}
		for (const name of this.scalars) {
			map[name] = true
		}
		for (const [name, child] of this.relations) {
			const node: Exclude<StaticFieldNode, true> = { fields: child.toFieldMap() }
			if (this.manyFields.has(name)) {
				node.many = true
			}
			const params = this.params.get(name)
			if (params && Object.keys(params).length > 0) {
				node.params = params
			}
			map[name] = node
		}
		return map
	}
}

/**
 * Normalize a StaticFieldMap to the plain field-tree form used by the equivalence
 * harness: `true` for scalars, nested objects for relations. `many`/`params` are
 * dropped because the runtime collector does NOT record them in the implicit path
 * (verified against the oracle) — see docs/compiler-plan.md ternary/params notes.
 */
export function fieldMapToPlain(map: StaticFieldMap): Record<string, unknown> {
	const result: Record<string, unknown> = {}
	for (const [name, node] of Object.entries(map)) {
		result[name] = node === true ? true : fieldMapToPlain(node.fields)
	}
	return result
}

export function selectionToPlain(selection: StaticSelection): Record<string, unknown> {
	const result: Record<string, unknown> = {}
	for (const [prop, map] of Object.entries(selection)) {
		result[prop] = fieldMapToPlain(map)
	}
	return result
}
