/**
 * Minimal generic AST walker driven by Babel's VISITOR_KEYS. Avoids depending on
 * @babel/traverse (whose ESM default-export interop is fragile) for the read-only
 * passes; the Babel plugin still uses the standard path-based visitor for mutation.
 */
import * as t from '@babel/types'

/** Traversal control returned from `enter`: skip this node's children, or stop the whole walk. */
export type WalkControl = 'skip' | 'stop'

/**
 * Depth-first pre-order walk. Return 'skip' from `enter` to skip a node's children, or 'stop'
 * to end the entire walk (used by the predicate/collection passes that abort once decided).
 */
export function walkAst(root: t.Node, enter: (node: t.Node) => WalkControl | void): void {
	let stopped = false

	const visit = (node: t.Node): void => {
		const control = enter(node)
		if (control === 'stop') {
			stopped = true
			return
		}
		if (control === 'skip') {
			return
		}
		const keys = t.VISITOR_KEYS[node.type]
		if (!keys) {
			return
		}
		for (const key of keys) {
			// Read the child by visitor key; Reflect.get keeps this cast-free over arbitrary node shapes.
			const child: unknown = Reflect.get(node, key)
			if (Array.isArray(child)) {
				for (const item of child) {
					if (isNode(item)) {
						visit(item)
					}
					if (stopped) {
						return
					}
				}
			} else if (isNode(child)) {
				visit(child)
			}
			if (stopped) {
				return
			}
		}
	}

	visit(root)
}

function isNode(value: unknown): value is t.Node {
	return typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
}
