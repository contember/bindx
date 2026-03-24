import { createSelectionBuilder } from './createSelectionBuilder.js'
import { SELECTION_META, type FluentFragment, type SelectionBuilder } from './types.js'

/**
 * Creates a reusable fragment using the fluent builder API.
 *
 * This is a curried function - first call provides the model type,
 * second call provides the definer function.
 *
 * @example
 * ```ts
 * // Define a fragment
 * const AuthorFragment = createFragment<Author>()(e =>
 *   e.id().name().email()
 * )
 *
 * // Use in useEntity
 * const article = useEntity('Article', { id }, e =>
 *   e.title().author(AuthorFragment)
 * )
 *
 * // Or compose fragments
 * const ArticleFragment = createFragment<Article>()(e =>
 *   e.id().title()
 *    .author(AuthorFragment)
 *    .tags(TagFragment)
 * )
 * ```
 */
export function createFragment<TModel>() {
	return function <TResult extends object>(
		definer: (builder: SelectionBuilder<TModel>) => SelectionBuilder<TModel, TResult, object>,
	): FluentFragment<TModel, TResult> {
		// Create initial builder
		const builder = createSelectionBuilder<TModel>()

		// Execute definer to get final builder with accumulated selections
		const resultBuilder = definer(builder)

		// Extract metadata
		const meta = resultBuilder[SELECTION_META]

		return {
			__meta: meta,
			__resultType: undefined as unknown as TResult,
			__modelType: undefined as unknown as TModel,
			__isFragment: true,
		}
	}
}
