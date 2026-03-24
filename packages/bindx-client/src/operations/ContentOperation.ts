import type { GraphQlFieldTypedArgs, GraphQlSelectionSet } from '@contember/graphql-builder'

/**
 * A query or mutation operation descriptor.
 * First-class object that can be composed, batched, and executed.
 *
 * Created by the `qb` module, executed by `ContentClient`.
 */
export class ContentOperation<TValue, TType extends 'query' | 'mutation' = 'query' | 'mutation'> {
	constructor(
		/** @internal */
		public readonly type: TType,
		/** @internal GraphQL field name (e.g., getArticle, listArticle, createArticle) */
		public readonly fieldName: string,
		/** @internal Typed arguments with GraphQL type info */
		public readonly args: GraphQlFieldTypedArgs = {},
		/** @internal Field selection set */
		public readonly selection?: GraphQlSelectionSet,
		/** @internal Transform function from raw GraphQL result to typed value */
		public readonly parse: (value: unknown) => TValue = it => it as TValue,
	) {
	}
}

/** A query operation descriptor */
export type ContentQuery<TValue> = ContentOperation<TValue, 'query'>

/** A mutation operation descriptor */
export type ContentMutation<TValue> = ContentOperation<TValue, 'mutation'>
