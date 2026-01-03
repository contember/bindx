import type { SelectionMeta, FluentFragment, SelectionBuilder } from '../selection/types.js'
import { createSelectionBuilder, SELECTION_META, buildQueryFromSelection } from '../selection/index.js'
import type { QuerySpec } from '../selection/buildQuery.js'

/**
 * Input types for selection resolution
 */
export type SelectionInput<TModel, TResult extends object> =
	| FluentDefiner<TModel, TResult>
	| FluentFragment<TModel, TResult>
	| SelectionMeta

/**
 * Type for fluent definer function
 */
export type FluentDefiner<TModel, TResult extends object> = (
	builder: SelectionBuilder<TModel>,
) => SelectionBuilder<TModel, TResult, object>

/**
 * Resolves various selection input formats to SelectionMeta.
 * Works without React - pure function.
 */
export function resolveSelectionMeta<TModel, TResult extends object>(
	input: SelectionInput<TModel, TResult>,
): SelectionMeta {
	// Already SelectionMeta
	if (isSelectionMeta(input)) {
		return input
	}

	// FluentFragment
	if (isFluentFragment(input)) {
		return input.__meta
	}

	// FluentDefiner function
	const builder = createSelectionBuilder<TModel>()
	const resultBuilder = input(builder)
	return resultBuilder[SELECTION_META]
}

/**
 * Type guard for SelectionMeta
 */
function isSelectionMeta(input: unknown): input is SelectionMeta {
	return (
		typeof input === 'object' &&
		input !== null &&
		'fields' in input &&
		input.fields instanceof Map
	)
}

/**
 * Type guard for FluentFragment
 */
function isFluentFragment<TModel, TResult extends object>(
	input: unknown,
): input is FluentFragment<TModel, TResult> {
	return (
		typeof input === 'object' &&
		input !== null &&
		'__isFragment' in input &&
		(input as FluentFragment<TModel, TResult>).__isFragment === true
	)
}

/**
 * Builds a QuerySpec from selection input.
 * Convenience function combining resolution and building.
 */
export function buildQuery<TModel, TResult extends object>(
	input: SelectionInput<TModel, TResult>,
): QuerySpec {
	const meta = resolveSelectionMeta(input)
	return buildQueryFromSelection(meta)
}
