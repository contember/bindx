import type { GraphQlSelectionSet } from '@contember/graphql-builder'

/**
 * A set of operations bundled for a single GraphQL request.
 * Contains the combined selection set and a parse function to extract typed results.
 */
export class ContentOperationSet<TValue> {
	constructor(
		/** @internal Combined GraphQL selection set */
		public readonly selection: GraphQlSelectionSet,
		/** @internal Transform function from raw GraphQL result to typed value */
		public readonly parse: (value: Record<string, unknown>) => TValue = it => it as TValue,
	) {
	}
}
