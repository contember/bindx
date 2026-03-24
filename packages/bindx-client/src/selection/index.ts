// Types
export {
	SELECTION_META,
	type SelectionBuilder,
	type SelectionMeta,
	type SelectionFieldMeta,
	type FluentFragment,
	type FluentDefiner,
	type HasManyOptions,
	type InferSelection,
	type ScalarMethod,
	type HasOneMethod,
	type HasManyMethod,
} from './types.js'

// Query types for typed filter/orderBy
export {
	type EntityWhere,
	type EntityOrderBy,
	type ScalarCondition,
	type OrderDirection,
	type TypedHasManyOptions,
	type AliasOptions,
} from './queryTypes.js'

// Runtime
export { createSelectionBuilder, getSelectionMeta } from './createSelectionBuilder.js'
export { createFragment } from './createFragment.js'
export { buildQueryFromSelection, collectPaths, type QuerySpec, type QueryFieldSpec } from './buildQuery.js'
export { SelectionMetaCollector, mergeSelections, createEmptySelection } from './SelectionMetaCollector.js'
export { SelectionScope, type HasManyParams } from './SelectionScope.js'
