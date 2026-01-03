// Selection - fluent type-safe query building
export {
	createSelectionBuilder,
	getSelectionMeta,
	createFragment,
	buildQueryFromSelection,
	collectPaths,
	SELECTION_META,
	type SelectionBuilder,
	type SelectionMeta,
	type SelectionFieldMeta,
	type FluentFragment,
	type FluentDefiner,
	type HasManyOptions,
	type InferSelection,
	type QuerySpec,
	type QueryFieldSpec,
} from './selection/index.js'

// Accessors - data read/write
export {
	type FieldAccessor,
	type EntityAccessor,
	type EntityAccessorBase,
	type RootEntityAccessor,
	type HasOneAccessor,
	type HasOneRelationState,
	type PlaceholderEntityAccessor,
	type EntityListAccessor,
	type EntityListItem,
	type AccessorFromShape,
	type AccessorFromShapeInternal,
	type RelationChange,
	FieldAccessorImpl,
	EntityAccessorImpl,
	EntityListAccessorImpl,
	HasOneAccessorImpl,
	PlaceholderEntityAccessorImpl,
	isPlaceholder,
} from './accessors/index.js'

// Store - identity map
export { IdentityMap, getNestedValue, type EntityRecord } from './store/index.js'

// Hooks - React integration
export {
	BindxProvider,
	useBackendAdapter,
	useIdentityMap,
	useBindxContext,
	createBindx,
	type BindxProviderProps,
	type UseEntityOptions,
	type UseEntityListOptions,
	type LoadingEntityAccessor,
	type LoadingEntityListAccessor,
	type EntitySchema,
} from './hooks/index.js'

// Adapter - backend interface
export { type BackendAdapter, MockAdapter, type MockDataStore, type MockAdapterOptions } from './adapter/index.js'

// Core - non-React services
export {
	EntityLoader,
	createEntityLoader,
	resolveSelectionMeta,
	buildQuery,
	type EntityLoadResult,
	type EntityListLoadResult,
	type LoadEntityOptions,
	type LoadEntityListOptions,
	type SelectionInput,
	type FluentDefiner as CoreFluentDefiner,
} from './core/index.js'

// JSX Components - two-pass type-safe approach
export {
	// Types
	BINDX_COMPONENT,
	FIELD_REF_META,
	type FieldRefMeta,
	type FieldRef,
	type HasManyRef,
	type HasOneRef,
	type EntityRef,
	type EntityFields,
	type FieldProps,
	type HasManyProps,
	type HasOneProps,
	type IfProps,
	type EntityComponentProps,
	type JsxSelectionMeta,
	type JsxSelectionFieldMeta,
	type HasManyComponentOptions,
	type ShowProps,
	// Selection
	SelectionMetaCollector,
	mergeSelections,
	createEmptySelection,
	toSelectionMeta,
	fromSelectionMeta,
	// Proxy
	createCollectorProxy,
	createRuntimeAccessor,
	// Analyzer
	analyzeJsx,
	collectSelection,
	convertToQuerySelection,
	debugSelection,
	// Components
	Field,
	HasMany,
	HasOne,
	If,
	Show,
	Entity,
	type EntityProps,
} from './jsx/index.js'
