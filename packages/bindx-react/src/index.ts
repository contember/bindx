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
	EntityDef,
	InferEntityDef,
	// Role types
	UnionToIntersection,
	RoleNames,
	CommonEntity,
	EntityForRoles,
	ResolveEntity,
	SingleRoleMap,
	DefaultRole,
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
	OrderDirection,
	TypedHasManyOptions,
	AliasOptions,
	// Handle types
	HasOneRelationState,
	InputProps,
	EntityFields,
	EntityFieldsAccessor,
	EntityFieldsRef,
	ScalarKeys,
	HasManyKeys,
	HasOneKeys,
	FieldRefMeta,
	// Ref types (pointer, no data access)
	FieldRef,
	HasManyRef,
	HasOneRef,
	EntityRef,
	// Accessor types (live data access, extends Ref)
	FieldAccessor,
	HasManyAccessor,
	HasOneAccessor,
	EntityAccessor,
	// Type extraction helpers
	ExtractHasOneEntityName,
	ExtractHasManyEntityName,
	ExtractRoleMap,
	// Adapter types
	BackendAdapter,
	QueryOptions,
	Query,
	GetQuery,
	ListQuery,
	QueryResult,
	GetQueryResult,
	ListQueryResult,
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
	// Event types
	BindxEvent,
	FieldScopedEvent,
	FieldChangingEvent,
	FieldChangedEvent,
	RelationConnectingEvent,
	RelationConnectedEvent,
	RelationDisconnectingEvent,
	RelationDisconnectedEvent,
	RelationDeletingEvent,
	RelationDeletedEvent,
	HasManyConnectingEvent,
	HasManyConnectedEvent,
	HasManyDisconnectingEvent,
	HasManyDisconnectedEvent,
	EntityPersistingEvent,
	EntityPersistedEvent,
	EntityPersistFailedEvent,
	EntityResettingEvent,
	EntityResetEvent,
	EntityDeletingEvent,
	EntityDeletedEvent,
	ErrorAddedEvent,
	ErrorsClearedEvent,
	LoadStateChangedEvent,
	BeforeEvent,
	AfterEvent,
	AnyBindxEvent,
	EventTypeMap,
	InterceptorResult,
	Interceptor,
	EventListener,
	Unsubscribe,
	BeforeEventTypes,
	AfterEventTypes,
} from '@contember/bindx'

export {
	// Schema utilities
	scalar,
	hasOne,
	hasMany,
	defineSchema,
	entityDef,
	roleEntityDef,
	DEFAULT_ROLE,
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
	// ID type detection
	isTempId,
	isPlaceholderId,
	isPersistedId,
	generatePlaceholderId,
	// Persistence
	BatchPersister,
	ChangeRegistry,
	// Undo
	UndoManager,
	// Events
	EventEmitter,
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
	BindxGraphQlClient,
	UseEntityOptions,
	UseEntityListOptions,
	LoadingEntityResult,
	ErrorEntityResult,
	NotFoundEntityResult,
	ReadyEntityResult,
	UseEntityResult,
	LoadingEntityListResult,
	ErrorEntityListResult,
	ReadyEntityListResult,
	UseEntityListResult,
	// Persistence hook types
	PersistApi,
	EntityPersistApi,
	AnyRefWithMeta,
} from './hooks/index.js'

// Persistence types from @contember/bindx
export type {
	DirtyEntity,
	PersistScope,
	AllScope,
	EntityScope as EntityPersistScope,
	FieldsScope,
	RelationScope,
	CustomScope,
	EntityPersistResult,
	PersistenceResult,
	BatchPersistOptions,
} from '@contember/bindx'

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
	SelectionProvider,
	EntityPropKeys,
	EntityFromProp,
	SelectionFromProp,
	ImplicitFragmentProperties,
	// Component builder types
	BindxComponentBase,
	BindxComponent,
	ComponentBuilder,
	ComponentBuilderState,
	CreateComponentOptions,
	// Interface types
	InterfaceEntityPropConfig,
	ImplicitInterfaceEntityConfig,
	ExplicitInterfaceEntityConfig,
	AddInterfaces,
	InterfaceSelectorsMap,
	AnyEntityPropConfig,
	// Entity prop config types
	EntityPropConfig,
	ImplicitEntityConfig,
	ExplicitEntityConfig,
	// State helpers
	AddImplicitEntity,
	AddExplicitEntity,
	AddImplicitInterfaceEntity,
	AddExplicitInterfaceEntity,
	SetScalarProps,
	// Props building
	BuildEntityProps,
	BuildProps,
	BuildFragmentProps,
	InitialBuilderState,
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
	useBatchPersister,
	useBindxContext,
	useSchemaRegistry,
	// Standalone hooks
	useEntity,
	useEntityList,
	// Persistence
	usePersist,
	usePersistEntity,
	// Undo
	useUndo,
	// Events
	useOnEvent,
	useOnEntityEvent,
	useOnFieldEvent,
	useIntercept,
	useInterceptEntity,
	useInterceptField,
	// Ref → Accessor hooks
	useAccessor,
	useField,
	useHasMany,
	useHasOne,
	// Contember
	ContemberBindxProvider,
	schemaNamesToDef,
} from './hooks/index.js'

// Role context
export { RoleProvider, useHasRole, type RoleProviderProps } from './roles/index.js'

// Undo hook types
export type { UndoHookResult } from './hooks/useUndo.js'


// JSX Components
export {
	Attribute,
	type AttributeProps,
	Field,
	HasMany,
	HasOne,
	If,
	Show,
	Entity,
	type EntityProps,
	EntityList,
	type EntityListProps,
	HasRole,
	type HasRoleProps,
	BINDX_COMPONENT,
	SCOPE_REF,
	// Condition DSL for <If> component
	cond,
	type Condition,
	// Component (unified API)
	createComponent,
	withCollector,
	isBindxComponent,
	mergeFragments,
	COMPONENT_MARKER,
	COMPONENT_BRAND,
	COMPONENT_SELECTIONS,
	createComponentBuilder,
	getComponentBrand,
	setBrandValidation,
	validateBrand,
} from './jsx/index.js'

// Entity Scope
export {
	EntityScope,
	useEntityScope,
	useOptionalEntityScope,
	type EntityScopeProps,
} from './components/EntityScope.js'

// ============================================================================
// Internal React API
// ============================================================================

export {
	SelectionMetaCollector,
	mergeSelections,
	createEmptySelection,
	createCollectorProxy,
	analyzeJsx,
	collectSelection,
	convertToQuerySelection,
	debugSelection,
} from './jsx/index.js'
