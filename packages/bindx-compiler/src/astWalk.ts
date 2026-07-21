/**
 * Minimal generic AST walker driven by Babel's VISITOR_KEYS. Avoids depending on
 * @babel/traverse (whose ESM default-export interop is fragile) for the read-only
 * passes; the Babel plugin still uses the standard path-based visitor for mutation.
 */
import * as t from '@babel/types'

/** Depth-first pre-order walk. Return `false` from `enter` to skip a node's children. */
export function walkAst(root: t.Node, enter: (node: t.Node) => boolean | void): void {
	const visit = (node: t.Node): void => {
		if (enter(node) === false) {
			return
		}
		const keys = t.VISITOR_KEYS[node.type]
		if (!keys) {
			return
		}
		for (const key of keys) {
			// Index access is required to traverse arbitrary node shapes generically.
			const child: unknown = (node as unknown as Record<string, unknown>)[key]
			if (Array.isArray(child)) {
				for (const item of child) {
					if (item && typeof item === 'object' && isNode(item)) {
						visit(item)
					}
				}
			} else if (child && typeof child === 'object' && isNode(child)) {
				visit(child)
			}
		}
	}
	visit(root)
}

function isNode(value: object): value is t.Node {
	return typeof (value as { type?: unknown }).type === 'string'
}
