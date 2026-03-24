import { GraphQlField } from '@contember/graphql-builder'
import { ContentOperation, type ContentQuery } from './ContentOperation.js'
import { ContentOperationSet } from './ContentOperationSet.js'

/**
 * Creates an operation set for query execution.
 *
 * Supports three input formats:
 * - Single query: `ContentQuery<T>` → `ContentOperationSet<T>`
 * - Named batch: `Record<string, ContentQuery>` → `ContentOperationSet<Record<string, T>>`
 */
export function createQueryOperationSet(
	input: Record<string, ContentQuery<unknown>> | ContentQuery<unknown>,
): ContentOperationSet<unknown> {
	// Single query
	if (input instanceof ContentOperation) {
		return new ContentOperationSet(
			[new GraphQlField('value', input.fieldName, input.args, input.selection)],
			(result) => input.parse(result['value']),
		)
	}

	// Named batch — multiple queries in a single request
	const entries = Object.entries(input)
	return new ContentOperationSet(
		entries.map(([alias, query]) =>
			new GraphQlField(alias, query.fieldName, query.args, query.selection),
		),
		(result) => {
			const parsed: Record<string, unknown> = {}
			for (const [alias, query] of entries) {
				parsed[alias] = query.parse(result[alias] ?? null)
			}
			return parsed
		},
	)
}
