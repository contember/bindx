/**
 * React Bindx - Type-safe React data binding framework
 *
 * @packageDocumentation
 */

// ============================================================================
// Re-export core types and functions from @contember/bindx
// ============================================================================

export type {
	// Schema types
	RelationType,
	ScalarFieldDef,
	HasOneRelationDef,
	HasManyRelationDef,
	FieldDef,
	EntitySchemaDef,
	SchemaDefinition,
	InferModel,
	InferEntityNames,
	// Selection types
	SelectionBuilder,
	SelectionMeta,
	SelectionFieldMeta,
	FluentFragment,
	FluentDefiner,
	HasManyOptions,
	InferSelection,
	QuerySpec,
	QueryFieldSpec,
	// Query types (typed filter/orderBy)
	EntityWhere,
	EntityOrderBy,
	ScalarCondition,
	StringCondition,
	ConditionFor,
	OrderDirection,
	TypedHasManyOptions,
	AliasOptions,
	// Accessor types
	FieldAccessor,
	EntityAccessor,
	EntityAccessorBase,
	RootEntityAccessor,
	HasOneAccessor,
	HasOneRelationState,
	PlaceholderEntityAccessor,
	EntityListAccessor,
	EntityListItem,
	AccessorFromShape,
	AccessorFromShapeInternal,
	RelationChange,
	// Handle types
	InputProps,
	EntityFields,
	SelectedEntityFields,
	ScalarKeys,
	HasManyKeys,
	HasOneKeys,
	FieldRefMeta,
	FieldRef,
	HasManyRef,
	HasOneRef,
	EntityRef,
	// Adapter types
	BackendAdapter,
	FetchOptions,
	MockDataStore,
	MockAdapterOptions,
	ContemberAdapterOptions,
	// Core types
	EntityLoadResult,
	EntityListLoadResult,
	LoadEntityOptions,
	LoadEntityListOptions,
	SelectionInput,
	CoreFluentDefiner,
	// Store types
	EntitySnapshot,
	FieldSnapshot,
	HasOneRelationSnapshot,
	HasManySnapshot,
	EntityState,
	LoadStatus,
	// Undo types
	UndoManagerConfig,
	UndoState,
	UndoEntry,
} from '@contember/bindx'

export {
	// Schema utilities
	scalar,
	hasOne,
	hasMany,
	defineSchema,
	SchemaRegistry,
	// Selection utilities
	createFragment,
	buildQueryFromSelection,
	// Handles
	EntityHandle,
	HasOneHandle,
	HasManyListHandle,
	FieldHandle,
	// Handle symbols
	FIELD_REF_META,
	// Adapter
	MockAdapter,
	ContemberAdapter,
	// Core
	createEntityLoader,
	resolveSelectionMeta,
	buildQuery,
	// Store
	SnapshotStore,
	ActionDispatcher,
	PersistenceManager,
	// Undo
	UndoManager,
	// Internal
	__internal,
} from '@contember/bindx'

// ============================================================================
// React-specific types
// ============================================================================

// Hook types
export type {
	BindxProviderProps,
	BindxContextValue,
	UseEntityOptions,
	UseEntityListOptions,
	LoadingEntityAccessor,
	ErrorEntityAccessor,
	ReadyEntityAccessor,
	EntityAccessorResult,
	LoadingEntityListAccessor,
	ErrorEntityListAccessor,
	ReadyEntityListAccessor,
	EntityListAccessorResult,
	// Contember types
	ContemberBindxProviderProps,
	ContemberContextValue,
} from './hooks/index.js'

// JSX types
export type {
	FieldProps,
	HasManyProps,
	HasOneProps,
	IfProps,
	EntityComponentProps,
	HasManyComponentOptions,
	ShowProps,
	SelectionPropMeta,
	EntityPropKeys,
	EntityFromProp,
	SelectionFromProp,
	ImplicitFragmentProperties,
} from './jsx/index.js'

// ============================================================================
// React-specific functions & components
// ============================================================================

// Hooks
export {
	BindxProvider,
	useBackendAdapter,
	useSnapshotStore,
	useDispatcher,
	usePersistence,
	useBindxContext,
	useIdentityMap,
	createBindx,
	// Undo
	useUndo,
	// Contember
	ContemberBindxProvider,
	useContember,
	useContemberBindxContext,
	useContemberSessionToken,
	useSetContemberSessionToken,
	useContemberApiBaseUrl,
	useContemberProject,
	useContemberStage,
} from './hooks/index.js'

// Undo hook types
export type { UndoHookResult } from './hooks/useUndo.js'

// JSX Components
export {
	Field,
	HasMany,
	HasOne,
	If,
	Show,
	Entity,
	type EntityProps,
	BINDX_COMPONENT,
	// Component (unified API)
	createComponent,
	isBindxComponent,
	mergeFragments,
	COMPONENT_MARKER,
	COMPONENT_SELECTIONS,
} from './jsx/index.js'

// ============================================================================
// Internal React API
// ============================================================================

export {
	SelectionMetaCollector,
	mergeSelections,
	createEmptySelection,
	toSelectionMeta,
	fromSelectionMeta,
	createCollectorProxy,
	createRuntimeAccessor,
	analyzeJsx,
	collectSelection,
	convertToQuerySelection,
	debugSelection,
} from './jsx/index.js'
