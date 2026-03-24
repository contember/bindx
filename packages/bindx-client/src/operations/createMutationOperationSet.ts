import { GraphQlField } from '@contember/graphql-builder'
import { ContentOperation, type ContentMutation, type ContentQuery } from './ContentOperation.js'
import { ContentOperationSet } from './ContentOperationSet.js'

/**
 * Creates an operation set for mutation execution.
 *
 * Supports three input formats:
 * - Single mutation: `ContentMutation<T>` → single mutation field
 * - Array: `ContentMutation<T>[]` → index-aliased mutations (transaction)
 * - Named: `Record<string, ContentMutation | ContentQuery>` → aliased mutations
 */
export function createMutationOperationSet(
	input:
		| Record<string, ContentMutation<unknown> | ContentQuery<unknown>>
		| ContentMutation<unknown>
		| ContentMutation<unknown>[],
): ContentOperationSet<unknown> {
	// Single mutation
	if (input instanceof ContentOperation) {
		return new ContentOperationSet(
			[new GraphQlField('mut', input.fieldName, input.args, input.selection)],
			(result) => input.parse(result['mut']),
		)
	}

	// Array of mutations — index-based aliases
	if (Array.isArray(input)) {
		return new ContentOperationSet(
			input.map((mut, i) =>
				new GraphQlField(`mut_${i}`, mut.fieldName, mut.args, mut.selection),
			),
			(result) =>
				input.map((mut, i) => mut.parse(result[`mut_${i}`] ?? null)),
		)
	}

	// Named mutations — with special handling for query-type operations
	const entries = Object.entries(input)
	return new ContentOperationSet(
		entries.map(([alias, operation]) => {
			if (operation.type === 'query') {
				// Queries within a mutation context are wrapped in a `query` field
				return new GraphQlField(alias, 'query', {}, [
					new GraphQlField('value', operation.fieldName, operation.args, operation.selection),
				])
			}
			return new GraphQlField(alias, operation.fieldName, operation.args, operation.selection)
		}),
		(result) => {
			const parsed: Record<string, unknown> = {}
			for (const [alias, operation] of entries) {
				if (operation.type === 'query') {
					const queryResult = result[alias] as Record<string, unknown> | null
					parsed[alias] = operation.parse(queryResult?.['value'] ?? null)
				} else {
					parsed[alias] = operation.parse(result[alias] ?? null)
				}
			}
			return parsed
		},
	)
}
